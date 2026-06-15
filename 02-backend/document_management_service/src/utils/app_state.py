"""Class used to store current app state."""

from sqlalchemy.util.concurrency import asyncio

from src.services.storage_provider.storage_provider_base_service import (
    BaseStorageProviderService,
)


class AppState:
    """Global application state for shared providers and background tasks."""

    def __init__(self):
        self.startup_complete = False
        self.storage_provider_service: BaseStorageProviderService | None = None
        self.quarantine_storage_provider_service: BaseStorageProviderService | None = None
        self.background_tasks: list[asyncio.Task] = []


app_state = AppState()
