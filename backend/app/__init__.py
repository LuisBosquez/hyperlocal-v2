import logging

from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv('.env')

from .config import Config

logger = logging.getLogger(__name__)


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

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({'data': None, 'error': {'code': 'NOT_FOUND'}}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({'data': None, 'error': {'code': 'METHOD_NOT_ALLOWED'}}), 405

    @app.errorhandler(Exception)
    def internal_error(e):
        # tech/08 X.6: uncaught errors return the standard envelope, never HTML
        logger.exception('unhandled error')
        return jsonify({'data': None, 'error': {'code': 'INTERNAL_ERROR'}}), 500

    return app
