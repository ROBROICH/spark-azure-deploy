"""XML parser for FPP data extraction."""

import re
import xml.etree.ElementTree as ElementTree
from collections.abc import Callable
from datetime import datetime
from typing import Any

from defusedxml import DefusedXmlException
from defusedxml import ElementTree as ETtree
from event_logging.enums import EventAction, EventCategory, EventOutcome, LogEventDefault

from src.utils.logger import logger

# Bundesland mapping (state codes to names)
BUNDESLAND_MAPPING = {
    "01": "Baden-Württemberg",
    "02": "Bayern",
    "03": "Berlin",
    "04": "Brandenburg",
    "05": "Bremen",
    "06": "Hamburg",
    "07": "Hessen",
    "08": "Mecklenburg-Vorpommern",
    "09": "Niedersachsen",
    "10": "Nordrhein-Westfalen",
    "11": "Rheinland-Pfalz",
    "12": "Saarland",
    "13": "Sachsen",
    "14": "Sachsen-Anhalt",
    "15": "Schleswig-Holstein",
    "16": "Thüringen",
}

# XML namespace
FPP_NAMESPACE = {"ffw": "http://www.lucom.com/ffw/xml-data-1.0.xsd"}


def _parse_xml_root(xml: str) -> ElementTree.Element:
    """
    Parse XML string and return root element.

    Args:
        xml: Raw XML string

    Returns:
        Parsed XML root element

    Raises:
        ValueError: If XML is invalid or unsafe
    """
    try:
        return ETtree.fromstring(xml)
    except DefusedXmlException as e:
        logger.error(
            action=EventAction.VALIDATE,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.FILE,
            default_event=LogEventDefault.VALIDATION_FAILURE,
            message=f"Blocked unsafe XML: {e}",
        )
        raise ValueError("Unsafe XML input detected") from e
    except Exception as e:
        logger.error(
            action=EventAction.VALIDATE,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.FILE,
            default_event=LogEventDefault.VALIDATION_FAILURE,
            message=f"Failed to parse XML: {e}",
        )
        raise ValueError("Invalid XML failed to parse") from e


def _create_element_getter(root: ElementTree.Element) -> Callable[[str, ElementTree.Element | None], str | None]:
    """
    Create a closure function to get element values by ID.

    Args:
        root: XML root element

    Returns:
        Function that gets element value by ID
    """

    def get_element_value(element_id: str, parent: ElementTree.Element | None = None) -> str | None:
        """Get value of element by id attribute."""
        search_root = parent if parent is not None else root
        elem = search_root.find(f".//ffw:element[@id='{element_id}']", FPP_NAMESPACE)
        if elem is None:
            # Try without namespace (fallback)
            elem = search_root.find(f".//*[@id='{element_id}']")
        return elem.text.strip() if elem is not None and elem.text else None

    return get_element_value


def _extract_project_identification(get_value: Callable) -> dict[str, Any]:
    """
    Extract project identification fields.

    Args:
        get_value: Function to get element value by ID

    Returns:
        Dictionary with internal_project_id, name, entry_date
    """
    result: dict[str, Any] = {
        "internal_project_id": get_value("aktenzeichen_eingabe"),
        "name": get_value("v-bezeichnung"),
        "entry_date": None,
    }

    # Parse entry date
    creation_date_str = get_value("creationDate")
    if creation_date_str:
        try:
            # Parse ISO format: 2026-05-04T11:56:42.000+02:00
            dt = datetime.fromisoformat(creation_date_str)
            result["entry_date"] = dt.date()
        except Exception as e:
            logger.error(
                action=EventAction.VALIDATE,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.FILE,
                default_event=LogEventDefault.VALIDATION_FAILURE,
                message=f"Failed to parse creation date '{creation_date_str}': {e}",
            )

    return result


def _extract_company_and_address(get_value: Callable) -> dict[str, str | None]:
    """
    Extract company and address fields with representative fallback.

    Args:
        get_value: Function to get element value by ID

    Returns:
        Dictionary with company, country, street, house_number, plz, location, address_combined
    """
    # Check for optional representative first (overrides VHT if present)
    vertreter_firma = get_value("vertreter_org_name")

    if vertreter_firma:
        # Use representative information
        company = vertreter_firma
        country = get_value("vertreter_anschrift_land")
        hausnummer = get_value("vertreter_anschrift_hausnummer")
        plz = get_value("vertreter_anschrift_postleitzahl")
        location = get_value("vertreter_anschrift_ort")
        address_combined = get_value("vertreter_anschrift_zusatz")
    else:
        # Use VHT information
        company = get_value("tdv_firma")
        country = get_value("tdv_anschrift_land")
        hausnummer = get_value("tdv_anschrift_strasse_hausnummer")
        plz = get_value("tdv_anschrift_postleitzahl")
        location = get_value("tdv_anschrift_ort")
        address_combined = get_value("tdv_anschrift_zusatz")

    # Parse street and house number
    parsed_address = _parse_street_and_number(hausnummer) if hausnummer else {"street": None, "house_number": None}

    return {
        "company": company,
        "country": country,
        "street": parsed_address["street"],
        "house_number": parsed_address["house_number"],
        "plz": plz,
        "location": location,
        "address_combined": address_combined,
    }


def _extract_contact_information(get_value: Callable) -> dict[str, str | None]:
    """
    Extract contact information with cascading fallbacks.

    Priority: Representative → Project Leader → Additional Contact

    Args:
        get_value: Function to get element value by ID

    Returns:
        Dictionary with email, phone, fax
    """
    # Check for optional representative contact (highest priority)
    vertreter_email = get_value("org_vertreter_np_mailadresse")
    vertreter_phone = get_value("vertreter_np_telefonnummer")

    if vertreter_email or vertreter_phone:
        email = vertreter_email
        phone = vertreter_phone
    else:
        # Use project leader contact
        email = get_value("projektleiter-email")
        phone = get_value("projektleiter-telefon")

    # Check for optional additional contact person (lowest priority)
    ap_email = get_value("ap_kontakt_email")
    ap_phone = get_value("ap_kontakt_telefon")
    if ap_email and not email:
        email = ap_email
    if ap_phone and not phone:
        phone = ap_phone

    return {
        "email": email,
        "phone": phone,
        "fax": get_value("projektleiter-fax"),
    }


def _extract_states_from_datasets(root: ElementTree.Element, get_value: Callable) -> str | None:
    """
    Extract unique state names from multiple datasets.

    Args:
        root: XML root element
        get_value: Function to get element value by ID

    Returns:
        Comma-separated string of unique state names, or None
    """
    states = set()

    # Extract from Linked_Gebiet (areas from project)
    linked_gebiet = root.findall(".//ffw:dataset[@id='Linked_Gebiet']/ffw:datarow", FPP_NAMESPACE)
    if not linked_gebiet:
        linked_gebiet = root.findall(".//*[@id='Linked_Gebiet']/*")

    for datarow in linked_gebiet:
        state_code = get_value("gebiet_bundesland", datarow)
        if state_code and state_code in BUNDESLAND_MAPPING:
            states.add(BUNDESLAND_MAPPING[state_code])

    # Extract from Linked_Gebiet_Antrag (additional areas in application)
    linked_gebiet_antrag = root.findall(".//ffw:dataset[@id='Linked_Gebiet_Antrag']/ffw:datarow", FPP_NAMESPACE)
    if not linked_gebiet_antrag:
        linked_gebiet_antrag = root.findall(".//*[@id='Linked_Gebiet_Antrag']/*")

    for datarow in linked_gebiet_antrag:
        state_code = get_value("gebiet_bundesland_antrag", datarow)
        if state_code and state_code in BUNDESLAND_MAPPING:
            states.add(BUNDESLAND_MAPPING[state_code])

    return ", ".join(sorted(states)) if states else None


def _validate_required_fields(result: dict[str, Any]) -> None:
    """
    Validate that required fields are present.

    Args:
        result: Parsed data dictionary

    Raises:
        ValueError: If required fields are missing
    """
    missing_fields = []
    if not result["entry_date"]:
        missing_fields.append("entry_date (creationDate)")

    if missing_fields:
        error_msg = f"Missing required fields in XML: {', '.join(missing_fields)}"
        logger.error(
            action=EventAction.VALIDATE,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.FILE,
            default_event=LogEventDefault.VALIDATION_FAILURE,
            message=error_msg,
        )
        raise ValueError(error_msg)


def parse_fpp_xml(xml: str) -> dict[str, Any]:
    """
    Parse FPP XML with full field extraction according to FPP schema.

    Extracts project information, applicant details, contact information,
    and location data from the structured FPP XML format.

    Args:
        xml: Raw XML string from FPP platform

    Returns:
        Dictionary with extracted fields:
        - internal_project_id: Aktenzeichen
        - name: Vorhabenbezeichnung
        - entry_date: Creation date (parsed from ISO format)
        - company: Company name (VHT or representative)
        - country: Country code (ISO3)
        - street: Street name
        - house_number: House number
        - plz: Postal code
        - location: City/location
        - address_combined: Additional address info (Zusatz)
        - email: Contact email
        - phone: Contact phone
        - fax: Fax number (if available)
        - state: Comma-separated list of German state names
        - xml: Full XML preserved for future processing

    Raises:
        ValueError: If XML is invalid, unsafe, or missing required fields
    """
    # Parse XML
    root = _parse_xml_root(xml)

    # Create element getter function
    get_value = _create_element_getter(root)

    # Initialize result with XML
    result: dict[str, Any] = {"xml": xml}

    # Extract data in logical groups
    result.update(_extract_project_identification(get_value))
    result.update(_extract_company_and_address(get_value))
    result.update(_extract_contact_information(get_value))
    result["state"] = _extract_states_from_datasets(root, get_value)

    # Validate required fields
    _validate_required_fields(result)

    return result


# Security: Maximum length for address fields to prevent ReDoS attacks
MAX_ADDRESS_FIELD_LENGTH = 500


def _parse_street_and_number(combined: str) -> dict[str, str | None]:
    """
    Parse street and house number from combined field using safe string operations.

    Handles formats like:
    - "Rosenweg 12"
    - "Hauptstraße 45a"
    - "Am Markt 3-5"

    Args:
        combined: Combined street and house number string

    Returns:
        Dictionary with 'street' and 'house_number' keys
    """
    result = {"street": None, "house_number": None}

    if not combined:
        return result

    # Security: Enforce length limit to prevent resource exhaustion
    if len(combined) > MAX_ADDRESS_FIELD_LENGTH:
        # Truncate to maximum length and treat as street only
        result["street"] = combined[:MAX_ADDRESS_FIELD_LENGTH].strip()
        return result

    street, sep, number = combined.rstrip().rpartition(" ")

    if not sep:  # No space found - entire string is street
        result["street"] = combined.strip()
        return result

    number_pattern = r"\d+[a-zA-Z]?(?:-\d+[a-zA-Z]?)?"
    if re.fullmatch(number_pattern, number.strip()):
        result["street"] = street.strip()
        result["house_number"] = number.strip()
    else:
        result["street"] = combined.strip()

    return result
