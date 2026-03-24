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

    # File uploads
    uploads_dir: str = "uploads"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
