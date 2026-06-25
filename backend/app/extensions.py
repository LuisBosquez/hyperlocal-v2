import os

from flask import current_app

_supabase = None


def get_supabase():
    """Return the data client. With USE_LOCAL_DB=1 (dev), this is the SQLite-backed
    shim from devdb.py — same query surface, zero external services. Otherwise it is
    the real supabase-py client (production path)."""
    global _supabase
    if os.environ.get('USE_LOCAL_DB') == '1':
        from .devdb import get_fake_supabase
        return get_fake_supabase()
    if _supabase is None:
        from supabase import create_client
        _supabase = create_client(
            current_app.config['SUPABASE_URL'],
            current_app.config['SUPABASE_SERVICE_ROLE_KEY'],
        )
    return _supabase
