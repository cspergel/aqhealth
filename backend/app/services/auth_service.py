from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Validate bcrypt works at import time — warn instead of crashing on import.
# A hard crash here prevents test collection and app startup diagnostics.
try:
    _test_hash = pwd_context.hash("startup_check")
    assert pwd_context.verify("startup_check", _test_hash)
except Exception as _e:
    import warnings
    warnings.warn(
        f"Password hashing is broken: {_e}. "
        "This usually means bcrypt >= 4.1 is installed which is incompatible with passlib. "
        "Fix: pip install 'bcrypt<4.1'. Auth endpoints will fail until resolved.",
        RuntimeWarning,
        stacklevel=1,
    )


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
