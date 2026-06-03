from supabase import create_client, Client
from flask import current_app

_supabase: Client | None = None


def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(
            current_app.config['SUPABASE_URL'],
            current_app.config['SUPABASE_SERVICE_ROLE_KEY'],
        )
    return _supabase
