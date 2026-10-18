"""Pydantic request and response contracts."""

from app.schemas.auth import (
    LoginRequest,
    Role,
    TokenResponse,
    UserRegisterRequest,
    UserResponse,
)
from app.schemas.capabilities import (
    AlertResponse,
    AlertsResponse,
    CapabilityStatus,
    DelayPropagationResponse,
    LiveStateUpdateResponse,
    OperationalRiskResponse,
    PredictionHistoryResponse,
    SimulationStateResponse,
    UpcomingStationETA,
    UpcomingStationETAResponse,
)
from app.schemas.prediction import PredictionResponse, StationETA, StationsPredictionResponse
from app.schemas.train import (
    DemoSeedResponse,
    TrainListItem,
    TrainListResponse,
    TrainStateRequest,
)

__all__ = [
    "AlertResponse",
    "AlertsResponse",
    "CapabilityStatus",
    "DelayPropagationResponse",
    "DemoSeedResponse",
    "LiveStateUpdateResponse",
    "LoginRequest",
    "OperationalRiskResponse",
    "PredictionHistoryResponse",
    "PredictionResponse",
    "Role",
    "SimulationStateResponse",
    "StationETA",
    "StationsPredictionResponse",
    "TokenResponse",
    "TrainListItem",
    "TrainListResponse",
    "TrainStateRequest",
    "UpcomingStationETA",
    "UpcomingStationETAResponse",
    "UserRegisterRequest",
    "UserResponse",
]
