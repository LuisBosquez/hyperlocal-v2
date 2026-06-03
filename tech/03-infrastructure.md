# Infrastructure — Hyperlocal MVP-1

> **Audience:** AI agents and engineers setting up the deployment environment as discrete tasks.
> **Status:** Design-complete, pre-implementation.
> **Last updated:** 2026-05-15

Each section is a self-contained implementation unit. An agent can implement any section independently given the environment variable table in Section 2.

---

## 1. AWS Architecture

### 1.1 Region Strategy

All compute and database infrastructure runs in **`us-east-1`** (N. Virginia).

| Service | Region | Reason |
|---|---|---|
| AWS Lambda | us-east-1 | Matches Supabase DB region → <5ms DB round trips |
| AWS API Gateway | us-east-1 | Co-located with Lambda |
| AWS Amplify | Global CDN | Static assets; origin in us-east-1 |
| Supabase Postgres | us-east-1 | Selected at project creation; cannot be changed |

Supabase's us-east-1 region maps to AWS us-east-1. Lambda in the same region avoids cross-region latency on every DB call. This is the primary reason for this region choice.

### 1.2 Lambda Function

**One Lambda function** serves the entire Flask API. Mangum translates the Lambda event/context into an ASGI-compatible request; asgiref converts Flask's WSGI app to ASGI.

**Configuration:**

| Setting | Value | Notes |
|---|---|---|
| Runtime | Python 3.12 | Latest stable; matches local dev |
| Handler | `app.handler` | The Mangum `handler` object in `app.py` |
| Memory | 512 MB | Increase to 1024 MB if cold start > 1s |
| Timeout | 29 seconds | API Gateway enforces 30s max; 1s headroom |
| Architecture | arm64 (Graviton2) | ~20% cheaper + faster than x86 for Python |
| Ephemeral storage | 512 MB | Default; sufficient for MVP-1 |
| VPC | None | Supabase is external; no VPC peering needed |
| Concurrency | Unreserved | Let Lambda scale freely at MVP-1 traffic |

**`app.py` entry point:**

```python
from flask import Flask
from mangum import Mangum
from asgiref.wsgi import WsgiToAsgi

flask_app = Flask(__name__)

# Register all blueprints here
from api.routes import register_routes
register_routes(flask_app)

# Convert Flask (WSGI) → ASGI for Mangum
asgi_app = WsgiToAsgi(flask_app)

# Lambda handler — Mangum wraps the ASGI app
handler = Mangum(asgi_app, lifespan="off")
```

**Required Python packages (add to `requirements.txt`):**

```
flask>=3.0
mangum>=0.17
asgiref>=3.7
supabase>=2.0          # Supabase Python client
PyJWT>=2.8             # JWT verification
flask-cors>=4.0
posthog>=3.0           # PostHog Python SDK
httpx>=0.27            # For Google Places + OpenWeather HTTP calls
```

**Dependencies layer vs inline:** For MVP-1, bundle all dependencies into the deployment package (SAM builds this automatically). If cold start becomes an issue, split into a Lambda Layer.

### 1.3 API Gateway (REST API)

Use **REST API** type (not HTTP API) — REST API supports stage variables, usage plans, and per-method throttling needed as traffic grows.

**Resource structure:**

```
/api
  /v1
    /{proxy+}    ANY  → Lambda (hyperlocal-api)
```

A single `/{proxy+}` catch-all resource routes all requests to Flask, which handles its own routing internally via Blueprints.

**CORS configuration (on API Gateway):**

```
Access-Control-Allow-Origin:  https://app.hyperlocal.xyz   (prod)
                              http://localhost:5173         (dev stage only)
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
```

Flask-CORS also sets these headers — the API Gateway CORS config serves as a belt-and-suspenders fallback for preflight requests.

**Stages:**

| Stage | URL | Lambda alias/version | Purpose |
|---|---|---|---|
| `prod` | `https://<id>.execute-api.us-east-1.amazonaws.com/prod` | `$LATEST` | Production |
| `dev` | `https://<id>.execute-api.us-east-1.amazonaws.com/dev` | `$LATEST` | Development/testing |

Custom domain (once configured): `api.hyperlocal.xyz` mapped to the `prod` stage via API Gateway custom domain + ACM certificate.

**Throttling (starter values — adjust after load testing):**

| Setting | Value |
|---|---|
| Default burst limit | 500 requests/s |
| Default rate limit | 1000 requests/s |
| Per-IP throttle | Not configured at MVP-1 (add if abuse observed) |

### 1.4 AWS Amplify (React SPA)

Amplify hosts the compiled React SPA as a static site with CDN distribution.

**Amplify app settings:**

| Setting | Value |
|---|---|
| Source | GitHub repository, `main` branch |
| Build framework | Vite (auto-detected) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | 20.x |

**`amplify.yml` (place in repo root):**

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

**SPA redirect rule** (required for React Router — all paths return `index.html`):

In Amplify Console → Rewrites and Redirects:

```
Source:      </^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>
Target:      /index.html
Type:        200 (Rewrite)
```

**Preview environments:** Amplify auto-creates preview URLs for every pull request. Enable in Amplify Console → Previews → Enable pull request previews.

**Custom domain:** Once DNS is configured, add `app.hyperlocal.xyz` in Amplify Console → Domain Management. Amplify provisions the ACM certificate automatically.

---

## 2. Environment Variables

All secrets are managed externally — never committed to source control. Each variable lists exactly where it lives.

### 2.1 Complete Variable Reference

| Variable | Example Value | Flask (Lambda) | React (Amplify) | Notes |
|---|---|---|---|---|
| `SUPABASE_URL` | `https://abcdef.supabase.co` | ✅ | ✅ | Public — same value in both |
| `SUPABASE_ANON_KEY` | `eyJhbGci...` | ❌ | ✅ | Public anon key — client only |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` | ✅ | ❌ | **Never expose to client** |
| `SUPABASE_JWT_SECRET` | `your-jwt-secret` | ✅ | ❌ | From Supabase → Settings → API |
| `GOOGLE_PLACES_API_KEY` | `AIzaSy...` | ✅ | ❌ | Restrict to server IP in GCP |
| `OPENWEATHER_API_KEY` | `abc123...` | ✅ | ❌ | Used for contextual suggestions |
| `MAPBOX_PUBLIC_TOKEN` | `pk.eyJ1...` | ❌ | ✅ | Scope-restricted to URL domain |
| `POSTHOG_PUBLIC_KEY` | `phc_abc...` | ❌ | ✅ | Browser-side event capture |
| `POSTHOG_PROJECT_API_KEY` | `phc_xyz...` | ✅ | ❌ | Server-side event capture |
| `POSTHOG_HOST` | `https://us.posthog.com` | ✅ | ✅ | Same for both |
| `ALLOWED_ORIGINS` | `https://app.hyperlocal.xyz` | ✅ | ❌ | Flask-CORS allowlist |
| `FLASK_ENV` | `production` | ✅ | ❌ | Disables debug mode |

### 2.2 Where to Set Each Variable

**Lambda environment variables:**
- AWS Console → Lambda → `hyperlocal-api` → Configuration → Environment variables
- Or set in `samconfig.toml` as `ParameterOverrides` (values read from AWS Systems Manager Parameter Store)
- Preferred for secrets: store in **AWS Systems Manager Parameter Store** (SecureString), reference in SAM template

**Amplify environment variables:**
- Amplify Console → App Settings → Environment variables
- Set `VITE_` prefix for all React variables (Vite convention; Amplify passes them at build time)
- Example: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MAPBOX_PUBLIC_TOKEN`

**In React code:**
```javascript
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
```

### 2.3 Flask JWT Verification

Flask verifies Supabase JWTs on every authenticated request using `SUPABASE_JWT_SECRET`:

```python
import jwt
from flask import request, g, jsonify
from functools import wraps
import os

JWT_SECRET = os.environ['SUPABASE_JWT_SECRET']

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'data': None, 'error': {'code': 'UNAUTHORIZED'}}), 401
        token = auth_header.split(' ', 1)[1]
        try:
            payload = jwt.decode(
                token,
                JWT_SECRET,
                algorithms=['HS256'],
                audience='authenticated'
            )
            g.user_id = payload['sub']
        except jwt.ExpiredSignatureError:
            return jsonify({'data': None, 'error': {'code': 'TOKEN_EXPIRED'}}), 401
        except jwt.InvalidTokenError:
            return jsonify({'data': None, 'error': {'code': 'INVALID_TOKEN'}}), 401
        return f(*args, **kwargs)
    return decorated
```

---

## 3. Supabase Project Setup Checklist

Each item is independently actionable. Complete in order.

### 3.1 Create Supabase Project

```
1. Go to supabase.com → New Project
2. Organization: hyperlocal
3. Project name: hyperlocal-prod
4. Database password: [generate strong password, save to password manager]
5. Region: East US (North Virginia) [us-east-1 equivalent in Supabase UI]
6. Pricing plan: Free tier (MVP-1); upgrade to Pro before launch
7. Click Create New Project — wait ~2 min for provisioning
```

After creation, note these values from Settings → API:

- **Project URL:** `https://<project-ref>.supabase.co`
- **Anon public key:** `eyJhbGci...` (safe for client)
- **Service role key:** `eyJhbGci...` (**never expose**)
- **JWT Secret:** (Settings → API → JWT Settings)

### 3.2 Enable Google OAuth Provider

```
Supabase Dashboard → Authentication → Providers → Google
  ↓
Enable Google provider: ON

Required values from Google Cloud Console:
  Client ID:     [from GCP OAuth 2.0 credentials]
  Client Secret: [from GCP OAuth 2.0 credentials]

In Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client:
  Authorized redirect URIs: https://<project-ref>.supabase.co/auth/v1/callback

In Supabase → Authentication → URL Configuration:
  Site URL:             https://app.hyperlocal.xyz
  Additional redirect URLs:
    https://app.hyperlocal.xyz/**
    http://localhost:5173/**    (for local dev)
```

### 3.3 Configure Supabase Auth Settings

```
Authentication → Settings:
  ✅ Enable email confirmations: OFF (Google OAuth only for MVP-1)
  ✅ JWT expiry: 3600 (1 hour)
  ✅ Refresh token reuse interval: 10 seconds
  ✅ Enable anonymous sign-ins: OFF (require Google auth)
```

### 3.4 Apply Database Schema

Run the full DDL from [`tech/02-database-schema.md`](./02-database-schema.md) in the Supabase SQL editor or via the Supabase CLI.

```bash
# Via Supabase CLI (preferred — enables version-controlled migrations)
supabase db push
```

Apply in the migration order specified at the end of `02-database-schema.md`.

### 3.5 Enable Realtime

```
Supabase Dashboard → Database → Replication → Supabase Realtime

Enable replication for these tables:
  ✅ notifications
  ✅ plans
  ✅ plan_interests
  ✅ plan_joins
  ✅ follows
```

### 3.6 Configure Row-Level Security

After applying the schema DDL (which includes RLS policies), verify in:

```
Database → Tables → [each table] → RLS tab
  → Confirm "Row Level Security is enabled"
  → Confirm all expected policies are listed
```

Run this verification query to confirm no table is missing RLS:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- All rows should show rowsecurity = true
```

### 3.7 Set Up Supabase Storage (Profile Photos)

```
Storage → New bucket
  Name: avatars
  Public: YES (profile photos are publicly readable by URL)
  File size limit: 5MB
  Allowed MIME types: image/jpeg, image/png, image/webp

Storage policy (in SQL editor):
  -- Users can upload to their own folder only
  CREATE POLICY "avatars_upload_own" ON storage.objects
    FOR INSERT WITH CHECK (
      bucket_id = 'avatars'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );

  -- Public read
  CREATE POLICY "avatars_public_read" ON storage.objects
    FOR SELECT USING (bucket_id = 'avatars');
```

Profile photo URL pattern: `https://<project-ref>.supabase.co/storage/v1/object/public/avatars/{user_id}/avatar.jpg`

### 3.8 Create a Dev Supabase Project (for local dev)

Repeat steps 3.1–3.7 with name `hyperlocal-dev`. Use separate API keys for the dev environment. Never share dev and prod credentials.

---

## 4. Local Development Setup

### 4.1 Repository Structure

```
hyperlocal-v2/
├── api/                  # Flask backend
│   ├── app.py            # Flask app factory + Mangum handler
│   ├── routes/           # Blueprint modules (auth, plans, places, users, etc.)
│   ├── services/         # Business logic (plans_service.py, places_service.py, etc.)
│   ├── middleware/        # JWT auth decorator, error handlers
│   ├── requirements.txt
│   └── .env.local        # Local env vars (gitignored)
├── web/                  # React frontend
│   ├── src/
│   ├── public/
│   ├── vite.config.ts
│   ├── package.json
│   └── .env.local        # Local env vars (gitignored)
├── supabase/             # Supabase CLI project
│   ├── config.toml
│   └── migrations/       # SQL migration files
├── tech/                 # Technical design docs
├── pm/                   # Product management docs
├── template.yaml         # AWS SAM template
├── samconfig.toml        # SAM deployment config
└── .github/
    └── workflows/
        └── deploy.yml    # GitHub Actions CI/CD
```

### 4.2 Flask Local Setup

```bash
# From /api directory

# Create and activate virtual environment
python3.12 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env.local (gitignored)
cat > .env.local << 'EOF'
SUPABASE_URL=https://<dev-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...     # dev project service role key
SUPABASE_JWT_SECRET=your-dev-jwt-secret
GOOGLE_PLACES_API_KEY=AIzaSy...
OPENWEATHER_API_KEY=abc123
POSTHOG_PROJECT_API_KEY=phc_...
POSTHOG_HOST=https://us.posthog.com
ALLOWED_ORIGINS=http://localhost:5173
FLASK_ENV=development
FLASK_DEBUG=1
EOF

# Run Flask development server
flask --app app run --port 5001 --debug
# API available at http://localhost:5001/api/v1/
```

The `.env.local` file is loaded automatically via `python-dotenv`:

```python
# At top of app.py, before anything else:
from dotenv import load_dotenv
load_dotenv('.env.local')
```

### 4.3 React Local Setup

```bash
# From /web directory

# Install dependencies
npm install

# Create .env.local (gitignored)
cat > .env.local << 'EOF'
VITE_API_BASE_URL=http://localhost:5001/api/v1
VITE_SUPABASE_URL=https://<dev-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...     # dev project anon key
VITE_MAPBOX_PUBLIC_TOKEN=pk.eyJ1...
VITE_POSTHOG_PUBLIC_KEY=phc_...
VITE_POSTHOG_HOST=https://us.posthog.com
EOF

# Start development server
npm run dev
# App available at http://localhost:5173
```

**Vite proxy config** (avoids CORS in local dev by proxying API calls):

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      }
    }
  }
});
```

With this proxy, React calls `/api/v1/...` locally — Vite forwards to Flask. No CORS issues.

### 4.4 Supabase Local Stack (Optional)

For fully offline development (no internet dependency):

```bash
# Install Supabase CLI
brew install supabase/tap/supabase

# From repo root
supabase init           # creates supabase/ directory (if not already)
supabase start          # starts local Postgres, Auth, Realtime, Studio

# Output: local service URLs and keys
# API URL:          http://localhost:54321
# DB URL:           postgresql://postgres:postgres@localhost:54322/postgres
# Studio URL:       http://localhost:54323
# Anon key:         eyJhbGci...  (local)
# Service role key: eyJhbGci...  (local)

# Apply migrations
supabase db push

# Stop local stack
supabase stop
```

Point your local `.env.local` files at the local Supabase stack when doing offline development.

---

## 5. Deployment Pipeline

### 5.1 Flask → Lambda via AWS SAM

**`template.yaml` (SAM template):**

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Globals:
  Function:
    Timeout: 29
    MemorySize: 512
    Architectures: [arm64]
    Runtime: python3.12
    Environment:
      Variables:
        FLASK_ENV: production
        SUPABASE_URL: !Sub '{{resolve:ssm:/hyperlocal/${Stage}/SUPABASE_URL}}'
        SUPABASE_SERVICE_ROLE_KEY: !Sub '{{resolve:ssm:/hyperlocal/${Stage}/SUPABASE_SERVICE_ROLE_KEY:1}}'
        SUPABASE_JWT_SECRET: !Sub '{{resolve:ssm:/hyperlocal/${Stage}/SUPABASE_JWT_SECRET:1}}'
        GOOGLE_PLACES_API_KEY: !Sub '{{resolve:ssm:/hyperlocal/${Stage}/GOOGLE_PLACES_API_KEY:1}}'
        OPENWEATHER_API_KEY: !Sub '{{resolve:ssm:/hyperlocal/${Stage}/OPENWEATHER_API_KEY:1}}'
        POSTHOG_PROJECT_API_KEY: !Sub '{{resolve:ssm:/hyperlocal/${Stage}/POSTHOG_PROJECT_API_KEY:1}}'
        POSTHOG_HOST: 'https://us.posthog.com'
        ALLOWED_ORIGINS: !If [IsProd, 'https://app.hyperlocal.xyz', 'https://dev.hyperlocal.xyz']

Parameters:
  Stage:
    Type: String
    Default: dev
    AllowedValues: [dev, prod]

Conditions:
  IsProd: !Equals [!Ref Stage, prod]

Resources:
  HyperlocalApi:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub 'hyperlocal-api-${Stage}'
      CodeUri: api/
      Handler: app.handler
      Events:
        ApiProxy:
          Type: Api
          Properties:
            RestApiId: !Ref HyperlocalApiGateway
            Path: /api/v1/{proxy+}
            Method: ANY
        ApiRoot:
          Type: Api
          Properties:
            RestApiId: !Ref HyperlocalApiGateway
            Path: /api/v1/
            Method: ANY

  HyperlocalApiGateway:
    Type: AWS::Serverless::Api
    Properties:
      StageName: !Ref Stage
      Cors:
        AllowMethods: "'GET,POST,PUT,PATCH,DELETE,OPTIONS'"
        AllowHeaders: "'Content-Type,Authorization'"
        AllowOrigin: !If [IsProd, "'https://app.hyperlocal.xyz'", "'*'"]

Outputs:
  ApiUrl:
    Value: !Sub 'https://${HyperlocalApiGateway}.execute-api.${AWS::Region}.amazonaws.com/${Stage}/api/v1'
```

**`samconfig.toml`:**

```toml
version = 0.1

[default.deploy.parameters]
stack_name = "hyperlocal-dev"
resolve_s3 = true
s3_prefix = "hyperlocal"
region = "us-east-1"
capabilities = "CAPABILITY_IAM"
parameter_overrides = "Stage=dev"

[prod.deploy.parameters]
stack_name = "hyperlocal-prod"
resolve_s3 = true
s3_prefix = "hyperlocal"
region = "us-east-1"
capabilities = "CAPABILITY_IAM"
parameter_overrides = "Stage=prod"
confirm_changeset = true
```

**Deploy commands:**

```bash
# Build (installs Python deps into deployment package)
sam build

# Deploy to dev
sam deploy --config-env default

# Deploy to prod (requires confirmation)
sam deploy --config-env prod
```

### 5.2 GitHub Actions CI/CD

**`.github/workflows/deploy.yml`:**

```yaml
name: Deploy

on:
  push:
    branches: [main]
    paths: ['api/**']   # Only trigger on backend changes

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install -r api/requirements.txt -r api/requirements-test.txt
      - run: pytest api/tests/

  deploy:
    needs: test
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/setup-sam@v2
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id:     ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - run: sam build
        working-directory: .
      - run: sam deploy --config-env prod --no-confirm-changeset
        working-directory: .
```

**GitHub repository secrets required:**

| Secret | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | IAM user key with Lambda + API Gateway deploy permissions |
| `AWS_SECRET_ACCESS_KEY` | Corresponding secret |

### 5.3 React → Amplify CD

Amplify handles React CI/CD automatically — no GitHub Actions needed.

```
Push to main branch
  → Amplify detects change
  → Runs `npm ci && npm run build`
  → Uploads dist/ to Amplify CDN
  → Invalidates CDN cache
  → New version live (~2-3 min)
```

**Amplify environment variables** (set in Console, not in source code):

| Environment | Variable | Value |
|---|---|---|
| prod | `VITE_API_BASE_URL` | `https://api.hyperlocal.xyz/api/v1` |
| prod | `VITE_SUPABASE_URL` | `https://<prod-ref>.supabase.co` |
| prod | `VITE_SUPABASE_ANON_KEY` | prod anon key |
| prod | `VITE_MAPBOX_PUBLIC_TOKEN` | prod Mapbox token |
| prod | `VITE_POSTHOG_PUBLIC_KEY` | `phc_...` |
| prod | `VITE_POSTHOG_HOST` | `https://us.posthog.com` |
| dev | `VITE_API_BASE_URL` | `https://dev-api.hyperlocal.xyz/api/v1` |
| dev | _(all others)_ | dev project equivalents |

---

## 6. AWS Systems Manager — Secret Storage

Secrets are stored in AWS Systems Manager Parameter Store (SecureString) rather than hardcoded in `template.yaml`. This prevents secrets from appearing in CloudFormation templates or deployment logs.

**Store secrets (one-time setup):**

```bash
# Replace values with real secrets

aws ssm put-parameter \
  --name "/hyperlocal/prod/SUPABASE_SERVICE_ROLE_KEY" \
  --value "eyJhbGci..." \
  --type SecureString \
  --region us-east-1

aws ssm put-parameter \
  --name "/hyperlocal/prod/SUPABASE_JWT_SECRET" \
  --value "your-jwt-secret" \
  --type SecureString \
  --region us-east-1

aws ssm put-parameter \
  --name "/hyperlocal/prod/GOOGLE_PLACES_API_KEY" \
  --value "AIzaSy..." \
  --type SecureString \
  --region us-east-1

aws ssm put-parameter \
  --name "/hyperlocal/prod/OPENWEATHER_API_KEY" \
  --value "abc123" \
  --type SecureString \
  --region us-east-1

aws ssm put-parameter \
  --name "/hyperlocal/prod/POSTHOG_PROJECT_API_KEY" \
  --value "phc_..." \
  --type SecureString \
  --region us-east-1

# Repeat for /hyperlocal/dev/ path with dev values
```

**IAM policy for Lambda execution role** (add to the role SAM creates):

```json
{
  "Effect": "Allow",
  "Action": ["ssm:GetParameter", "ssm:GetParameters"],
  "Resource": "arn:aws:ssm:us-east-1:*:parameter/hyperlocal/*"
}
```

---

## 7. PostHog Setup

PostHog powers all 9 telemetry events defined in the MVP-1 spec. Both client-side (browser) and server-side (Flask) capture is required for data integrity — server-side events are authoritative.

### 7.1 Project Creation

```
1. Go to us.posthog.com → New Project
2. Project name: Hyperlocal
3. Select region: US
4. Note your Project API Key: phc_...
5. Note your Personal API Key (for server-side): phc_...
```

### 7.2 React (Client-Side) Setup

Install and initialize PostHog in the React app:

```bash
npm install posthog-js
```

**`src/lib/posthog.ts`:**

```typescript
import posthog from 'posthog-js';

export function initPostHog() {
  posthog.init(import.meta.env.VITE_POSTHOG_PUBLIC_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST,
    autocapture: false,         // manual capture only — avoid noisy auto events
    capture_pageview: true,     // capture page views automatically
    persistence: 'localStorage',
    loaded: (ph) => {
      if (import.meta.env.DEV) ph.opt_out_capturing();  // no dev events in PostHog
    }
  });
}

export function identifyUser(userId: string, properties: Record<string, string>) {
  posthog.identify(userId, properties);
}

export function captureEvent(event: string, properties?: Record<string, unknown>) {
  posthog.capture(event, properties);
}
```

**Initialize in `src/main.tsx`:**

```typescript
import { initPostHog } from './lib/posthog';
initPostHog();
```

**Identify user after auth:**

```typescript
// After successful login
identifyUser(user.id, {
  handle: user.handle,
  email: user.email,
});
```

### 7.3 Flask (Server-Side) Setup

```bash
pip install posthog
```

**`api/lib/analytics.py`:**

```python
import os
from posthog import Posthog

_client = None

def get_posthog() -> Posthog:
    global _client
    if _client is None:
        _client = Posthog(
            project_api_key=os.environ['POSTHOG_PROJECT_API_KEY'],
            host=os.environ.get('POSTHOG_HOST', 'https://us.posthog.com')
        )
    return _client

def capture(user_id: str, event: str, properties: dict = None):
    if os.environ.get('FLASK_ENV') == 'development':
        return   # suppress events in local dev
    get_posthog().capture(user_id, event, properties or {})
```

### 7.4 Event Instrumentation Map

For each of the 9 required telemetry events, the capture point and owner:

| Event | Captured by | Flask endpoint / React action | Properties |
|---|---|---|---|
| `invite_link_shared` | Flask | `POST /api/v1/invite-links` | `{ plan_id, link_token }` |
| `invite_link_converted` | Flask | `POST /api/v1/auth/complete` (new user via invite) | `{ invite_token, referrer_user_id }` |
| `user_active_session` | Flask | `POST /api/v1/auth/session` (on login + qualifying action) | `{ action_type }` |
| `plan_created` | Flask | `POST /api/v1/plans` | `{ plan_id, has_time: bool, has_date: bool, is_timeless: bool }` |
| `place_saved` | Flask | `POST /api/v1/places/{id}/save` | `{ place_id, category }` |
| `plan_interested` | Flask | `POST /api/v1/plans/{id}/interest` | `{ plan_id, organizer_id }` |
| `plan_joined` | Flask | `POST /api/v1/plans/{id}/join` | `{ plan_id, organizer_id }` |
| `plan_materialized` | Flask | `PATCH /api/v1/plans/{id}` (when time added to timeless plan) | `{ plan_id, days_since_created }` |
| `mutual_connection_formed` | Flask | `POST /api/v1/follows` (when follow creates mutual) | `{ follower_id, followee_id }` |

**Server-side capture example:**

```python
# In Flask route handler for POST /api/v1/plans
from api.lib.analytics import capture

@plans_bp.route('', methods=['POST'])
@require_auth
def create_plan():
    # ... validate and insert plan ...
    capture(g.user_id, 'plan_created', {
        'plan_id': str(plan['id']),
        'has_time': plan['plan_time'] is not None,
        'has_date': plan['plan_date'] is not None,
        'is_timeless': plan['is_timeless'],
    })
    return jsonify({'data': plan, 'error': None}), 201
```

### 7.5 PostHog Dashboard Setup

After shipping, create these dashboards in PostHog to track the 7 launch targets:

| Dashboard | Key insight | PostHog query |
|---|---|---|
| Acquisition | Invite link conversion rate | `invite_link_converted` ÷ `invite_link_shared` |
| Acquisition | Time to first plan | Funnel: `user signed up` → `plan_created` |
| Engagement | Plans per active user/week | `plan_created` events per week per user |
| Engagement | Materialization rate | `plan_materialized` ÷ `plan_created` (is_timeless=true) within 7 days |
| Engagement | Interested → Joined conversion | `plan_joined` ÷ `plan_interested` |
| Social | Mutual connections within 7 days | % of users with `mutual_connection_formed` within 7d of signup |
| Social | Avg mutual connections at 30d | Avg count of `mutual_connection_formed` per user by day 30 |

---

## 8. API Gateway Custom Domain Setup

Once the domain `hyperlocal.xyz` is registered and DNS is in Route 53:

```bash
# 1. Request ACM certificate (must be in us-east-1 for API Gateway)
aws acm request-certificate \
  --domain-name "api.hyperlocal.xyz" \
  --validation-method DNS \
  --region us-east-1

# 2. Add the CNAME validation record to Route 53 (shown in ACM console after request)

# 3. Wait for certificate validation (~5 min after DNS propagates)

# 4. Create custom domain in API Gateway
aws apigateway create-domain-name \
  --domain-name "api.hyperlocal.xyz" \
  --regional-certificate-arn "arn:aws:acm:us-east-1:..." \
  --endpoint-configuration types=REGIONAL \
  --region us-east-1

# 5. Create base path mapping
aws apigateway create-base-path-mapping \
  --domain-name "api.hyperlocal.xyz" \
  --rest-api-id <api-id> \
  --stage prod \
  --region us-east-1

# 6. Add Route 53 alias record for api.hyperlocal.xyz → API Gateway regional domain
```

---

## 9. Checklist: M1 Infrastructure Setup Tasks

These are the discrete tasks that must be completed before any application code can be validated end-to-end. Each is independently assignable.

- [ ] **Create Supabase prod project** in us-east-1; extract URL, anon key, service role key, JWT secret
- [ ] **Create Supabase dev project** in us-east-1 for development; same extraction
- [ ] **Configure Google OAuth** in GCP + Supabase Auth; verify redirect URLs for both prod and dev
- [ ] **Apply database schema** (DDL from `02-database-schema.md`) to dev Supabase project; verify via Studio
- [ ] **Enable Realtime** on the 5 specified tables in dev project
- [ ] **Create Supabase Storage bucket** (`avatars`) with RLS policies
- [ ] **Set up AWS IAM user** for GitHub Actions deployments with minimal permissions (Lambda + SAM + SSM read)
- [ ] **Store all secrets in SSM Parameter Store** under `/hyperlocal/dev/` and `/hyperlocal/prod/` paths
- [ ] **Scaffold Flask project** with Mangum entry point; verify `sam build && sam local start-api` works locally
- [ ] **Scaffold React project** with Vite; verify `npm run dev` connects to local Flask
- [ ] **Connect GitHub repo to Amplify** for React CD; verify preview URL on test branch push
- [ ] **Set up GitHub Actions** deploy workflow for Flask; verify it triggers on push to `main`
- [ ] **Create PostHog project**; install posthog-js in React and posthog Python in Flask; verify test event appears in dashboard
- [ ] **Apply schema to prod project** once dev is validated; enable Realtime and storage there too
