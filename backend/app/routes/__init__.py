from flask import Flask


def register_blueprints(app: Flask) -> None:
    import os
    from .auth import auth_bp
    from .users import users_bp
    from .places import places_bp
    from .plans import plans_bp
    from .social import social_bp
    from .interests import interests_bp
    from .joins import joins_bp
    from .invite_links import invite_links_bp
    from .feed import feed_bp
    from .analytics import analytics_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(places_bp)
    app.register_blueprint(plans_bp)
    app.register_blueprint(social_bp)
    app.register_blueprint(interests_bp)
    app.register_blueprint(joins_bp)
    app.register_blueprint(invite_links_bp)
    app.register_blueprint(feed_bp)
    app.register_blueprint(analytics_bp)

    if os.environ.get("FLASK_DEBUG") or os.environ.get("FLASK_ENV") == "development":
        from .dev import dev_bp
        app.register_blueprint(dev_bp)
