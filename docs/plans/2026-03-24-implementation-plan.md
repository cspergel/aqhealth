# AQSoft Health Platform — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an EMR-agnostic managed care intelligence platform that ingests batch population data and delivers HCC suspect detection, expenditure analytics, provider scorecards, and care gap tracking with AI-driven insights.

**Architecture:** FastAPI (Python) backend with PostgreSQL (schema-per-tenant) + Redis. React 19 SPA frontend with Tailwind CSS + Radix UI. SNF Admit Assist called as an external microservice for HCC coding pipeline. LLMs (Claude) for insight generation and data mapping.

**Tech Stack:** Python 3.12+, FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL 16, Redis, React 19, Vite, Tailwind CSS 4, Radix UI, Axios, Recharts, pytest, Vitest

**Reference Docs:**
- Architecture design: `docs/plans/2026-03-24-platform-architecture-design.md`
- Design tokens: See Section 4 of architecture doc (design-reset palette)
- SNF Admit Assist: `C:\Users\drcra\Documents\Coding Projects\SNF Admit Assist\`

---

## Phase 1: Project Foundation

### Task 1.1: Repository & Project Structure

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `docker-compose.yml`
- Create: `.gitignore`
- Create: `.env.example`

**Step 1: Initialize git repo**

```bash
cd "C:\Users\drcra\Documents\Coding Projects\AQSoft Health Platform"
git init
```

**Step 2: Create backend project structure**

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app entry point
│   ├── config.py             # Settings via pydantic-settings
│   ├── database.py           # SQLAlchemy engine, session, tenant routing
│   ├── dependencies.py       # FastAPI dependency injection (current user, tenant)
│   ├── models/               # SQLAlchemy ORM models
│   │   ├── __init__.py
│   │   ├── base.py           # Base model class
│   │   ├── tenant.py         # Tenant/MSO client model (platform schema)
│   │   ├── user.py           # User/auth models (platform schema)
│   │   ├── member.py         # Attributed member (tenant schema)
│   │   ├── claim.py          # Claims data (tenant schema)
│   │   ├── provider.py       # Provider/PCP (tenant schema)
│   │   ├── hcc.py            # HCC tracking, suspects, RAF history (tenant schema)
│   │   ├── care_gap.py       # Care gap measures and member gaps (tenant schema)
│   │   ├── expenditure.py    # Expenditure aggregations (tenant schema)
│   │   ├── ingestion.py      # Upload jobs, mapping templates, rules (tenant schema)
│   │   └── insight.py        # AI insights, feedback (tenant schema)
│   ├── routers/              # API route handlers
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── tenants.py
│   │   ├── ingestion.py
│   │   ├── members.py
│   │   ├── claims.py
│   │   ├── hcc.py
│   │   ├── expenditure.py
│   │   ├── providers.py
│   │   ├── care_gaps.py
│   │   ├── dashboard.py
│   │   └── insights.py
│   ├── services/             # Business logic
│   │   ├── __init__.py
│   │   ├── auth_service.py
│   │   ├── tenant_service.py
│   │   ├── ingestion_service.py
│   │   ├── mapping_service.py     # AI column mapping
│   │   ├── hcc_engine.py          # Suspect detection, RAF calc orchestration
│   │   ├── snf_client.py          # HTTP client to SNF Admit Assist microservice
│   │   ├── expenditure_service.py
│   │   ├── care_gap_service.py
│   │   ├── insight_service.py     # AI insight generation via LLM
│   │   ├── export_service.py      # CSV/Excel export
│   │   └── dashboard_service.py
│   ├── workers/              # Background job processors
│   │   ├── __init__.py
│   │   ├── ingestion_worker.py    # Process uploaded files
│   │   ├── hcc_worker.py          # Run HCC analysis on population
│   │   └── insight_worker.py      # Generate AI insights
│   └── utils/
│       ├── __init__.py
│       └── pagination.py
├── alembic/                  # Database migrations
│   ├── env.py
│   └── versions/
├── alembic.ini
├── tests/
│   ├── conftest.py
│   ├── test_auth.py
│   ├── test_ingestion.py
│   ├── test_hcc_engine.py
│   ├── test_expenditure.py
│   └── test_care_gaps.py
├── pyproject.toml
├── Dockerfile
└── .env.example
```

**Step 3: Create `backend/pyproject.toml`**

```toml
[project]
name = "aqsoft-health-platform"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "sqlalchemy[asyncio]>=2.0",
    "asyncpg>=0.30",
    "alembic>=1.14",
    "pydantic>=2.10",
    "pydantic-settings>=2.7",
    "python-jose[cryptography]>=3.3",
    "passlib[bcrypt]>=1.7",
    "python-multipart>=0.0.18",
    "redis>=5.2",
    "arq>=0.26",
    "httpx>=0.28",
    "pandas>=2.2",
    "openpyxl>=3.1",
    "anthropic>=0.42",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3",
    "pytest-asyncio>=0.24",
    "pytest-cov>=6.0",
    "httpx>=0.28",
    "factory-boy>=3.3",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

**Step 4: Create `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

app = FastAPI(
    title="AQSoft Health Platform",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}
```

**Step 5: Create `backend/app/config.py`**

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://aqsoft:aqsoft@localhost:5432/aqsoft_health"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    secret_key: str = "CHANGE-ME-IN-PRODUCTION"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # CORS
    cors_origins: list[str] = ["http://localhost:5173"]

    # SNF Admit Assist
    snf_assist_url: str = "http://localhost:8000"

    # AutoCoder
    autocoder_url: str = ""
    autocoder_api_key: str = ""

    # LLM
    anthropic_api_key: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
```

**Step 6: Create `backend/.env.example`**

```
DATABASE_URL=postgresql+asyncpg://aqsoft:aqsoft@localhost:5432/aqsoft_health
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=change-me-in-production
SNF_ASSIST_URL=http://localhost:8000
ANTHROPIC_API_KEY=
AUTOCODER_URL=
AUTOCODER_API_KEY=
```

**Step 7: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: aqsoft
      POSTGRES_PASSWORD: aqsoft
      POSTGRES_DB: aqsoft_health
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build: ./backend
    ports:
      - "8080:8080"
    env_file: ./backend/.env
    depends_on:
      - postgres
      - redis
    volumes:
      - ./backend:/app
    command: uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload

  worker:
    build: ./backend
    env_file: ./backend/.env
    depends_on:
      - postgres
      - redis
    volumes:
      - ./backend:/app
    command: arq app.workers.ingestion_worker.WorkerSettings

volumes:
  pgdata:
```

**Step 8: Create `backend/Dockerfile`**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

**Step 9: Create `.gitignore`**

```
# Python
__pycache__/
*.pyc
.venv/
*.egg-info/

# Node
node_modules/
dist/

# Environment
.env
*.env.local

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Docker volumes
pgdata/

# Test
.coverage
htmlcov/
.pytest_cache/
```

**Step 10: Commit**

```bash
git add -A
git commit -m "feat: initialize project structure with FastAPI backend and Docker Compose"
```

---

### Task 1.2: Database Setup — Platform Schema & Tenant Routing

**Files:**
- Create: `backend/app/database.py`
- Create: `backend/app/models/base.py`
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/tenant.py`
- Create: `backend/app/models/user.py`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `tests/conftest.py`
- Create: `tests/test_database.py`

**Step 1: Create `backend/app/database.py`**

This is the core of the multi-tenant architecture. The `set_tenant_schema` function switches the PostgreSQL search path per request.

```python
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import event, text

from app.config import settings

engine = create_async_engine(settings.database_url, echo=False, pool_size=20, max_overflow=10)
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncSession:
    """Get a plain session (platform schema). Use get_tenant_session for tenant-scoped queries."""
    async with async_session_factory() as session:
        yield session


async def get_tenant_session(tenant_schema: str) -> AsyncSession:
    """Get a session scoped to a specific tenant schema."""
    async with async_session_factory() as session:
        await session.execute(text(f"SET search_path TO {tenant_schema}, public"))
        yield session


async def create_tenant_schema(schema_name: str):
    """Provision a new tenant schema and run migrations."""
    async with engine.begin() as conn:
        await conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema_name}"))


async def init_db():
    """Create platform schema tables on startup."""
    async with engine.begin() as conn:
        await conn.execute(text("CREATE SCHEMA IF NOT EXISTS platform"))
```

**Step 2: Create `backend/app/models/base.py`**

```python
from datetime import datetime
from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

**Step 3: Create `backend/app/models/tenant.py`**

```python
from sqlalchemy import String, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
import enum

from app.models.base import Base, TimestampMixin


class TenantStatus(str, enum.Enum):
    active = "active"
    onboarding = "onboarding"
    suspended = "suspended"


class Tenant(Base, TimestampMixin):
    """MSO client — lives in the platform schema."""
    __tablename__ = "tenants"
    __table_args__ = {"schema": "platform"}

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    schema_name: Mapped[str] = mapped_column(String(63), unique=True)  # PG schema name limit
    status: Mapped[TenantStatus] = mapped_column(
        SAEnum(TenantStatus), default=TenantStatus.onboarding
    )
    config: Mapped[dict | None] = mapped_column(default=None)  # JSONB for tenant-specific settings
```

**Step 4: Create `backend/app/models/user.py`**

```python
from sqlalchemy import String, Integer, ForeignKey, Enum as SAEnum, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.models.base import Base, TimestampMixin


class UserRole(str, enum.Enum):
    superadmin = "superadmin"      # AQSoft platform team
    mso_admin = "mso_admin"        # Full tenant access
    analyst = "analyst"            # Read-only dashboards + exports
    provider = "provider"          # Own scorecard + panel only
    auditor = "auditor"            # Time-limited read-only


class User(Base, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = {"schema": "platform"}

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(200))
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole))
    tenant_id: Mapped[int | None] = mapped_column(
        ForeignKey("platform.tenants.id"), nullable=True
    )  # NULL for superadmin
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    mfa_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)
```

**Step 5: Write test for database setup**

Create `backend/tests/conftest.py`:

```python
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import text

from app.main import app
from app.config import settings


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def db_session():
    engine = create_async_engine(settings.database_url)
    session_factory = async_sessionmaker(engine, class_=AsyncSession)
    async with session_factory() as session:
        yield session
    await engine.dispose()
```

Create `backend/tests/test_health.py`:

```python
import pytest


@pytest.mark.asyncio
async def test_health_check(client):
    response = await client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
```

**Step 6: Run test to verify**

```bash
cd backend
pip install -e ".[dev]"
pytest tests/test_health.py -v
```

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: add database layer with multi-tenant schema routing and core models"
```

---

### Task 1.3: Authentication System

**Files:**
- Create: `backend/app/services/auth_service.py`
- Create: `backend/app/routers/auth.py`
- Create: `backend/app/dependencies.py`
- Modify: `backend/app/main.py` (add auth router)
- Create: `backend/tests/test_auth.py`

**Step 1: Create `backend/app/services/auth_service.py`**

```python
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: int, tenant_schema: str | None, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": str(user_id),
        "tenant": tenant_schema,
        "role": role,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def create_refresh_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    payload = {"sub": str(user_id), "exp": expire, "type": "refresh"}
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=["HS256"])


async def authenticate_user(session: AsyncSession, email: str, password: str) -> User | None:
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user and verify_password(password, user.hashed_password):
        return user
    return None
```

**Step 2: Create `backend/app/dependencies.py`**

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session, get_tenant_session
from app.services.auth_service import decode_token
from app.models.user import User, UserRole

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Extract and validate the current user from JWT token."""
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        return {
            "user_id": int(payload["sub"]),
            "tenant_schema": payload.get("tenant"),
            "role": payload["role"],
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def get_tenant_db(
    current_user: dict = Depends(get_current_user),
) -> AsyncSession:
    """Get a database session scoped to the current user's tenant."""
    tenant_schema = current_user.get("tenant_schema")
    if not tenant_schema:
        raise HTTPException(status_code=403, detail="No tenant assigned")
    async for session in get_tenant_session(tenant_schema):
        yield session


def require_role(*roles: UserRole):
    """Dependency that checks the user has one of the required roles."""
    async def checker(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in [r.value for r in roles]:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return checker
```

**Step 3: Create `backend/app/routers/auth.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_session
from app.services.auth_service import (
    authenticate_user, create_access_token, create_refresh_token,
    hash_password, decode_token,
)
from app.models.user import User, UserRole
from app.models.tenant import Tenant

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, session: AsyncSession = Depends(get_session)):
    user = await authenticate_user(session, body.email, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    # Get tenant schema name
    tenant_schema = None
    if user.tenant_id:
        result = await session.execute(select(Tenant).where(Tenant.id == user.tenant_id))
        tenant = result.scalar_one_or_none()
        if tenant:
            tenant_schema = tenant.schema_name

    access_token = create_access_token(user.id, tenant_schema, user.role.value)
    refresh_token = create_refresh_token(user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user={
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value,
        },
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, session: AsyncSession = Depends(get_session)):
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = int(payload["sub"])
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    tenant_schema = None
    if user.tenant_id:
        result = await session.execute(select(Tenant).where(Tenant.id == user.tenant_id))
        tenant = result.scalar_one_or_none()
        if tenant:
            tenant_schema = tenant.schema_name

    access_token = create_access_token(user.id, tenant_schema, user.role.value)
    refresh_token = create_refresh_token(user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user={
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value,
        },
    )
```

**Step 4: Register router in `backend/app/main.py`**

Add to main.py after middleware:

```python
from app.routers import auth

app.include_router(auth.router)
```

**Step 5: Write auth tests**

Create `backend/tests/test_auth.py`:

```python
import pytest
from app.services.auth_service import hash_password, verify_password, create_access_token, decode_token


def test_password_hashing():
    hashed = hash_password("test123")
    assert verify_password("test123", hashed)
    assert not verify_password("wrong", hashed)


def test_access_token_roundtrip():
    token = create_access_token(user_id=1, tenant_schema="sunstate", role="mso_admin")
    payload = decode_token(token)
    assert payload["sub"] == "1"
    assert payload["tenant"] == "sunstate"
    assert payload["role"] == "mso_admin"
    assert payload["type"] == "access"
```

**Step 6: Run tests**

```bash
pytest tests/test_auth.py -v
```

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: add JWT authentication with tenant-scoped tokens and RBAC"
```

---

### Task 1.4: Frontend Foundation

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/lib/tokens.ts` (design system)
- Create: `frontend/src/lib/api.ts` (API client)
- Create: `frontend/src/lib/auth.tsx` (auth context)
- Create: `frontend/src/components/ui/` (base components)

**Step 1: Initialize frontend with Vite**

```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install
npm install tailwindcss @tailwindcss/vite @radix-ui/react-dropdown-menu @radix-ui/react-dialog @radix-ui/react-tabs @radix-ui/react-tooltip @radix-ui/react-select @radix-ui/react-popover
npm install axios recharts react-router-dom
npm install -D @types/react @types/react-dom vitest @testing-library/react
```

**Step 2: Create `frontend/src/lib/tokens.ts`**

This is the canonical design token file. ALL styling references these values.

```typescript
// CANONICAL DESIGN TOKENS — from design-reset.jsx
// See: docs/plans/2026-03-24-platform-architecture-design.md Section 4

export const tokens = {
  // Backgrounds
  bg: "#fafaf9",
  surface: "#ffffff",
  surfaceAlt: "#f5f5f4",

  // Borders
  border: "#e7e5e4",
  borderSoft: "#f0eeec",

  // Text
  text: "#1c1917",
  textSecondary: "#57534e",
  textMuted: "#a8a29e",

  // Accent — green is the ONLY primary accent
  accent: "#16a34a",
  accentSoft: "#dcfce7",
  accentText: "#15803d",

  // Semantic colors — used sparingly
  blue: "#2563eb",
  blueSoft: "#dbeafe",
  amber: "#d97706",
  amberSoft: "#fef3c7",
  red: "#dc2626",
  redSoft: "#fee2e2",
} as const;

export const fonts = {
  heading: "'Instrument Sans', 'General Sans', 'Plus Jakarta Sans', system-ui, sans-serif",
  body: "'Inter', system-ui, sans-serif",
  code: "'Berkeley Mono', 'SF Mono', 'JetBrains Mono', monospace",
} as const;
```

**Step 3: Create `frontend/src/lib/api.ts`**

```typescript
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8080",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Try refresh token
      const refresh = localStorage.getItem("refresh_token");
      if (refresh) {
        try {
          const res = await axios.post(
            `${api.defaults.baseURL}/api/auth/refresh`,
            { refresh_token: refresh }
          );
          localStorage.setItem("access_token", res.data.access_token);
          localStorage.setItem("refresh_token", res.data.refresh_token);
          error.config.headers.Authorization = `Bearer ${res.data.access_token}`;
          return api(error.config);
        } catch {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
```

**Step 4: Create `frontend/src/lib/auth.tsx`**

```tsx
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import api from "./api";

interface User {
  id: number;
  email: string;
  full_name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const userData = localStorage.getItem("user");
    if (token && userData) {
      setUser(JSON.parse(userData));
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post("/api/auth/login", { email, password });
    localStorage.setItem("access_token", res.data.access_token);
    localStorage.setItem("refresh_token", res.data.refresh_token);
    localStorage.setItem("user", JSON.stringify(res.data.user));
    setUser(res.data.user);
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

**Step 5: Create base UI components**

Create `frontend/src/components/ui/Tag.tsx`:

```tsx
import { tokens } from "../../lib/tokens";

const variants = {
  default: { bg: tokens.surfaceAlt, color: tokens.textSecondary, border: tokens.border },
  green: { bg: tokens.accentSoft, color: tokens.accentText, border: "#bbf7d0" },
  amber: { bg: tokens.amberSoft, color: "#92400e", border: "#fde68a" },
  red: { bg: tokens.redSoft, color: "#991b1b", border: "#fecaca" },
  blue: { bg: tokens.blueSoft, color: "#1e40af", border: "#bfdbfe" },
} as const;

interface TagProps {
  children: React.ReactNode;
  variant?: keyof typeof variants;
}

export function Tag({ children, variant = "default" }: TagProps) {
  const s = variants[variant];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}
    >
      {children}
    </span>
  );
}
```

Create `frontend/src/components/ui/MetricCard.tsx`:

```tsx
import { fonts, tokens } from "../../lib/tokens";

interface MetricCardProps {
  label: string;
  value: string;
  trend?: string;
  trendDirection?: "up" | "down" | "flat";
}

export function MetricCard({ label, value, trend, trendDirection }: MetricCardProps) {
  const trendColor =
    trendDirection === "up" ? tokens.accentText :
    trendDirection === "down" ? tokens.red : tokens.textMuted;

  return (
    <div className="rounded-[10px] border bg-white p-4" style={{ borderColor: tokens.border }}>
      <div className="text-xs font-medium mb-1" style={{ color: tokens.textMuted }}>{label}</div>
      <div className="text-2xl font-semibold tracking-tight" style={{ fontFamily: fonts.code, color: tokens.text }}>
        {value}
      </div>
      {trend && (
        <div className="text-xs font-medium mt-1" style={{ color: trendColor }}>
          {trend}
        </div>
      )}
    </div>
  );
}
```

Create `frontend/src/components/ui/InsightCard.tsx`:

```tsx
import { tokens } from "../../lib/tokens";

interface InsightCardProps {
  title: string;
  description: string;
  impact?: string;
  category: "revenue" | "cost" | "quality" | "provider" | "trend";
  onDismiss?: () => void;
  onBookmark?: () => void;
}

const categoryColors = {
  revenue: { bg: tokens.accentSoft, border: "#bbf7d0", accent: tokens.accentText },
  cost: { bg: tokens.amberSoft, border: "#fde68a", accent: "#92400e" },
  quality: { bg: tokens.blueSoft, border: "#bfdbfe", accent: "#1e40af" },
  provider: { bg: tokens.surfaceAlt, border: tokens.border, accent: tokens.textSecondary },
  trend: { bg: tokens.redSoft, border: "#fecaca", accent: "#991b1b" },
};

export function InsightCard({ title, description, impact, category, onDismiss }: InsightCardProps) {
  const colors = categoryColors[category];
  return (
    <div
      className="rounded-[10px] p-4"
      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
    >
      <div className="text-[13px] font-semibold mb-1" style={{ color: colors.accent }}>{title}</div>
      <div className="text-[13px] leading-relaxed" style={{ color: tokens.textSecondary }}>{description}</div>
      {impact && (
        <div className="text-[13px] font-semibold mt-2" style={{ color: colors.accent }}>{impact}</div>
      )}
      {onDismiss && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={onDismiss}
            className="text-[11px] px-2 py-1 rounded border"
            style={{ borderColor: tokens.border, color: tokens.textMuted }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 6: Create app shell with routing**

Create `frontend/src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { AppShell } from "./components/layout/AppShell";
import { LoginPage } from "./pages/LoginPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

Create `frontend/src/components/layout/AppShell.tsx`:

```tsx
import { Routes, Route, NavLink } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { tokens, fonts } from "../../lib/tokens";

const navItems = [
  { path: "/", label: "Dashboard" },
  { path: "/suspects", label: "Suspect HCCs" },
  { path: "/expenditure", label: "Expenditure" },
  { path: "/providers", label: "Providers" },
  { path: "/care-gaps", label: "Care Gaps" },
  { path: "/ingestion", label: "Data" },
];

export function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen" style={{ background: tokens.bg, fontFamily: fonts.body }}>
      {/* Header */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-7 py-3"
        style={{ background: tokens.surface, borderBottom: `1px solid ${tokens.border}` }}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: tokens.accent }} />
            <span
              className="font-bold text-[15px] tracking-tight"
              style={{ fontFamily: fonts.heading, color: tokens.text }}
            >
              AQSoft Health
            </span>
          </div>
          <div className="w-px h-5" style={{ background: tokens.border }} />
          <nav className="flex items-center gap-5">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  `text-[13px] pb-0.5 border-b-2 transition-colors ${
                    isActive ? "font-semibold" : "font-normal"
                  }`
                }
                style={({ isActive }) => ({
                  color: isActive ? tokens.text : tokens.textMuted,
                  borderBottomColor: isActive ? tokens.accent : "transparent",
                })}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: tokens.textMuted }}>
            {user?.full_name}
          </span>
          <button
            onClick={logout}
            className="text-xs px-3 py-1 rounded border"
            style={{ borderColor: tokens.border, color: tokens.textSecondary }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="max-w-[1440px] mx-auto">
        <Routes>
          <Route path="/" element={<div className="p-7">Dashboard — coming in Phase 5</div>} />
          <Route path="/suspects" element={<div className="p-7">Suspect HCCs — coming in Phase 4</div>} />
          <Route path="/expenditure" element={<div className="p-7">Expenditure — coming in Phase 6</div>} />
          <Route path="/providers" element={<div className="p-7">Providers — coming in Phase 7</div>} />
          <Route path="/care-gaps" element={<div className="p-7">Care Gaps — coming in Phase 8</div>} />
          <Route path="/ingestion" element={<div className="p-7">Data Ingestion — coming in Phase 3</div>} />
        </Routes>
      </main>
    </div>
  );
}
```

Create `frontend/src/pages/LoginPage.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { tokens, fonts } from "../lib/tokens";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      navigate("/");
    } catch {
      setError("Invalid email or password");
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: tokens.bg, fontFamily: fonts.body }}
    >
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: tokens.accent }} />
          <span className="text-xl font-bold tracking-tight" style={{ fontFamily: fonts.heading }}>
            AQSoft Health
          </span>
        </div>

        <div
          className="rounded-xl p-6 space-y-4"
          style={{ background: tokens.surface, border: `1px solid ${tokens.border}` }}
        >
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: tokens.textMuted }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ border: `1px solid ${tokens.border}`, color: tokens.text }}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: tokens.textMuted }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ border: `1px solid ${tokens.border}`, color: tokens.text }}
              required
            />
          </div>
          {error && <div className="text-xs" style={{ color: tokens.red }}>{error}</div>}
          <button
            type="submit"
            className="w-full py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: tokens.accent }}
          >
            Sign in
          </button>
        </div>
      </form>
    </div>
  );
}
```

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: add React frontend with design system tokens, auth, routing, and app shell"
```

---

## Phase 2: Core Data Models & Tenant Schema

### Task 2.1: Tenant-Scoped Data Models

**Files:**
- Create: `backend/app/models/member.py`
- Create: `backend/app/models/claim.py`
- Create: `backend/app/models/provider.py`
- Create: `backend/app/models/hcc.py`
- Create: `backend/app/models/care_gap.py`
- Create: `backend/app/models/expenditure.py`
- Create: `backend/app/models/ingestion.py`
- Create: `backend/app/models/insight.py`
- Create: Alembic migration for all models

**Key: All tenant-scoped models do NOT set `__table_args__ = {"schema": ...}`.** The schema is set dynamically via `SET search_path` at the session level. Only platform-level models (Tenant, User) specify `schema: "platform"`.

**Step 1: Create `backend/app/models/member.py`**

```python
from datetime import date
from sqlalchemy import String, Date, Integer, ForeignKey, Numeric, Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
import enum

from app.models.base import Base, TimestampMixin


class RiskTier(str, enum.Enum):
    low = "low"
    rising = "rising"
    high = "high"
    complex = "complex"


class Member(Base, TimestampMixin):
    """Attributed member within an MSO's population."""
    __tablename__ = "members"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[str] = mapped_column(String(50), index=True)  # Health plan member ID
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    date_of_birth: Mapped[date] = mapped_column(Date)
    gender: Mapped[str] = mapped_column(String(1))  # M/F
    zip_code: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Insurance / plan info
    health_plan: Mapped[str | None] = mapped_column(String(200), nullable=True)
    plan_product: Mapped[str | None] = mapped_column(String(100), nullable=True)  # MA, MAPD, etc.
    coverage_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    coverage_end: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Attribution
    pcp_provider_id: Mapped[int | None] = mapped_column(ForeignKey("providers.id"), nullable=True)

    # Demographics for RAF calculation
    medicaid_status: Mapped[bool] = mapped_column(default=False)
    disability_status: Mapped[bool] = mapped_column(default=False)  # Originally disabled
    institutional: Mapped[bool] = mapped_column(default=False)

    # Computed fields (updated by HCC engine)
    current_raf: Mapped[float | None] = mapped_column(Numeric(8, 3), nullable=True)
    projected_raf: Mapped[float | None] = mapped_column(Numeric(8, 3), nullable=True)
    risk_tier: Mapped[RiskTier | None] = mapped_column(SAEnum(RiskTier), nullable=True)

    # Flexible extra data
    extra: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
```

**Step 2: Create `backend/app/models/claim.py`**

```python
from datetime import date
from decimal import Decimal
from sqlalchemy import String, Date, Integer, ForeignKey, Numeric, Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, ARRAY
from sqlalchemy.orm import Mapped, mapped_column
import enum

from app.models.base import Base, TimestampMixin


class ClaimType(str, enum.Enum):
    professional = "professional"  # 837P
    institutional = "institutional"  # 837I
    pharmacy = "pharmacy"


class Claim(Base, TimestampMixin):
    """Individual claim line from ingested claims data."""
    __tablename__ = "claims"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    claim_id: Mapped[str | None] = mapped_column(String(50), nullable=True)  # Payer claim number
    claim_type: Mapped[ClaimType] = mapped_column(SAEnum(ClaimType))

    # Dates
    service_date: Mapped[date] = mapped_column(Date, index=True)
    paid_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Codes
    diagnosis_codes: Mapped[list[str] | None] = mapped_column(ARRAY(String(10)), nullable=True)
    procedure_code: Mapped[str | None] = mapped_column(String(10), nullable=True)  # CPT/HCPCS
    drg_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    ndc_code: Mapped[str | None] = mapped_column(String(15), nullable=True)  # Pharmacy

    # Provider / Facility
    rendering_provider_id: Mapped[int | None] = mapped_column(ForeignKey("providers.id"), nullable=True)
    facility_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    facility_npi: Mapped[str | None] = mapped_column(String(15), nullable=True)

    # Financial
    billed_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    allowed_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    paid_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    member_liability: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    # Classification (for expenditure analytics)
    service_category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Values: inpatient, ed_observation, professional, snf_postacute, pharmacy, home_health, dme, other

    # Place of service
    pos_code: Mapped[str | None] = mapped_column(String(5), nullable=True)

    # Drug info (pharmacy claims)
    drug_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    drug_class: Mapped[str | None] = mapped_column(String(100), nullable=True)
    quantity: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    days_supply: Mapped[int | None] = mapped_column(Integer, nullable=True)

    extra: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
```

**Step 3: Create `backend/app/models/provider.py`**

```python
from sqlalchemy import String, Integer, Numeric
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Provider(Base, TimestampMixin):
    __tablename__ = "providers"

    id: Mapped[int] = mapped_column(primary_key=True)
    npi: Mapped[str] = mapped_column(String(15), index=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    specialty: Mapped[str | None] = mapped_column(String(100), nullable=True)
    practice_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    tin: Mapped[str | None] = mapped_column(String(15), nullable=True)

    # Computed scorecard metrics (updated by analytics engine)
    panel_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    capture_rate: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    recapture_rate: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    avg_panel_raf: Mapped[float | None] = mapped_column(Numeric(8, 3), nullable=True)
    panel_pmpm: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    gap_closure_rate: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)

    # Configurable target overrides (JSONB)
    targets: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    extra: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
```

**Step 4: Create `backend/app/models/hcc.py`**

```python
from datetime import date
from decimal import Decimal
from sqlalchemy import String, Date, Integer, ForeignKey, Numeric, Enum as SAEnum, Text
from sqlalchemy.orm import Mapped, mapped_column
import enum

from app.models.base import Base, TimestampMixin


class SuspectStatus(str, enum.Enum):
    open = "open"
    captured = "captured"
    dismissed = "dismissed"
    expired = "expired"


class SuspectType(str, enum.Enum):
    med_dx_gap = "med_dx_gap"          # Medication without matching diagnosis
    specificity = "specificity"         # Unspecified code upgradeable
    recapture = "recapture"             # Prior year HCC not yet recaptured
    near_miss = "near_miss"             # Close to disease interaction bonus
    historical = "historical"           # Previously coded, dropped off
    new_suspect = "new_suspect"         # New evidence from claims patterns


class HccSuspect(Base, TimestampMixin):
    """Individual suspect HCC for a member."""
    __tablename__ = "hcc_suspects"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    payment_year: Mapped[int] = mapped_column(Integer)

    # HCC details
    hcc_code: Mapped[int] = mapped_column(Integer)
    hcc_label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    icd10_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    icd10_label: Mapped[str | None] = mapped_column(String(300), nullable=True)

    # RAF impact
    raf_value: Mapped[Decimal] = mapped_column(Numeric(8, 3))
    annual_value: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)

    # Classification
    suspect_type: Mapped[SuspectType] = mapped_column(SAEnum(SuspectType))
    status: Mapped[SuspectStatus] = mapped_column(SAEnum(SuspectStatus), default=SuspectStatus.open)
    confidence: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0-100

    # Evidence
    evidence_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_claims: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Tracking
    identified_date: Mapped[date] = mapped_column(Date)
    captured_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    dismissed_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    dismissed_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)


class RafHistory(Base, TimestampMixin):
    """Point-in-time RAF snapshot for a member."""
    __tablename__ = "raf_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    calculation_date: Mapped[date] = mapped_column(Date)
    payment_year: Mapped[int] = mapped_column(Integer)

    # RAF components
    demographic_raf: Mapped[Decimal] = mapped_column(Numeric(8, 3))
    disease_raf: Mapped[Decimal] = mapped_column(Numeric(8, 3))
    interaction_raf: Mapped[Decimal] = mapped_column(Numeric(8, 3))
    total_raf: Mapped[Decimal] = mapped_column(Numeric(8, 3))

    hcc_count: Mapped[int] = mapped_column(Integer, default=0)
    suspect_count: Mapped[int] = mapped_column(Integer, default=0)
```

**Step 5: Create `backend/app/models/care_gap.py`**

```python
from datetime import date
from sqlalchemy import String, Date, Integer, ForeignKey, Numeric, Enum as SAEnum, Boolean, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
import enum

from app.models.base import Base, TimestampMixin


class GapStatus(str, enum.Enum):
    open = "open"
    closed = "closed"
    excluded = "excluded"


class GapMeasure(Base, TimestampMixin):
    """Configurable quality measure definition (HEDIS, Stars, custom)."""
    __tablename__ = "gap_measures"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), index=True)  # e.g., "CDC-HbA1c"
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)  # HEDIS domain
    stars_weight: Mapped[int] = mapped_column(Integer, default=1)  # 1x, 3x for triple-weighted
    target_rate: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    star_3_cutpoint: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    star_4_cutpoint: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    star_5_cutpoint: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    detection_logic: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # Rules for identifying gaps


class MemberGap(Base, TimestampMixin):
    """Individual care gap for a member."""
    __tablename__ = "member_gaps"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    measure_id: Mapped[int] = mapped_column(ForeignKey("gap_measures.id"), index=True)
    status: Mapped[GapStatus] = mapped_column(SAEnum(GapStatus), default=GapStatus.open)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    closed_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    measurement_year: Mapped[int] = mapped_column(Integer)
    responsible_provider_id: Mapped[int | None] = mapped_column(ForeignKey("providers.id"), nullable=True)
```

**Step 6: Create `backend/app/models/ingestion.py`**

```python
from datetime import datetime
from sqlalchemy import String, Integer, Enum as SAEnum, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
import enum

from app.models.base import Base, TimestampMixin


class UploadStatus(str, enum.Enum):
    pending = "pending"
    mapping = "mapping"          # AI column mapping in progress
    validating = "validating"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class UploadJob(Base, TimestampMixin):
    """Tracks a file upload and its processing status."""
    __tablename__ = "upload_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(500))
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detected_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[UploadStatus] = mapped_column(SAEnum(UploadStatus), default=UploadStatus.pending)

    # Mapping
    column_mapping: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    mapping_template_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Results
    total_rows: Mapped[int | None] = mapped_column(Integer, nullable=True)
    processed_rows: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_rows: Mapped[int | None] = mapped_column(Integer, nullable=True)
    errors: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # [{row, field, error}]

    uploaded_by: Mapped[int | None] = mapped_column(Integer, nullable=True)


class MappingTemplate(Base, TimestampMixin):
    """Saved column mapping template for repeated uploads from same source."""
    __tablename__ = "mapping_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    source_name: Mapped[str | None] = mapped_column(String(200), nullable=True)  # e.g., "Humana Monthly Roster"
    data_type: Mapped[str] = mapped_column(String(50))  # roster, claims, eligibility, pharmacy, etc.
    column_mapping: Mapped[dict] = mapped_column(JSONB)  # {source_col: platform_field}
    transformation_rules: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # Learnable rules


class MappingRule(Base, TimestampMixin):
    """User-created rule for data mapping corrections. Accumulates over time."""
    __tablename__ = "mapping_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    rule_type: Mapped[str] = mapped_column(String(50))  # column_rename, value_transform, filter, etc.
    rule_config: Mapped[dict] = mapped_column(JSONB)  # The actual rule definition
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
```

**Step 7: Create `backend/app/models/insight.py`**

```python
from sqlalchemy import String, Integer, Numeric, Enum as SAEnum, Text, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
import enum

from app.models.base import Base, TimestampMixin


class InsightCategory(str, enum.Enum):
    revenue = "revenue"
    cost = "cost"
    quality = "quality"
    provider = "provider"
    trend = "trend"


class InsightStatus(str, enum.Enum):
    active = "active"
    dismissed = "dismissed"
    bookmarked = "bookmarked"
    acted_on = "acted_on"


class Insight(Base, TimestampMixin):
    """AI-generated insight surfaced across the platform."""
    __tablename__ = "insights"

    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[InsightCategory] = mapped_column(SAEnum(InsightCategory))
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text)
    dollar_impact: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    recommended_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0-100
    status: Mapped[InsightStatus] = mapped_column(SAEnum(InsightStatus), default=InsightStatus.active)

    # What this insight is about
    affected_members: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    affected_providers: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Which module surfaces this
    surface_on: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    # e.g., ["dashboard", "expenditure.inpatient", "provider.dr_smith"]
```

**Step 8: Update `backend/app/models/__init__.py`**

```python
from app.models.base import Base
from app.models.tenant import Tenant
from app.models.user import User
from app.models.member import Member
from app.models.claim import Claim
from app.models.provider import Provider
from app.models.hcc import HccSuspect, RafHistory
from app.models.care_gap import GapMeasure, MemberGap
from app.models.ingestion import UploadJob, MappingTemplate, MappingRule
from app.models.insight import Insight
```

**Step 9: Set up Alembic and create initial migration**

```bash
cd backend
alembic init alembic
```

Edit `alembic/env.py` to use async engine and import all models. Then:

```bash
alembic revision --autogenerate -m "initial schema: platform + tenant tables"
alembic upgrade head
```

**Step 10: Commit**

```bash
git add -A
git commit -m "feat: add all tenant-scoped data models — members, claims, providers, HCC, care gaps, ingestion, insights"
```

---

## Phase 3: Data Ingestion Pipeline

### Task 3.1: File Upload API + AI Column Mapping

**Files:**
- Create: `backend/app/routers/ingestion.py`
- Create: `backend/app/services/ingestion_service.py`
- Create: `backend/app/services/mapping_service.py`
- Create: `backend/app/workers/ingestion_worker.py`
- Create: `frontend/src/pages/IngestionPage.tsx`
- Create: `frontend/src/components/ingestion/FileUpload.tsx`
- Create: `frontend/src/components/ingestion/ColumnMapper.tsx`

**Backend implementation:**
- POST `/api/ingestion/upload` — accepts file, stores it, creates UploadJob, triggers AI column mapping
- POST `/api/ingestion/{job_id}/confirm-mapping` — user confirms/corrects mapping, triggers processing
- GET `/api/ingestion/jobs` — list upload jobs with status
- GET `/api/ingestion/{job_id}` — job detail with errors
- POST `/api/ingestion/templates` — save mapping template
- GET `/api/ingestion/templates` — list saved templates
- CRUD `/api/ingestion/rules` — manage mapping rules

**mapping_service.py** calls the Anthropic API (Claude) to:
1. Read CSV headers + first 5 rows
2. Identify data type (roster, claims, eligibility, pharmacy, unknown)
3. Propose column mapping to platform schema fields
4. Apply any existing mapping rules for this source
5. Return proposed mapping for user review

**ingestion_worker.py** (arq background job):
1. Read file with pandas
2. Apply confirmed column mapping
3. Validate each row (required fields, code formats, date parsing)
4. Bulk insert into tenant schema tables (members, claims, etc.)
5. Trigger downstream recalculations (RAF scores, suspects, expenditure aggregation)
6. Update UploadJob with results

**Frontend:**
- Drag-and-drop upload area
- Show AI-proposed mapping with editable dropdowns per column
- Save as template checkbox
- Processing status with progress bar
- Error review table for rejected rows

**Commit after each sub-component works.**

---

## Phase 4: HCC Suspect Engine & Chase Lists

### Task 4.1: SNF Admit Assist Integration Client

**Files:**
- Create: `backend/app/services/snf_client.py`

HTTP client that calls SNF Admit Assist microservice endpoints:
- `/api/validate` — ICD-10 code validation + HCC enrichment
- `/api/optimize` — Run code_optimizer (med-dx gaps, specificity, non-billable fixes)
- `/api/raf` — RAF calculation with disease interactions

### Task 4.2: HCC Engine Service

**Files:**
- Create: `backend/app/services/hcc_engine.py`
- Create: `backend/app/workers/hcc_worker.py`
- Create: `backend/app/routers/hcc.py`
- Create: `frontend/src/pages/SuspectsPage.tsx`
- Create: `frontend/src/components/suspects/ChaseList.tsx`
- Create: `frontend/src/components/suspects/MemberDetail.tsx`

**hcc_engine.py** orchestrates suspect detection for a member:
1. Gather member's claims history (diagnosis codes, medications, dates)
2. Send diagnosis list to SNF Admit Assist `/api/optimize` for:
   - Med-dx gap detection (medication without matching diagnosis)
   - Specificity upgrades (unspecified → specific codes)
   - Non-billable code fixes
3. Send to `/api/raf` for RAF calculation with full demographics (age, sex, Medicaid, disability, institutional)
4. Check for recapture gaps (prior year HCCs not yet coded this year)
5. Check for near-miss disease interactions
6. Check for historical drop-offs (coded 2+ years ago, not recently)
7. Create/update HccSuspect records
8. Create RafHistory snapshot
9. Update Member.current_raf, projected_raf, risk_tier

**hcc_worker.py** — background job that runs HCC engine across entire population after data ingestion.

**API endpoints:**
- GET `/api/hcc/suspects` — paginated, filterable chase list
- GET `/api/hcc/suspects/{member_id}` — all suspects for a member
- PATCH `/api/hcc/suspects/{id}` — update status (capture, dismiss)
- GET `/api/hcc/summary` — aggregate suspect stats (total, by type, by HCC category)
- GET `/api/hcc/export` — CSV/Excel export of chase list

**Frontend — SuspectsPage.tsx:**
- Filterable table: provider, HCC category, risk tier, suspect type, status
- Sort by estimated dollar value (default), RAF uplift, member name
- Each row: member name, DOB, PCP, current RAF, projected RAF, top suspects
- Expandable detail row: full suspect list with evidence, medication list
- Export button (CSV/Excel)
- Summary cards at top: total suspects, total dollar opportunity, avg per member

**Frontend — MemberDetail.tsx:**
- Full suspect list with evidence summaries
- RAF breakdown (demographic + disease + interactions)
- Claims history timeline
- Medication list with dx-linkage status
- Action buttons: capture, dismiss with reason

---

## Phase 5: Population Dashboard

### Task 5.1: Dashboard API & Aggregation

**Files:**
- Create: `backend/app/routers/dashboard.py`
- Create: `backend/app/services/dashboard_service.py`
- Create: `frontend/src/pages/DashboardPage.tsx`
- Create: `frontend/src/components/dashboard/MetricRow.tsx`
- Create: `frontend/src/components/dashboard/RafDistribution.tsx`
- Create: `frontend/src/components/dashboard/InsightPanel.tsx`

**dashboard_service.py** computes:
- Total attributed lives (with MoM trend)
- Average RAF (with trend + benchmark)
- Recapture rate (prior-year HCCs recaptured / total prior-year)
- Suspect inventory (count + total dollar value)
- Total medical spend PMPM (with trend)
- MLR
- RAF distribution histogram
- Top revenue opportunities (by HCC category)
- Cost hotspots (top categories above benchmark)
- Provider mini-leaderboard (top 5 / bottom 5)
- Care gap summary (by measure)

**Caching:** Results cached in Redis with TTL. Invalidated on data ingestion completion.

**Frontend:**
- 6 metric cards at top (design-reset MetricCard component)
- Two-column layout below: left side has RAF distribution chart + revenue opportunity + cost hotspots, right side has InsightPanel (3-5 AI insights)
- Provider mini-leaderboard card
- Care gap summary card
- All charts use Recharts with design-reset color palette

---

## Phase 6: Expenditure Analytics

### Task 6.1: Expenditure Aggregation Service

**Files:**
- Create: `backend/app/services/expenditure_service.py`
- Create: `backend/app/routers/expenditure.py`
- Create: `frontend/src/pages/ExpenditurePage.tsx`
- Create: `frontend/src/components/expenditure/CategoryOverview.tsx`
- Create: `frontend/src/components/expenditure/DrillDown.tsx`
- Create: `frontend/src/components/expenditure/AiRecommendations.tsx`

**expenditure_service.py:**
- Aggregates claims by service_category
- Computes: total spend, PMPM, % of total, MoM trend per category
- Per-category drill-downs:
  - Inpatient: group by facility → DRG analysis, ALOS, readmit rate, cost/admit
  - ED: avoidable classification, obs vs inpatient, frequent utilizers
  - Specialist: group by specialty, referral rate per PCP, network leakage
  - SNF: facility comparison, LOS, rehospitalization, discharge disposition
  - Pharmacy: group by drug class, generic rate, top cost drugs, PDC
  - Home Health/DME: utilization rates, vendor comparison

**AI Optimization Engine** (calls insight_service.py):
- Analyzes expenditure patterns via LLM
- Generates category-specific recommendations with dollar impact
- Stored as Insight records, surfaced inline on expenditure views

**Frontend:**
- Category cards at top (warm neutral design, bar charts for trend)
- Click into category → full drill-down view
- Facility/provider comparison tables
- AI recommendation cards (InsightCard component) inline with relevant data
- All using design-reset palette — NO dark mode from old expenditure prototype

---

## Phase 7: Provider Scorecards

### Task 7.1: Provider Analytics & Scorecard API

**Files:**
- Create: `backend/app/routers/providers.py`
- Create: `backend/app/services/provider_service.py`
- Create: `frontend/src/pages/ProvidersPage.tsx`
- Create: `frontend/src/components/providers/ProviderTable.tsx`
- Create: `frontend/src/components/providers/Scorecard.tsx`
- Create: `frontend/src/components/providers/PeerComparison.tsx`

**provider_service.py:**
- Compute per-provider: panel size, capture rate, recapture rate, avg RAF, PMPM, gap closure rate
- Rank providers within the network (percentile)
- Compare against MSO-configured targets (stored in Tenant.config or Provider.targets)
- AI peer analysis: identify patterns from top performers, generate anonymized best-practice insights
- Color-code tiers: green (meets target), amber (within 10%), red (below)

**Frontend — ProvidersPage.tsx:**
- Sortable/filterable provider table with color-coded performance
- Click into provider → full Scorecard view
- Scorecard: metrics with trend sparklines, peer percentile, configurable targets
- Peer comparison panel: anonymized benchmarks + AI best-practice insights
- Export button for quarterly meetings

**Configurable benchmarks:**
- Settings page (or inline editor) where MSO admin sets target values per metric
- Stored in Tenant.config JSONB or Provider.targets JSONB

---

## Phase 8: Care Gap Tracking

### Task 8.1: Gap Detection Engine & UI

**Files:**
- Create: `backend/app/services/care_gap_service.py`
- Create: `backend/app/routers/care_gaps.py`
- Create: `frontend/src/pages/CareGapsPage.tsx`
- Create: `frontend/src/components/care-gaps/GapTable.tsx`
- Create: `frontend/src/components/care-gaps/MeasureConfig.tsx`

**care_gap_service.py:**
- Pre-loaded HEDIS measure definitions (GapMeasure records seeded on tenant creation)
- Detect gaps from claims data: missing screenings, overdue labs, medication adherence (PDC calculation)
- Compute population-level closure rates per measure
- Compare to Stars cutpoints (3/4/5 star thresholds)
- AI prioritization: rank measures by Stars impact × weight × closeable gap count

**Frontend — CareGapsPage.tsx:**
- Population view: measure table with closure rates, trends, star rating indicator, weight badge
- Member view: all open gaps for selected member with action recommendations
- Provider view: gaps aggregated by provider panel
- Measure configuration page: edit targets, add custom measures, toggle active/inactive
- Export gap-driven chase lists per measure

---

## Phase 9: AI Insight Engine

### Task 9.1: Insight Generation Pipeline

**Files:**
- Create: `backend/app/services/insight_service.py`
- Create: `backend/app/workers/insight_worker.py`
- Create: `backend/app/routers/insights.py`
- Modify: all page components to include InsightPanel where relevant

**insight_service.py:**
- Gathers structured analytics from all modules (HCC suspects, expenditure outliers, care gap risks, provider patterns)
- Packages findings as a structured prompt to Claude
- LLM generates plain-English insights with: title, narrative, dollar impact, recommended action, confidence
- Tags each insight with category and surface locations
- Stores as Insight records

**insight_worker.py:** Runs after data ingestion completes. Re-runs on schedule (daily or on-demand).

**API:**
- GET `/api/insights` — all active insights (filterable by category, surface location)
- PATCH `/api/insights/{id}` — update status (dismiss, bookmark, acted_on)
- POST `/api/insights/regenerate` — force re-run insight generation

**Frontend integration:**
- InsightPanel component already built in Phase 1
- Mount it on: Dashboard (top 5), Expenditure (category-filtered), Provider Scorecard (provider-filtered), Care Gaps (quality-filtered)
- Feedback buttons: dismiss, bookmark, "acted on" — feeds back to the learning loop

---

## Phase 10: Tenant Management & Onboarding

### Task 10.1: Superadmin Tenant CRUD

**Files:**
- Create: `backend/app/routers/tenants.py`
- Create: `backend/app/services/tenant_service.py`
- Create: `frontend/src/pages/admin/TenantsPage.tsx`

**tenant_service.py:**
- Create tenant: provision PostgreSQL schema, run migrations, seed default gap measures, create admin user
- List tenants: status, member count, last data upload
- Update tenant config (benchmarks, targets, custom settings)
- Suspend/reactivate tenant

**User management:**
- CRUD users within a tenant (MSO admin can manage their own users)
- Role assignment
- MFA setup flow (TOTP QR code generation)

---

## Phase 11: Provider Clinical View (EMR Overlay — Mode 2)

The provider-facing experience. A PCP at an MSO-contracted practice opens the Platform in a browser tab alongside eCW (or any EMR). They see patient-level intelligence during the encounter. No EMR integration required — the Platform already has the patient's data from AQTracker + claims ingestion.

### Task 11.1: Patient Search & Context

**Files:**
- Create: `backend/app/routers/patient_view.py`
- Create: `backend/app/services/patient_context_service.py`
- Create: `frontend/src/pages/PatientViewPage.tsx`
- Create: `frontend/src/components/patient/PatientSearch.tsx`
- Create: `frontend/src/components/patient/PatientHeader.tsx`

**patient_context_service.py** assembles a complete patient picture from Platform data:
- Demographics (from member record)
- Full RAF breakdown (demographic + disease + interactions)
- All suspect HCCs with evidence, confidence, RAF value
- All open care gaps with measure weight and recommended action
- Recent claims history (encounters, diagnoses, medications inferred from pharmacy claims)
- Medication list with dx-linkage status (med-dx gap detection)
- Disease interaction map (current interactions + near-misses)
- Provider attribution and visit history

**API endpoints:**
- GET `/api/patient/search?q=` — search by name, DOB, MRN, member ID
- GET `/api/patient/{member_id}/context` — full patient context for clinical view
- POST `/api/patient/{member_id}/capture` — mark a suspect HCC as captured
- POST `/api/patient/{member_id}/close-gap` — mark a care gap as addressed

**Frontend — PatientSearch.tsx:**
- Search bar at top of provider view
- Typeahead with member name, DOB, MRN
- Recent patients list (last 10 the provider looked at)

**Frontend — PatientHeader.tsx:**
- Patient name, age, DOB, MRN, insurance, PCP
- RAF: current → projected with uplift and annualized dollar value
- Uses design-reset warm palette, monospace for numbers

### Task 11.2: Clinical Encounter View

**Files:**
- Create: `frontend/src/components/patient/SuspectPanel.tsx`
- Create: `frontend/src/components/patient/CareGapPanel.tsx`
- Create: `frontend/src/components/patient/VisitPrepCard.tsx`
- Create: `frontend/src/components/patient/MedicationReview.tsx`
- Create: `frontend/src/components/patient/InteractionMap.tsx`
- Create: `frontend/src/components/patient/CaptureButton.tsx`

This is the design-reset encounter view adapted for the overlay use case.

**Layout:** Two-column, matching design-reset prototype:
- **Left (main area):** Visit prep content + action items
- **Right (sidebar, 380px, surfaceAlt bg):** RAF summary, confirmed HCCs, care gaps, near-miss interactions

**VisitPrepCard.tsx — AI-generated visit brief:**
- "Here's what to focus on today" — plain English, 2-3 paragraphs
- Generated by LLM from the patient context data
- Prioritized by dollar impact: "Capturing suspected malnutrition (E44.1, HCC 21) adds $5,005/year. Patient has albumin 3.2 and BMI 20.1."
- Care gaps to close: "HbA1c overdue — order today for CY2026 recapture. Triple-weighted Star measure."
- Near-miss alert: "Adding CKD Stage 5 would trigger DM + CHF + CKD5 triple interaction worth +0.177 RAF. Current eGFR 38 does not qualify — monitor."

**SuspectPanel.tsx:**
- Each suspect: condition name, ICD-10 code, HCC code, RAF value, evidence summary, confidence
- Green "Capture" button per suspect (design-reset style — `#16a34a` bg, white text)
- Captured suspects move to "Confirmed" section with checkmark
- Matches the design-reset suspects block (green soft background `#dcfce7`, no AI badges)

**CareGapPanel.tsx:**
- Each gap: measure name, measure code, Stars weight badge, recommended action
- Amber tag for open gaps, green tag when closed
- Quick action buttons: "Order lab", "Refer", "Schedule f/u"

**MedicationReview.tsx:**
- Current medications (from pharmacy claims)
- Each med shows dx-linkage status (green "Dx linked" tag or amber "No matching dx" flag)
- Unlinked meds = suspect HCC opportunities — highlighted as actionable

**InteractionMap.tsx:**
- Current disease interactions with bonus RAF values
- Near-miss interactions: what one additional capture would trigger
- Simple table, monospace numbers, design-reset styling

**CaptureButton.tsx:**
- When clicked: POST to `/api/patient/{member_id}/capture`
- Updates suspect status to "captured"
- Animates RAF counter upward (projected RAF recalculates)
- Logs the capture event with timestamp and provider

### Task 11.3: Provider Worklist / Today's Patients

**Files:**
- Create: `frontend/src/pages/WorklistPage.tsx`
- Create: `frontend/src/components/worklist/PatientRow.tsx`
- Create: `backend/app/routers/worklist.py`
- Create: `backend/app/services/worklist_service.py`

**worklist_service.py:**
- For a given provider, pull all attributed members with upcoming or recent encounters
- Sort by composite priority: RAF uplift opportunity × care gap count × clinical urgency
- Each patient row shows: name, age, reason for priority, current RAF, suspect count, gap count
- This is the design-reset "Schedule" / "Today's patients" view

**Priority scoring algorithm:**
- RAF dollar opportunity (suspects × RAF value × PMPM benchmark)
- Care gaps to close (weighted by Stars impact)
- Recapture urgency (HCCs expiring this payment year)
- Days since last visit
- Composite score = weighted sum, sorted descending

**API:**
- GET `/api/worklist?provider_id=` — prioritized patient list for a provider
- GET `/api/worklist/summary` — counts by priority tier

**Frontend — WorklistPage.tsx:**
- Matches design-reset ScheduleView: clean table with time, patient name, visit type, reason, RAF, suspects, gaps, chart readiness
- Click patient → opens PatientViewPage with full context
- Priority chips using design-reset Tag component (amber for high, default for medium)
- "Chart ready" badge when patient context is fully assembled

### Task 11.4: AQTracker Data Sync (Hospital/Post-Acute Only)

**Important context:** AQTracker is used for hospital rounding sheets and post-acute encounters ONLY (inpatient, SNF visits). It does NOT cover PCP office/ambulatory visits. Office visits live in eCW and only appear in the Platform via health plan claims data.

**Files:**
- Create: `backend/app/services/aqtracker_client.py`
- Create: `backend/app/workers/aqtracker_sync_worker.py`

**aqtracker_client.py:**
- HTTP client that pulls encounter data from AQTracker's API
- Maps AQTracker entities (rounding sheets, encounters, patients, providers, facilities) to Platform models

**aqtracker_sync_worker.py:**
- Scheduled background job (Redis/arq) that syncs AQTracker data into Platform tenant schemas
- Incremental sync — only pull new/updated records since last sync
- On sync completion, triggers HCC engine + insight generation for affected members

**Key mapping:**
- AQTracker patient → Platform member (match on name + DOB + MRN)
- AQTracker encounter → Platform claim (hospital/post-acute only)
- AQTracker provider → Platform provider (match on NPI)

**Data source hierarchy for the Provider Clinical View:**
1. **Claims data (from health plan)** — PRIMARY source. Covers everything: office visits, inpatient, pharmacy, specialist, labs. This is what powers suspect HCC detection, care gap identification, and RAF calculation for the PCP population.
2. **AQTracker data** — SUPPLEMENTARY. Only hospital/post-acute encounters. Enriches the picture for patients who were recently hospitalized or in SNF.
3. **eCW via FHIR (future)** — ENHANCEMENT. Real-time problem list, meds, labs from the EMR. Not required for launch.

---

## Phase 12: Quality & Compliance Expansion (COMPLETE)

**Built:** Stars Simulator, AWV Tracking, RADV Readiness, TCM Cases

| Component | Router | Service | Page | Status |
|-----------|--------|---------|------|--------|
| Stars Simulator | `stars.py` | `stars_service.py` | `StarsSimulatorPage.tsx` | Done |
| AWV Tracking | `awv.py` | `awv_service.py` | `AWVPage.tsx` | Done |
| RADV Readiness | `radv.py` | `radv_service.py` | `RADVPage.tsx` | Done |
| TCM Cases | `tcm.py` | `tcm_service.py` | `TCMPage.tsx` | Done |

---

## Phase 13: Financial Depth (COMPLETE)

**Built:** Risk Accounting, Practice Expenses, Stop-Loss, BOI/ROI Tracker

| Component | Router | Service | Page | Status |
|-----------|--------|---------|------|--------|
| Risk Accounting | `risk_accounting.py` | `risk_accounting_service.py` | `RiskAccountingPage.tsx` | Done |
| Practice Expenses | `practice_expenses.py` | `practice_expenses_service.py` | `PracticeExpensesPage.tsx` | Done |
| Stop-Loss | `stoploss.py` | `stoploss_service.py` | `StopLossPage.tsx` | Done |
| BOI / ROI | `boi.py` | `boi_service.py` | `BOIPage.tsx` | Done |

---

## Phase 14: Population & Network Intelligence (COMPLETE)

**Built:** Attribution, Alert Rules, Education, Clinical Exchange, Temporal Analytics

| Component | Router | Service | Page | Status |
|-----------|--------|---------|------|--------|
| Attribution | `attribution.py` | `attribution_service.py` | `AttributionPage.tsx` | Done |
| Alert Rules | `alert_rules.py` | `alert_rules_service.py` | `AlertRulesPage.tsx` | Done |
| Education | `education.py` | `education_service.py` | `EducationPage.tsx` | Done |
| Clinical Exchange | `clinical_exchange.py` | `clinical_exchange_service.py` | `ClinicalExchangePage.tsx` | Done |
| Temporal / Time Machine | `temporal.py` | `temporal_service.py` | `TemporalPage.tsx` | Done |

---

## Phase 15: Platform Hardening (COMPLETE)

**Built:** LLM Guard, Role-Based UI, Hierarchical Groups, Tagging System

- **LLM Guard** — Tenant data isolation enforced across all AI calls at the service layer
- **Role-Based UI** — 8 roles with section/page filtering (superadmin, mso_admin, care_manager, pcp_provider, analyst, finance, quality, readonly)
- **Hierarchical Groups** — MSO → practice → location with roll-up analytics
- **Flexible Tagging** — User-defined tags on members, providers, entities for custom segmentation

---

## Phase 16: Future — FHIR Integration with eCW

Once the Platform is live and providers are using the patient view, add FHIR to enrich the data:

- Pull real-time problem list from eCW (current diagnoses the provider has documented)
- Pull current medications (more accurate than pharmacy claims, which lag)
- Pull recent labs (for evidence supporting suspect HCCs — "A1c 8.2 supports E11.65")
- Pull vitals (BMI for obesity suspects, BP for hypertension management)
- Optionally write back: push captured HCCs to eCW problem list via FHIR POST

This is an enhancement, not a requirement. The Platform works without it by using claims + AQTracker data.

---

## Execution Order & Dependencies

```
Phase 1 (Foundation)              — COMPLETE
Phase 2 (Data Models)             — COMPLETE
Phase 3 (Ingestion)               — COMPLETE
Phase 4 (HCC Engine)              — COMPLETE
Phase 5 (Dashboard)               — COMPLETE
Phase 6 (Expenditure)             — COMPLETE
Phase 7 (Providers)               — COMPLETE
Phase 8 (Care Gaps)               — COMPLETE
Phase 9 (Insights)                — COMPLETE
Phase 10 (Tenant Mgmt)            — COMPLETE
Phase 11 (Provider Clinical View) — COMPLETE
Phase 12 (Quality & Compliance)   — COMPLETE (Stars, AWV, RADV, TCM)
Phase 13 (Financial Depth)        — COMPLETE (Risk Accounting, Practice Expenses, Stop-Loss, BOI)
Phase 14 (Population & Network)   — COMPLETE (Attribution, Alert Rules, Education, Exchange, Temporal)
Phase 15 (Platform Hardening)     — COMPLETE (LLM Guard, Role-Based UI, Groups, Tags)
Phase 16 (FHIR / eCW)            — FUTURE (enhancement, not required for launch)
```

**Remaining work (not in phases above):**
- AQTracker connector (live hospital billing data feed)
- Load real MSO data through ingestion pipeline
- FHIR / eCW integration for PCP office overlay
- Full 37 quality measures seeded (currently 13)
- Production deployment (Docker, Kubernetes, HIPAA hardening)
- SOC 2 / HIPAA compliance audit
- Automated report scheduling
- Email/SMS notification system
- User onboarding flow
- CAHPS / member experience tracking
- Medicare Advantage bid support analytics

---

## Testing Strategy

**Backend:** pytest + pytest-asyncio. Each service gets unit tests. Each router gets integration tests with test database.

**Frontend:** Vitest + React Testing Library. Component tests for each UI module.

**End-to-end:** After Phase 3, create a seed script that loads sample MSO data (roster + claims) and verifies the full pipeline: ingestion → HCC detection → dashboard → chase list → expenditure → insights.

**Test database:** Separate PostgreSQL database for tests, created/destroyed per test session via conftest.py fixtures.
