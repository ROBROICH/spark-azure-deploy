from __future__ import annotations

import io
import json
from enum import Enum
from pathlib import Path
from typing import Any

import event_logging
import pytest
from event_logging.context import project_id_var, request_context, trace_id_var
from event_logging.enums import (
    AiDecisionHumanOverride,
    DatabaseOperation,
    EventAction,
    EventCategory,
    EventKind,
    EventOutcome,
    EventType,
    LogEventAuth,
    LogEventDefault,
    LogEventLegal,
    LogEventSystem,
    LogLevel,
    ServiceComponent,
    ServiceName,
    UserType,
)
from event_logging.event_logger import EventLogger
from event_logging.settings import LoggingSettings

FIXTURES = Path(__file__).parents[1] / "fixtures" / "core"
FIXED_TIMESTAMP = "2026-07-16T12:34:56.789Z"

VOCABULARY: dict[str, type[Enum]] = {
    "LogEventDefault": LogEventDefault,
    "LogEventSystem": LogEventSystem,
    "LogEventAuth": LogEventAuth,
    "LogEventLegal": LogEventLegal,
    "LogLevel": LogLevel,
    "EventAction": EventAction,
    "EventCategory": EventCategory,
    "EventOutcome": EventOutcome,
    "EventType": EventType,
    "ServiceName": ServiceName,
    "EventKind": EventKind,
    "ServiceComponent": ServiceComponent,
    "UserType": UserType,
    "AiDecisionHumanOverride": AiDecisionHumanOverride,
    "DatabaseOperation": DatabaseOperation,
}


def _read_fixture(name: str) -> Any:
    with (FIXTURES / name).open(encoding="utf-8") as fixture:
        return json.load(fixture)


def _enum_or_none(enum_type: type[Enum], value: str | None) -> Enum | None:
    return enum_type(value) if value is not None else None


def test_python_vocabulary_matches_canonical_fixture() -> None:
    fixture = _read_fixture("vocabulary.json")

    assert set(fixture) == set(VOCABULARY)
    for name, enum_type in VOCABULARY.items():
        assert [member.value for member in enum_type] == fixture[name]


def test_python_compatibility_exports_remain_available() -> None:
    assert event_logging.EventLogger is EventLogger
    assert event_logging.EventAction is EventAction
    assert event_logging.EventCategory is EventCategory
    assert event_logging.EventOutcome is EventOutcome
    assert event_logging.request_context is request_context


@pytest.mark.parametrize("case", _read_fixture("events.json"), ids=lambda case: case["name"])
def test_python_logger_matches_complete_event_fixture(case: dict[str, Any]) -> None:
    logger_options = case["logger"]
    stream = io.StringIO()
    logger = EventLogger(
        service_name=logger_options["service_name"],
        service_component=_enum_or_none(ServiceComponent, logger_options.get("service_component")),
        default_context=logger_options.get("default_context", {}),
        settings=LoggingSettings.model_validate({"ENV": "production", "LOG_LEVEL": "DEBUG"}),
        stream=stream,
        timestamp_factory=lambda: FIXED_TIMESTAMP,
    )
    fixture_input = case["input"]

    event = logger.log_event(
        level=LogLevel(fixture_input["level"]),
        action=fixture_input["action"],
        outcome=fixture_input["outcome"],
        category=fixture_input["category"],
        default_event=_enum_or_none(LogEventDefault, fixture_input.get("default_event")),
        system_event=_enum_or_none(LogEventSystem, fixture_input.get("system_event")),
        auth_event=_enum_or_none(LogEventAuth, fixture_input.get("auth_event")),
        legal_event=_enum_or_none(LogEventLegal, fixture_input.get("legal_event")),
        event_kind=EventKind(fixture_input.get("event_kind", EventKind.EVENT.value)),
        message=fixture_input.get("message"),
        **fixture_input["context"],
    )

    assert event == case["expected"]
    serialized = stream.getvalue()
    assert serialized.endswith("\n")
    assert "\n" not in serialized[:-1]
    assert json.loads(serialized) == case["expected"]
    if "Änderung" in json.dumps(case["expected"], ensure_ascii=False):
        assert "Änderung" in serialized


def test_python_convenience_methods_preserve_all_levels() -> None:
    stream = io.StringIO()
    logger = EventLogger(
        service_name="fixture-service",
        stream=stream,
        timestamp_factory=lambda: FIXED_TIMESTAMP,
    )

    for method_name, level in (
        ("debug", "debug"),
        ("info", "info"),
        ("warn", "warn"),
        ("error", "error"),
        ("fatal", "fatal"),
    ):
        event = getattr(logger, method_name)(
            action=EventAction.READ,
            outcome=EventOutcome.SUCCESS,
            category=EventCategory.API,
        )
        assert event["log.level"] == level


def test_python_explicit_context_precedes_active_context_and_resets() -> None:
    stream = io.StringIO()
    logger = EventLogger(
        service_name="fixture-service",
        stream=stream,
        timestamp_factory=lambda: FIXED_TIMESTAMP,
    )

    assert project_id_var.get() is None
    assert trace_id_var.get() is None
    with request_context(project_id="context-project", trace_id="context-trace"):
        inherited = logger.info(
            action=EventAction.READ,
            outcome=EventOutcome.SUCCESS,
            category=EventCategory.API,
        )
        explicit = logger.info(
            action=EventAction.READ,
            outcome=EventOutcome.SUCCESS,
            category=EventCategory.API,
            project_id="explicit-project",
            trace_id="explicit-trace",
        )

    assert inherited["project_id"] == "context-project"
    assert inherited["trace.id"] == "context-trace"
    assert explicit["project_id"] == "explicit-project"
    assert explicit["trace.id"] == "explicit-trace"
    assert project_id_var.get() is None
    assert trace_id_var.get() is None
