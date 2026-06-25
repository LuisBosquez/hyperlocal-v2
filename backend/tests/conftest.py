import os
import time

import jwt
import pytest

TEST_DB = '/tmp/hyperlocal_test.db'
TEST_SECRET = 'test-jwt-secret-for-pytest-only'

os.environ['USE_LOCAL_DB'] = '1'
os.environ['DEV_DB_PATH'] = TEST_DB
os.environ['FLASK_ENV'] = 'development'
os.environ['SUPABASE_JWT_SECRET'] = TEST_SECRET
os.environ['GOOGLE_PLACES_API_KEY'] = ''   # force local search fallback in tests
os.environ['OPENWEATHER_API_KEY'] = ''

from app import devdb  # noqa: E402

ALICE = devdb.U_ALICE
BOB = devdb.U_BOB
CARLOS = devdb.U_CARLOS
DANA = devdb.U_DANA
NEWUSER = '00000000-0000-0000-0000-000000000005'


@pytest.fixture()
def app():
    devdb.reset(TEST_DB)
    from app import create_app
    application = create_app({'TESTING': True})
    yield application
    devdb.reset(TEST_DB)


@pytest.fixture()
def client(app):
    return app.test_client()


def token_for(user_id: str) -> str:
    now = int(time.time())
    return jwt.encode(
        {'iss': 'supabase', 'aud': 'authenticated', 'sub': user_id,
         'email': 'x@dev.local', 'role': 'authenticated', 'iat': now, 'exp': now + 3600},
        TEST_SECRET, algorithm='HS256',
    )


def auth(user_id: str) -> dict:
    return {'Authorization': f'Bearer {token_for(user_id)}'}


@pytest.fixture()
def as_alice():
    return auth(ALICE)


@pytest.fixture()
def as_bob():
    return auth(BOB)


@pytest.fixture()
def as_carlos():
    return auth(CARLOS)


@pytest.fixture()
def as_dana():
    return auth(DANA)


@pytest.fixture()
def as_newuser():
    return auth(NEWUSER)
