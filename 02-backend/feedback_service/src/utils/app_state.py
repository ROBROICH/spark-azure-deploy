"""Class used to store current app state."""


class AppState:
    """Application state container."""

    def __init__(self) -> None:
        """Initialize app state."""
        self.startup_complete = False


app_state = AppState()
