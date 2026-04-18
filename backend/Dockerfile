# syntax=docker/dockerfile:1.6
#
# Hardened runtime for the AQSoft Health backend.
# - Non-root user (`app`, uid 10001) — container escapes can't trivially root-pwn the host
# - Layered install so rebuilds don't reinstall deps unchanged
# - Minimal image: no compilers, no dev tooling, no build cache

FROM python:3.12-slim AS deps

# System deps needed to BUILD some wheels (psycopg2, cryptography). Kept in the
# builder stage only — not in the runtime image.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /install

# Install deps into /install/packages so we can copy them into the final image.
COPY pyproject.toml .
RUN pip install --no-cache-dir --prefix=/install/packages .


FROM python:3.12-slim AS runtime

# Runtime deps only (libpq for asyncpg/psycopg2, curl for the healthcheck).
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 app \
    && useradd  --system --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin app

WORKDIR /app

# Bring in the prebuilt site-packages from the builder stage.
COPY --from=deps /install/packages /usr/local

# Application code — owned by the non-root user.
COPY --chown=app:app . /app

USER app

# Drop any compile caches to keep the layer small. The non-root user can't write
# /usr/local so __pycache__ dirs from deps won't be tainted.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
    CMD curl -fsS http://localhost:8080/health/live || exit 1

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
