"""Application state management."""


class AppState:
    """Global application state."""

    def __init__(self):
        """Initialize application state."""
        self.startup_complete = False


app_state = AppState()
