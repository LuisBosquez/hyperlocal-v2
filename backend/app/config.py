import os


class Config:
    SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
    SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY', '')
    SUPABASE_SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    SUPABASE_JWT_SECRET = os.environ.get('SUPABASE_JWT_SECRET', '')
    GOOGLE_PLACES_API_KEY = os.environ.get('GOOGLE_PLACES_API_KEY', '')
    OPENWEATHER_API_KEY = os.environ.get('OPENWEATHER_API_KEY', '')
    MAPBOX_TOKEN = os.environ.get('MAPBOX_TOKEN', '')
    POSTHOG_PROJECT_API_KEY = os.environ.get('POSTHOG_PROJECT_API_KEY', '')
    POSTHOG_HOST = os.environ.get('POSTHOG_HOST', 'https://us.posthog.com')
    FLASK_ENV = os.environ.get('FLASK_ENV', 'production')
    ALLOWED_ORIGINS = [
        o.strip()
        for o in os.environ.get('ALLOWED_ORIGINS', 'http://localhost:5173').split(',')
        if o.strip()
    ]
