from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv('.env')

from .config import Config


def create_app(config_overrides: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)
    if config_overrides:
        app.config.update(config_overrides)

    origins = app.config['ALLOWED_ORIGINS']
    CORS(app, origins=origins, allow_headers=['Content-Type', 'Authorization'])

    from .routes import register_blueprints
    register_blueprints(app)

    @app.route('/health')
    def health():
        return jsonify({'status': 'ok'}), 200

    return app
