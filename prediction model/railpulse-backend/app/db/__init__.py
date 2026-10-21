"""MongoDB connection management."""

from app.db.mongodb import (
    MongoDatabase,
    close_mongo_connection,
    connect_to_mongo,
    db,
    ensure_indexes,
)

__all__ = [
    "MongoDatabase",
    "close_mongo_connection",
    "connect_to_mongo",
    "db",
    "ensure_indexes",
]
