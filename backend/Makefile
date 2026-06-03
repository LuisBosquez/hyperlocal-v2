.PHONY: run test lint format install

install:
	python3.12 -m venv venv
	venv/bin/pip install -r requirements-dev.txt

run:
	FLASK_APP=app FLASK_DEBUG=1 venv/bin/flask run --port 5001

test:
	venv/bin/pytest tests/ -v

lint:
	venv/bin/flake8 app/ handler.py --max-line-length 100

format:
	venv/bin/black app/ handler.py tests/

deploy-dev:
	cd .. && sam build && sam deploy --config-env default

deploy-prod:
	cd .. && sam build && sam deploy --config-env prod
