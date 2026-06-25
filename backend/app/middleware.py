import os
from functools import wraps

import jwt
from jwt import PyJWKClient
from flask import request, g, jsonify

_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        supabase_url = os.environ.get('SUPABASE_URL', '')
        jwks_url = f"{supabase_url}/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(jwks_url, cache_keys=True)
    return _jwks_client


def _is_dev() -> bool:
    return os.environ.get('FLASK_ENV') == 'development' or os.environ.get('USE_LOCAL_DB') == '1'


def verify_jwt(token: str) -> dict:
    # Dev tokens are HS256-signed with the shared secret (see routes/dev.py) —
    # no GoTrue/JWKS round-trip, works fully offline.
    if _is_dev():
        secret = os.environ.get('SUPABASE_JWT_SECRET', '')
        return jwt.decode(token, secret, algorithms=['HS256'], audience='authenticated')
    client = _get_jwks_client()
    signing_key = client.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=['ES256', 'RS256', 'HS256'],
        audience='authenticated',
    )


def _authenticate() -> tuple | None:
    """Populate g.user_id from the Authorization header. Returns an error
    response tuple on failure, None on success."""
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return jsonify({'data': None, 'error': {'code': 'UNAUTHORIZED'}}), 401
    token = auth_header.split(' ', 1)[1]
    try:
        payload = verify_jwt(token)
        g.user_id = payload['sub']
        g.jwt_payload = payload
    except jwt.ExpiredSignatureError:
        return jsonify({'data': None, 'error': {'code': 'TOKEN_EXPIRED'}}), 401
    except jwt.InvalidTokenError:
        return jsonify({'data': None, 'error': {'code': 'INVALID_TOKEN'}}), 401
    return None


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        error = _authenticate()
        if error:
            return error
        return f(*args, **kwargs)
    return decorated


def optional_auth(f):
    """Like require_auth, but anonymous requests pass through with g.user_id = None.
    Used by public surfaces (landing, profiles, invite links) that render
    differently for authenticated viewers."""
    @wraps(f)
    def decorated(*args, **kwargs):
        g.user_id = None
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            error = _authenticate()
            if error:
                return error
        return f(*args, **kwargs)
    return decorated
