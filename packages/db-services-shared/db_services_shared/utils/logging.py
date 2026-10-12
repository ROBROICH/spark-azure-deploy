"""Centralized event logger initialization."""

from event_logging.event_logger import EventLogger

from db_services_shared.config.settings import CommonSettings

def get_logger(service_name):
    return EventLogger(service_name=service_name)
