import os
import jwt
from jwt import PyJWKClient
from flask import request, g, jsonify
from functools import wraps

_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        supabase_url = os.environ.get('SUPABASE_URL', '')
        jwks_url = f"{supabase_url}/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(jwks_url, cache_keys=True)
    return _jwks_client


def verify_jwt(token: str) -> dict:
    client = _get_jwks_client()
    signing_key = client.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=['ES256', 'RS256', 'HS256'],
        audience='authenticated',
    )


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
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
        return f(*args, **kwargs)
    return decorated
