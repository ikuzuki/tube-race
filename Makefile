.PHONY: install lint format test build-graph web-install web-dev web-build web-test check

install:
	uv venv
	uv pip install -e ".[dev]"
	pre-commit install

lint:
	ruff check pipeline/
	mypy pipeline/tube_pipeline/

format:
	ruff check --fix pipeline/
	ruff format pipeline/

test:
	pytest

build-graph:
	python -m tube_pipeline.cli build --out web/public/data/graph.json

web-install:
	cd web && npm install

web-dev:
	cd web && npm run dev

web-build:
	cd web && npm run build

web-test:
	cd web && npm run test

check: lint test web-test
