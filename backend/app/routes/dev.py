# DEV ONLY — never ship to production (registered only when FLASK_ENV=development)
import os
import time

import jwt
from flask import Blueprint, jsonify

from ..errors import ok

# Prefixed under /api/v1 so the Vite proxy covers it.
dev_bp = Blueprint("dev", __name__, url_prefix="/api/v1/dev")

DEV_USERS = {
    "alice@dev.local":  "00000000-0000-0000-0000-000000000001",
    "bob@dev.local":    "00000000-0000-0000-0000-000000000002",
    "carlos@dev.local": "00000000-0000-0000-0000-000000000003",
    "dana@dev.local":   "00000000-0000-0000-0000-000000000004",
    # A blank account for walking the onboarding flow (J1)
    "newuser@dev.local": "00000000-0000-0000-0000-000000000005",
}

TOKEN_TTL = 12 * 3600  # long enough for a full dev session


@dev_bp.route("/token/<user_email>", methods=["GET"])
def get_dev_token(user_email):
    """Return a signed JWT for a seed user. Verified by middleware via HS256
    with the shared secret — no GoTrue round-trip, works fully offline."""
    user_id = DEV_USERS.get(user_email)
    if not user_id:
        return jsonify({"error": f"No dev UUID mapped for {user_email}"}), 400

    secret = os.environ.get("SUPABASE_JWT_SECRET")
    if not secret:
        return jsonify({"error": "SUPABASE_JWT_SECRET not set"}), 500

    now = int(time.time())
    payload = {
        "iss": "supabase", "aud": "authenticated", "sub": user_id,
        "email": user_email, "role": "authenticated",
        "iat": now, "exp": now + TOKEN_TTL,
    }
    access_token = jwt.encode(payload, secret, algorithm="HS256")
    return jsonify({
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": TOKEN_TTL,
        "expires_at": now + TOKEN_TTL,
        "user": {"id": user_id, "email": user_email, "role": "authenticated"},
        "refresh_token": None,
    })


@dev_bp.route("/run-reminders", methods=["POST"])
def run_reminders_now():
    """Manually trigger the reminder cron (tech/09). Lets you demo the
    materialization nudges without waiting for a scheduled run."""
    from ..jobs.reminders import run_reminders
    return ok(run_reminders())


@dev_bp.route("/reset-db", methods=["POST"])
def reset_db():
    """Wipe and reseed the local dev database."""
    if os.environ.get("USE_LOCAL_DB") != "1":
        return jsonify({"error": "Only available with USE_LOCAL_DB=1"}), 400
    from .. import devdb
    devdb.reset()
    devdb.get_fake_supabase()  # re-bootstrap + seed
    return ok({"reset": True})
