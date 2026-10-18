from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings, get_settings
from app.core.security import (
    PasswordService,
    TokenService,
    password_service,
    token_service,
)
from app.db.mongodb import MongoDatabase, db
from app.db.repositories.alert_repository import AlertRepository, alert_repository
from app.db.repositories.prediction_repository import (
    PredictionRepository,
    prediction_repository,
)
from app.db.repositories.train_repository import TrainRepository, train_repository
from app.db.repositories.user_repository import UserRepository, user_repository
from app.ml.model_registry import ModelRegistry, model_registry
from app.services.capability_service import CapabilityService, capability_service
from app.services.demo_data_service import DemoDataService, demo_data_service
from app.services.eta_service import ETAService, default_eta_service
from app.services.feature_service import FeatureService, feature_service


bearer_scheme = HTTPBearer(auto_error=False)


def get_app_settings() -> Settings:
    """Provide the cached application settings."""
    return get_settings()


def get_database() -> MongoDatabase:
    """Provide the shared MongoDB connection holder."""
    return db


def get_user_repository() -> UserRepository:
    """Provide the user repository."""
    return user_repository


def get_train_repository() -> TrainRepository:
    """Provide the train state repository."""
    return train_repository


def get_prediction_repository() -> PredictionRepository:
    """Provide the prediction repository."""
    return prediction_repository


def get_alert_repository() -> AlertRepository:
    """Provide the alert repository."""
    return alert_repository


def get_password_service() -> PasswordService:
    """Provide the password hashing service."""
    return password_service


def get_token_service() -> TokenService:
    """Provide the JWT token service."""
    return token_service


def get_model_registry() -> ModelRegistry:
    """Provide the model registry holding the loaded bundle."""
    return model_registry


def get_feature_service() -> FeatureService:
    """Provide the inference feature builder."""
    return feature_service


def get_eta_service() -> ETAService:
    """Provide the ETA prediction service."""
    return default_eta_service


def get_capability_service() -> CapabilityService:
    """Provide the capability envelope builder."""
    return capability_service


def get_demo_data_service() -> DemoDataService:
    """Provide the demo dataset service."""
    return demo_data_service


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    users: Annotated[UserRepository, Depends(get_user_repository)],
    tokens: Annotated[TokenService, Depends(get_token_service)],
) -> dict:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = tokens.decode(credentials.credentials)
    username = payload.get("sub")
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await users.get(username)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user.pop("_id", None)
    return user


def require_roles(*roles: str):
    async def role_dependency(user: Annotated[dict, Depends(get_current_user)]) -> dict:
        if user.get("role") not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return role_dependency
