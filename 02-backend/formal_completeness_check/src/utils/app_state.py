"""Class used to store current app state."""


class AppState:
    def __init__(self) -> None:
        self.startup_complete: bool = False


app_state = AppState()
