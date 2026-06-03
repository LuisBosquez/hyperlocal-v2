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

### Backend

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
