"""Unit tests for exception handler registration."""

from fastapi import FastAPI
from node_crud.exceptions import (
    InvalidParentTypeError,
    InvalidPayloadError,
    NodeNotFoundError,
    UnknownNodeTypeError,
)

from src.config.handlers import register_exception_handlers


def test_node_crud_exceptions_are_registered() -> None:
    """register_exception_handlers wires a handler for every node-crud exception."""
    app = FastAPI()
    register_exception_handlers(app)

    for exc_class in (
        NodeNotFoundError,
        UnknownNodeTypeError,
        InvalidParentTypeError,
        InvalidPayloadError,
    ):
        assert exc_class in app.exception_handlers
