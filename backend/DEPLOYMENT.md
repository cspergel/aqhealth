# AQSoft Health Platform — Deployment Guide

## Prerequisites

| Component      | Version   | Notes                                    |
|----------------|-----------|------------------------------------------|
| PostgreSQL     | 16+       | Alpine image used in Docker              |
| Redis          | 7+        | Alpine image used in Docker              |
| Python         | 3.11+     | 3.12 recommended                         |
| Node.js        | 20+       | For frontend build                       |
| Docker         | 24+       | Optional — for containerised deployment  |
| Docker Compose | v2+       | Optional — bundled with Docker Desktop   |

---

## 1. Environment Setup

Copy the example env file and fill in real values:

```bash
cp backend/.env.example backend/.env
```

**Required variables:**

| Variable                     | Description                                        | Example                                                            |
|------------------------------|----------------------------------------------------|--------------------------------------------------------------------|
| `DATABASE_URL`               | Async PostgreSQL connection string                 | `postgresql+asyncpg://aqsoft:aqsoft@localhost:5433/aqsoft_health`   |
| `REDIS_URL`                  | Redis connection string                            | `redis://localhost:6380/0`                                         |
| `SECRET_KEY`                 | JWT signing key — **must change from default**     | Any random 64-char hex string                                      |
| `CORS_ORIGINS`               | Allowed frontend origins (JSON list)               | `["https://app.example.com"]`                                      |
| `ANTHROPIC_API_KEY`          | Claude API key for AI insights                     | `sk-ant-...`                                                       |

**Optional variables:**

| Variable                     | Description                                        | Default           |
|------------------------------|----------------------------------------------------|--------------------|
| `OPENAI_API_KEY`             | Fallback LLM                                       | (empty)            |
| `LLM_PRIMARY`                | `anthropic` or `openai`                            | `anthropic`        |
| `SNF_ASSIST_URL`             | URL of SNF Admit Assist service                    | `http://localhost:8000` |
| `AUTOCODER_URL`              | URL of AutoCoder service                           | (empty)            |
| `AUTOCODER_API_KEY`          | API key for AutoCoder                              | (empty)            |
| `ACCESS_TOKEN_EXPIRE_MINUTES`| JWT access token lifetime                          | `30`               |
| `REFRESH_TOKEN_EXPIRE_DAYS`  | JWT refresh token lifetime                         | `7`                |
| `UPLOADS_DIR`                | Directory for uploaded files                       | `./uploads`        |
| `ALLOW_DEFAULT_SECRET`       | Set `true` to allow default SECRET_KEY (dev only)  | (unset)            |

> **Security note:** `ALLOW_DEFAULT_SECRET=true` must never be set in production.
> The application will refuse to start if SECRET_KEY is the default value
> unless this escape hatch is explicitly enabled.

Generate a strong secret key:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

---

## 2. Docker Quick Start (Recommended)

```bash
# From the repository root
docker compose up -d
```

This starts PostgreSQL, Redis, the backend API, and all background workers
(ingestion, HCC recalculation, AI insight generation).

The backend is available at `http://localhost:8090`.

### Build the frontend

```bash
cd frontend
npm install
npm run build          # outputs to dist/
npm run preview        # or serve dist/ with any static server
```

---

## 3. Manual Setup (Without Docker)

### 3a. Start PostgreSQL and Redis

Install and start PostgreSQL 16 and Redis 7 using your OS package manager
or download them directly. Make sure the connection details match your `.env`.

### 3b. Install Python dependencies

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e .
```

### 3c. Initialise the database

```bash
python scripts/setup_db.py
```

### 3d. Seed reference data (optional, for demo)

```bash
python scripts/seed.py
python scripts/seed_extended.py
python scripts/generate_synthetic_data.py
python scripts/generate_insights.py
```

### 3e. Start the API server

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

### 3f. Start background workers (each in its own terminal)

```bash
arq app.workers.ingestion_worker.WorkerSettings
arq app.workers.hcc_worker.WorkerSettings
arq app.workers.insight_worker.WorkerSettings
```

### 3g. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

---

## 4. Creating the First Tenant

```bash
cd backend
python scripts/create_tenant.py \
  --name "Acme MSO" \
  --schema acme_mso \
  --admin-email admin@acme.com \
  --admin-password 'S3cur3Pa$$word!'
```

This creates:
- A new PostgreSQL schema for the tenant
- All required tables within that schema
- An admin user account with the specified credentials

If the `create_tenant.py` script does not yet exist, you can create the
tenant via the API:

```bash
curl -X POST http://localhost:8090/api/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme MSO",
    "schema_name": "acme_mso",
    "admin_email": "admin@acme.com",
    "admin_password": "S3cur3Pa$$word!"
  }'
```

---

## 5. Loading Data

### Via the UI

1. Log in as a tenant admin.
2. Navigate to **Settings > Data Ingestion**.
3. Upload a CSV or Excel file containing claims, members, or provider data.
4. The ingestion worker will process the file asynchronously.
5. Check the **Data Quality** dashboard for validation results.

### Via the API

```bash
# Upload a claims file
curl -X POST http://localhost:8090/api/ingestion/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@claims_2024.csv" \
  -F "file_type=claims"
```

Supported file types: `claims`, `members`, `providers`, `eligibility`, `pharmacy`, `lab_results`.

---

## 6. Post-Ingestion Steps

After data is loaded and the ingestion worker finishes processing:

```bash
# Recalculate HCC risk scores for all members in a tenant schema
python scripts/post_ingestion.py --schema acme_mso
```

Or trigger via the API:

```bash
# Trigger HCC recalculation
curl -X POST http://localhost:8090/api/hcc/recalculate \
  -H "Authorization: Bearer $TOKEN"

# Trigger AI insight generation
curl -X POST http://localhost:8090/api/insights/generate \
  -H "Authorization: Bearer $TOKEN"
```

The HCC and insight workers handle these tasks asynchronously.

---

## 7. Verify Everything Works

Run through this checklist after deployment:

```bash
# 1. Health check
curl http://localhost:8090/api/health
# Expected: {"status":"ok","version":"0.1.0"}

# 2. Authenticate
TOKEN=$(curl -s -X POST http://localhost:8090/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@acme.com","password":"S3cur3Pa$$word!"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 3. Dashboard loads
curl -H "Authorization: Bearer $TOKEN" http://localhost:8090/api/dashboard/overview
# Expected: JSON with population stats

# 4. Members list
curl -H "Authorization: Bearer $TOKEN" http://localhost:8090/api/members?limit=5
# Expected: JSON array of members

# 5. HCC summary
curl -H "Authorization: Bearer $TOKEN" http://localhost:8090/api/hcc/summary
# Expected: JSON with HCC capture stats

# 6. Redis is connected (workers can process jobs)
curl http://localhost:8090/api/health
# No errors in backend logs about Redis connection

# 7. Frontend loads
# Open http://localhost:5173 (dev) or wherever the frontend is hosted
# Log in with the admin credentials created above
```

---

## 8. Troubleshooting

### Application refuses to start: "SECRET_KEY must be changed from default"

Set a real `SECRET_KEY` in `backend/.env`. For local development only, you can
set `ALLOW_DEFAULT_SECRET=true` in the environment, but never in production.

### Database connection refused

- Verify PostgreSQL is running: `pg_isready -h localhost -p 5433`
- Check `DATABASE_URL` in `.env` matches your actual host/port/credentials
- If using Docker, ensure the postgres container is healthy: `docker compose ps`

### Redis connection refused

- Verify Redis is running: `redis-cli -p 6380 ping`
- Check `REDIS_URL` in `.env`
- Workers will fail silently without Redis

### Workers not processing jobs

- Ensure Redis is running and reachable
- Check worker logs: `docker compose logs worker` or `docker compose logs hcc-worker`
- Verify the worker is subscribed to the correct queue

### CORS errors in the browser

- Add your frontend URL to `CORS_ORIGINS` in `.env`
- Format must be a JSON list: `["http://localhost:5173","https://app.example.com"]`

### "Module not found" errors

- Ensure you installed dependencies: `pip install -e .` (backend) or `npm install` (frontend)
- Ensure your virtual environment is activated

### File upload fails

- Check that `UPLOADS_DIR` exists and is writable
- Default is `./uploads` relative to the backend directory

### AI insights not generating

- Verify `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) is set in `.env`
- Check insight worker logs for API errors
- Ensure `LLM_PRIMARY` matches the key you have set
