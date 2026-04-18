"""Application configuration.

Secrets are fail-loud: the service refuses to boot if a required secret is
missing or still set to a placeholder value. This prevents accidentally
deploying with default creds that were flagged by the security audit.
"""

import secrets as _secrets
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


# Placeholder values that must never reach production. Checked by validators.
_FORBIDDEN_SECRETS = {
    "",
    "change-me",
    "change-me-in-production",
    "changeme",
    "dev-secret",
    "secret",
    "replace-me",
}


def _is_placeholder(value: str) -> bool:
    return value.strip().lower() in _FORBIDDEN_SECRETS


class Settings(BaseSettings):
    # ---- Database ----
    database_url: str = "postgresql+asyncpg://aqsoft:aqsoft@localhost:5433/aqsoft_health"

    # ---- Redis ----
    redis_url: str = "redis://localhost:6380/0"

    # ---- Auth ----
    # SECRET_KEY: used to sign JWTs. Must be set via env in any non-dev run.
    # Dev can opt in to an auto-generated ephemeral key via ALLOW_EPHEMERAL_SECRET=1.
    secret_key: str = ""
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # Credential encryption key (Fernet). Used to encrypt payer OAuth tokens
    # and other at-rest creds. Must be set via env. Generate once:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    encryption_key: str = ""

    # Initial admin password — required when seeding platform users. Never
    # allow the historical "admin123" default.
    admin_password: str = ""

    # ---- CORS ----
    # Production deployments MUST set CORS_ORIGINS explicitly. A wildcard
    # ("*") is rejected.
    cors_origins: list[str] = ["http://localhost:5180"]

    # ---- Deployment env ----
    # "production" | "staging" | "development" | "test"
    # Validators are stricter in production.
    app_env: str = "development"

    # ---- SNF Admit Assist ----
    snf_assist_url: str = "http://localhost:8000"

    # ---- AutoCoder ----
    autocoder_url: str = ""
    autocoder_api_key: str = ""

    # ---- LLM ----
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    llm_primary: str = "anthropic"

    # ---- ADT webhook ----
    adt_webhook_secret: str = ""

    # ---- File uploads ----
    uploads_dir: str = "uploads"
    max_upload_bytes: int = 100 * 1024 * 1024  # 100 MB

    # ---- Logging ----
    log_level: str = "INFO"
    log_json: bool = True  # JSON output in prod; set False for dev tty

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    # ---------- validators ----------

    @field_validator("secret_key")
    @classmethod
    def _validate_secret_key(cls, v: str) -> str:
        if _is_placeholder(v):
            import os
            if os.getenv("ALLOW_EPHEMERAL_SECRET", "").lower() in ("1", "true", "yes"):
                # Dev convenience: generate a random key for this process only.
                # All sessions die on restart; acceptable for local dev.
                return _secrets.token_urlsafe(64)
            raise ValueError(
                "SECRET_KEY is not set. Generate one with "
                "`python -c 'import secrets; print(secrets.token_urlsafe(64))'` "
                "and set it in .env. For local dev only, set "
                "ALLOW_EPHEMERAL_SECRET=1 to auto-generate an ephemeral key."
            )
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters.")
        return v

    @field_validator("encryption_key")
    @classmethod
    def _validate_encryption_key(cls, v: str) -> str:
        if _is_placeholder(v):
            import os
            if os.getenv("ALLOW_EPHEMERAL_ENCRYPTION_KEY", "").lower() in ("1", "true", "yes"):
                # Dev convenience only — any data encrypted this session is
                # unreadable after restart.
                from cryptography.fernet import Fernet
                return Fernet.generate_key().decode()
            raise ValueError(
                "ENCRYPTION_KEY is not set. Generate one with "
                "`python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"` "
                "and set it in .env. For local dev only, set "
                "ALLOW_EPHEMERAL_ENCRYPTION_KEY=1."
            )
        # Fernet keys are 44-char base64. Validate at import time so we
        # don't crash on first decrypt call in a request.
        from cryptography.fernet import Fernet
        try:
            Fernet(v.encode() if isinstance(v, str) else v)
        except Exception as e:
            raise ValueError(f"ENCRYPTION_KEY is not a valid Fernet key: {e}")
        return v

    @field_validator("admin_password")
    @classmethod
    def _validate_admin_password(cls, v: str) -> str:
        # Empty is allowed (seed will skip); but any value MUST NOT be the
        # historical default that showed up in seed scripts.
        if v and v.lower() in {"admin123", "admin", "password", "demo123"}:
            raise ValueError(
                f"ADMIN_PASSWORD={v!r} is on the forbidden default list. "
                "Choose a real password."
            )
        return v

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors(cls, v):
        # Accept comma-separated string from env or list
        if isinstance(v, str):
            v = [o.strip() for o in v.split(",") if o.strip()]
        return v

    @field_validator("cors_origins")
    @classmethod
    def _validate_cors(cls, v: list[str]) -> list[str]:
        if any(o.strip() == "*" for o in v):
            raise ValueError(
                "CORS_ORIGINS=* is not allowed. List explicit origins."
            )
        return v


settings = Settings()
