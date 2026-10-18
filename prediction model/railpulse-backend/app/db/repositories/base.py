from app.db.mongodb import MongoDatabase, db


class BaseRepository:
    """Base class binding a repository to one MongoDB collection.

    The collection handle is resolved on every access rather than cached, so a
    database swapped in at runtime (for example by a test fixture) is honoured.
    """

    def __init__(self, collection_name: str, database: MongoDatabase | None = None) -> None:
        self.collection_name = collection_name
        self._database = database

    @property
    def database(self) -> MongoDatabase:
        """Return the bound database, defaulting to the shared instance."""
        return self._database if self._database is not None else db

    @property
    def is_connected(self) -> bool:
        """Return True when a database handle is currently bound."""
        return self.database.db is not None

    @property
    def collection(self):
        """Return the live collection handle for this repository."""
        return self.database.db[self.collection_name]
