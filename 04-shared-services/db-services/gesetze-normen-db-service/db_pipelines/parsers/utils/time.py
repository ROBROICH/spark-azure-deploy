"""datetime utils"""

from datetime import datetime
from zoneinfo import ZoneInfo


def get_current_time() -> str:
    """Return the current date (parse-date) in the correct form"""
    berlin_tz = ZoneInfo("Europe/Berlin")
    return datetime.now(berlin_tz).strftime("%Y%m%d%H%M%S")


def get_current_time_iso(ms: bool = False) -> str:
    """Returns the current date in ISO-format"""
    berlin_tz = ZoneInfo("Europe/Berlin")
    if ms:
        return datetime.now(berlin_tz).strftime("%Y-%m-%dT%H:%M:%S.%f") + "Z"
    return datetime.now(berlin_tz).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

def german_to_english_month(german_month: str) -> str:
    """Convert German full month name to English for datetime %B parsing."""
    german_months = {
        "Januar": "January",
        "Februar": "February",
        "März": "March",
        "April": "April",
        "Mai": "May",
        "Juni": "June",
        "Juli": "July",
        "August": "August",
        "September": "September",
        "Oktober": "October",
        "November": "November",
        "Dezember": "December"
    }
    try:
        return german_months[german_month]
    except KeyError:
        raise ValueError(f"Invalid German month name: {german_month}")