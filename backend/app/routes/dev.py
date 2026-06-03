# DEV ONLY — never ship to production
import os
import time
import jwt
from flask import Blueprint, jsonify

dev_bp = Blueprint("dev", __name__, url_prefix="/dev")

JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET")

DEV_USERS = {
    "alice@dev.local":  "00000000-0000-0000-0000-000000000001",
    "bob@dev.local":    "00000000-0000-0000-0000-000000000002",
    "carlos@dev.local": "00000000-0000-0000-0000-000000000003",
}

# Token lifetime: 1 hour (enough for a dev session)
TOKEN_TTL = 3600


@dev_bp.route("/token/<user_email>", methods=["GET"])
def get_dev_token(user_email):
    """
    Return a signed Supabase JWT for a seed user. Dev only.
    Bypasses GoTrue entirely — the seed SQL rows have no instance_id so
    the admin API can't find them, but a JWT signed with the JWT secret
    is valid for PostgREST and the app's auth middleware.
    """
    user_id = DEV_USERS.get(user_email)
    if not user_id:
        return jsonify({"error": f"No dev UUID mapped for {user_email}"}), 400

    if not JWT_SECRET:
        return jsonify({"error": "SUPABASE_JWT_SECRET not set"}), 500

    now = int(time.time())
    payload = {
        "iss": "supabase",
        "aud": "authenticated",
        "sub": user_id,
        "email": user_email,
        "role": "authenticated",
        "iat": now,
        "exp": now + TOKEN_TTL,
    }

    access_token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")

    return jsonify({
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": TOKEN_TTL,
        "expires_at": now + TOKEN_TTL,
        "user": {
            "id": user_id,
            "email": user_email,
            "role": "authenticated",
        },
        # No refresh_token — GoTrue doesn't know about these users.
        # Re-hit this endpoint when the token expires.
        "refresh_token": None,
    })
