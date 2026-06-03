from app import create_app
from mangum import Mangum
from asgiref.wsgi import WsgiToAsgi

_flask_app = create_app()
_asgi_app = WsgiToAsgi(_flask_app)
handler = Mangum(_asgi_app, lifespan="off")
