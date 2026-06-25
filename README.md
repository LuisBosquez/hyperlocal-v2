# Hyperlocal v2

A mobile-first social planning app. Save places, create lightweight plans, and let friends opt in organically.

## Monorepo structure

```
hyperlocal-v2/
├── frontend/     React SPA — Vite + React 18 + TypeScript + Tailwind
├── backend/      Flask API — Python 3.12, deployed to AWS Lambda via Mangum
├── pm/           Product management docs (specs, user stories, vision)
└── tech/         Technical design docs (architecture, schema, API design, infra)
```

## Local dev quickstart

### Zero-config dev mode (no external services)

The app runs fully offline — no hosted Supabase, no Google OAuth — using an in-process
SQLite data layer (`backend/app/devdb.py`) and seed users. This is the fastest way to
click through every Alpha journey.

```bash
# 1. Backend (terminal 1)
cd backend
python3.12 -m venv venv && source venv/bin/activate
pip install -r requirements-dev.txt
# .env already sets FLASK_ENV=development and USE_LOCAL_DB=1
flask --app app run --port 5001

# 2. Frontend (terminal 2)
cd frontend
npm install
# frontend/.env sets VITE_DEV_AUTH=1 (dev sign-in) and VITE_API_BASE_URL= (Vite proxies /api)
npm run dev          # http://localhost:5173
```

Open http://localhost:5173 and pick a seed account (Alice, Bob, Carlos, Dana, or a blank
new user). The SQLite DB seeds itself with a Seattle social graph on first run.

**Dev-only helpers (FLASK_ENV=development):**
- `GET  /api/v1/dev/token/<email>` — mint a JWT for a seed user (the dev sign-in uses this).
- `POST /api/v1/dev/run-reminders` — trigger the reminder cron immediately (see the
  materialization nudges without waiting). Returns `{day_before, morning_of, date_passed}`.
- `POST /api/v1/dev/reset-db` — wipe and reseed the local database.

Mapbox and Google Places work if their keys are set in `.env` (search hits live Google
Places and caches locally); without them, search falls back to the seeded place cache and
the map shows a placeholder. Everything else works regardless.

Run the backend journey tests with `cd backend && venv/bin/python -m pytest tests/ -q`.

### Backend (hosted Supabase)

```bash
cd backend
python3.12 -m venv venv && source venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env.local      # fill in your values
flask --app app run --port 5001 --debug
# API available at http://localhost:5001/api/v1/
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local      # fill in your values
npm run dev
# App available at http://localhost:5173
```

The Vite dev server proxies `/api` → `http://localhost:5001`, so no CORS config needed locally.

## Environment variables

| File | Reference |
|---|---|
| `backend/.env.example` | All required Flask/Lambda env vars |
| `frontend/.env.example` | All required Vite env vars |

See [tech/03-infrastructure.md](tech/03-infrastructure.md) for the full variable reference and where each one lives in production.
