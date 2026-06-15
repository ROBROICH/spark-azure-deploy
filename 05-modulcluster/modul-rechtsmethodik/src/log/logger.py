"""Custom logging configuration."""

import logging
from typing import ClassVar, override


class ColoredFormatter(logging.Formatter):
    COLORS: ClassVar[dict[str, str]] = {
        "INFO": "\033[36m",
        "WARNING": "\033[33m",
        "ERROR": "\033[31m",
    }
    RESET: ClassVar[str] = "\033[0m"

    @override
    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, "")
        record.levelname = f"{color}{record.levelname}{self.RESET}"
        return super().format(record)


class Logger:
    def __init__(self, name: str = "app") -> None:
        self.logger = logging.getLogger(name)
        self.logger.setLevel(logging.INFO)

        if not self.logger.handlers:
            console_handler = logging.StreamHandler()
            console_handler.setLevel(logging.INFO)

            formatter = ColoredFormatter(
                "[%(asctime)s] %(levelname)s %(name)s: %(message)s",
                datefmt="%H:%M:%S",
            )
            console_handler.setFormatter(formatter)

            self.logger.addHandler(console_handler)

    def info(self, message: str) -> None:
        self.logger.info(f"{message}")

    def warning(self, message: str) -> None:
        self.logger.warning(f"⚠️ {message}")

    def error(self, message: str) -> None:
        self.logger.error(f"❌ {message}")
