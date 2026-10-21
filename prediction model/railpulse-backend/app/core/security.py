from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException, status
from pwdlib import PasswordHash

from app.core.config import Settings, get_settings


password_hash = PasswordHash.recommended()


class PasswordService:
    """Hashes and verifies user passwords with the configured password hasher."""

    def __init__(self, hasher: PasswordHash | None = None) -> None:
        self._hasher = hasher if hasher is not None else password_hash

    def hash(self, password: str) -> str:
        """Return an Argon2 hash for the supplied plaintext password."""
        return self._hasher.hash(password)

    def verify(self, password: str, hashed_password: str) -> bool:
        """Return True when the plaintext password matches the stored hash."""
        return self._hasher.verify(password, hashed_password)


class TokenService:
    """Creates and decodes the signed JWT access tokens used by the API."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings

    @property
    def settings(self) -> Settings:
        """Resolve settings lazily so configuration is read at call time."""
        return self._settings if self._settings is not None else get_settings()

    def create(self, username: str, role: str) -> str:
        """Return a signed access token for the given user and role."""
        settings = self.settings
        expires_at = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
        payload = {"sub": username, "role": role, "exp": expires_at}
        return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    def decode(self, token: str) -> dict:
        """Decode a token, raising HTTP 401 when it is invalid or expired."""
        settings = self.settings
        try:
            return jwt.decode(
                token,
                settings.JWT_SECRET_KEY,
                algorithms=[settings.JWT_ALGORITHM],
            )
        except jwt.PyJWTError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc


password_service = PasswordService()
token_service = TokenService()


def hash_password(password: str) -> str:
    return password_service.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return password_service.verify(password, hashed_password)


def create_access_token(username: str, role: str) -> str:
    return token_service.create(username, role)


def decode_access_token(token: str) -> dict:
    return token_service.decode(token)
