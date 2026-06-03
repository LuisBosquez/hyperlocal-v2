import pytest
from app import create_app


@pytest.fixture
def app():
    return create_app({
        'TESTING': True,
        'SUPABASE_URL': 'https://test.supabase.co',
        'SUPABASE_ANON_KEY': 'test-anon-key',
        'SUPABASE_SERVICE_ROLE_KEY': 'test-service-role-key',
        'SUPABASE_JWT_SECRET': 'test-jwt-secret',
        'ALLOWED_ORIGINS': ['http://localhost:5173'],
    })


@pytest.fixture
def client(app):
    return app.test_client()


def test_health(client):
    response = client.get('/health')
    assert response.status_code == 200
    data = response.get_json()
    assert data['status'] == 'ok'
