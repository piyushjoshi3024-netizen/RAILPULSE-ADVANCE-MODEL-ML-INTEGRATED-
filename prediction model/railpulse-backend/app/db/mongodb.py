import logging

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class MongoDatabase:
    """Owns the MongoDB client lifecycle and the collection index contract."""

    def __init__(self) -> None:
        self.client: AsyncIOMotorClient | None = None
        self.db = None

    async def connect(self) -> None:
        """Open the MongoDB client and verify connectivity with a ping."""
        settings = get_settings()
        logger.info("Connecting to MongoDB...")
        self.client = AsyncIOMotorClient(
            settings.MONGODB_URI,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=10000,
        )
        self.db = self.client[settings.MONGODB_DB]
        await self.db.command("ping")
        logger.info("Connected to MongoDB.")

    async def ensure_indexes(self) -> None:
        """Create the indexes the application relies on, if a database is bound."""
        if self.db is None:
            return
        await self.db["users"].create_index("username", unique=True)
        await self.db["live_train_state"].create_index("train_number", unique=True)
        await self.db["simulation_states"].create_index("train_number", unique=True)
        await self.db["predictions"].create_index([("train_number", 1), ("timestamp", -1)])
        await self.db["alerts"].create_index([("train_number", 1), ("created_at", -1)])
        await self.db["alerts"].create_index("acknowledged")

    async def close(self) -> None:
        """Close the MongoDB client and clear the bound handles."""
        logger.info("Closing MongoDB connection...")
        if self.client:
            self.client.close()
            self.client = None
            self.db = None
        logger.info("MongoDB connection closed.")


db = MongoDatabase()


async def connect_to_mongo() -> None:
    await db.connect()


async def ensure_indexes() -> None:
    await db.ensure_indexes()


async def close_mongo_connection() -> None:
    await db.close()
