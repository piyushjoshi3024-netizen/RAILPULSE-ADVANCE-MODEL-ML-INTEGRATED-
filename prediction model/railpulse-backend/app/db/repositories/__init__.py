"""Collection-scoped MongoDB repositories."""

from app.db.repositories.alert_repository import AlertRepository, alert_repository
from app.db.repositories.base import BaseRepository
from app.db.repositories.prediction_repository import PredictionRepository, prediction_repository
from app.db.repositories.reference_repository import ReferenceRepository, reference_repository
from app.db.repositories.train_repository import TrainRepository, train_repository
from app.db.repositories.user_repository import UserRepository, user_repository

__all__ = [
    "AlertRepository",
    "BaseRepository",
    "PredictionRepository",
    "ReferenceRepository",
    "TrainRepository",
    "UserRepository",
    "alert_repository",
    "prediction_repository",
    "reference_repository",
    "train_repository",
    "user_repository",
]
