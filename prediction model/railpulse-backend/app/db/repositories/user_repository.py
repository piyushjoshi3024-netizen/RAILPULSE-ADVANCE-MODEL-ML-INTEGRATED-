from pymongo.errors import DuplicateKeyError

from app.core.security import PasswordService, password_service
from app.db.mongodb import MongoDatabase
from app.db.repositories.base import BaseRepository


class UserRepository(BaseRepository):
    """Reads and writes application user documents."""

    def __init__(
        self,
        database: MongoDatabase | None = None,
        passwords: PasswordService | None = None,
    ) -> None:
        super().__init__("users", database)
        self._passwords = passwords if passwords is not None else password_service

    async def get(self, username: str) -> dict | None:
        """Return the stored user document, or None when it does not exist."""
        if not self.is_connected:
            return None
        return await self.collection.find_one({"username": username})

    async def create(
        self,
        username: str,
        password: str,
        role: str = "PASSENGER",
        full_name: str | None = None,
    ) -> dict:
        """Create a user with a hashed password and return the stored document."""
        if not self.is_connected:
            raise RuntimeError("Database is not connected")

        document = {
            "username": username,
            "password_hash": self._passwords.hash(password),
            "role": role,
            "full_name": full_name,
        }
        try:
            await self.collection.insert_one(document)
        except DuplicateKeyError as exc:
            raise ValueError("Username already registered") from exc
        return document

    async def seed(self, username: str, password: str, role: str) -> None:
        """Create the named seed account, or realign a drifted one with config.

        admin and staff are the documented demo accounts, and the configured
        ADMIN_PASSWORD / STAFF_PASSWORD is their source of truth. Previously
        this only created an account when absent and never touched an existing
        one, so an account seeded earlier under a different password kept that
        old password forever -- the documented credentials then returned 401
        and could only be recovered by a manual database reset.

        Now, when the account exists but its stored password no longer matches
        the configured value, the password (and role) are brought back in
        line. A normal startup where they already match performs no write.
        """
        if not username or not password or not self.is_connected:
            return

        existing = await self.get(username)
        if existing is None:
            await self.create(username, password, role)
            return

        if not self._passwords.verify(password, existing.get("password_hash", "")):
            await self.collection.update_one(
                {"username": username},
                {"$set": {"password_hash": self._passwords.hash(password), "role": role}},
            )

    async def seed_defaults(self, settings) -> None:
        """Seed the configured admin and staff accounts."""
        await self.seed(settings.ADMIN_USERNAME, settings.ADMIN_PASSWORD, "ADMIN")
        await self.seed(settings.STAFF_USERNAME, settings.STAFF_PASSWORD, "STAFF")


user_repository = UserRepository()


async def get_user(username: str) -> dict | None:
    return await user_repository.get(username)


async def create_user(
    username: str,
    password: str,
    role: str = "PASSENGER",
    full_name: str | None = None,
) -> dict:
    return await user_repository.create(username, password, role, full_name)


async def seed_user(username: str, password: str, role: str) -> None:
    await user_repository.seed(username, password, role)


async def seed_default_users(settings) -> None:
    await user_repository.seed_defaults(settings)
