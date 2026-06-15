"""Tests for XML parser."""

import pytest

from src.services.xml_parser import (
    _parse_street_and_number,
    parse_fpp_xml,
)


@pytest.fixture
def valid_complete_xml():
    """Complete FPP XML with all fields."""
    return """<?xml version="1.0" encoding="UTF-8"?>
<ffw:form xmlns:ffw="http://www.lucom.com/ffw/xml-data-1.0.xsd">
    <ffw:element id="aktenzeichen_eingabe">FPP-2026-001</ffw:element>
    <ffw:element id="v-bezeichnung">Neubau Bundesstraße B123</ffw:element>
    <ffw:element id="creationDate">2026-05-04T11:56:42.000+02:00</ffw:element>
    <ffw:element id="tdv_firma">Bauunternehmen GmbH</ffw:element>
    <ffw:element id="tdv_anschrift_land">DEU</ffw:element>
    <ffw:element id="tdv_anschrift_strasse_hausnummer">Hauptstraße 45</ffw:element>
    <ffw:element id="tdv_anschrift_postleitzahl">10115</ffw:element>
    <ffw:element id="tdv_anschrift_ort">Berlin</ffw:element>
    <ffw:element id="tdv_anschrift_zusatz">Gebäude A</ffw:element>
    <ffw:element id="projektleiter-email">projekt@example.com</ffw:element>
    <ffw:element id="projektleiter-telefon">+49 30 12345678</ffw:element>
    <ffw:element id="projektleiter-fax">+49 30 12345679</ffw:element>
    <ffw:dataset id="Linked_Gebiet">
        <ffw:datarow>
            <ffw:element id="gebiet_bundesland">03</ffw:element>
        </ffw:datarow>
    </ffw:dataset>
</ffw:form>"""


@pytest.fixture
def minimal_xml():
    """Minimal FPP XML with only required fields."""
    return """<?xml version="1.0" encoding="UTF-8"?>
<ffw:form xmlns:ffw="http://www.lucom.com/ffw/xml-data-1.0.xsd">
    <ffw:element id="aktenzeichen_eingabe">FPP-MIN-001</ffw:element>
    <ffw:element id="v-bezeichnung">Minimal Project</ffw:element>
    <ffw:element id="creationDate">2026-05-04T11:56:42.000+02:00</ffw:element>
</ffw:form>"""


@pytest.fixture
def xml_with_representative():
    """FPP XML with representative (vertreter) data."""
    return """<?xml version="1.0" encoding="UTF-8"?>
<ffw:form xmlns:ffw="http://www.lucom.com/ffw/xml-data-1.0.xsd">
    <ffw:element id="aktenzeichen_eingabe">FPP-REP-001</ffw:element>
    <ffw:element id="v-bezeichnung">Project with Representative</ffw:element>
    <ffw:element id="creationDate">2026-05-04T11:56:42.000+02:00</ffw:element>
    <ffw:element id="vertreter_org_name">Vertreter GmbH</ffw:element>
    <ffw:element id="vertreter_anschrift_land">DEU</ffw:element>
    <ffw:element id="vertreter_anschrift_hausnummer">Rosenweg 12a</ffw:element>
    <ffw:element id="vertreter_anschrift_postleitzahl">80331</ffw:element>
    <ffw:element id="vertreter_anschrift_ort">München</ffw:element>
    <ffw:element id="vertreter_anschrift_zusatz">2. OG</ffw:element>
    <ffw:element id="org_vertreter_np_mailadresse">vertreter@example.com</ffw:element>
    <ffw:element id="vertreter_np_telefonnummer">+49 89 98765432</ffw:element>
</ffw:form>"""


@pytest.fixture
def xml_with_multiple_states():
    """FPP XML with multiple Bundesländer."""
    return """<?xml version="1.0" encoding="UTF-8"?>
<ffw:form xmlns:ffw="http://www.lucom.com/ffw/xml-data-1.0.xsd">
    <ffw:element id="aktenzeichen_eingabe">FPP-MULTI-001</ffw:element>
    <ffw:element id="v-bezeichnung">Multi-State Project</ffw:element>
    <ffw:element id="creationDate">2026-05-04T11:56:42.000+02:00</ffw:element>
    <ffw:dataset id="Linked_Gebiet">
        <ffw:datarow>
            <ffw:element id="gebiet_bundesland">01</ffw:element>
        </ffw:datarow>
        <ffw:datarow>
            <ffw:element id="gebiet_bundesland">02</ffw:element>
        </ffw:datarow>
    </ffw:dataset>
    <ffw:dataset id="Linked_Gebiet_Antrag">
        <ffw:datarow>
            <ffw:element id="gebiet_bundesland_antrag">03</ffw:element>
        </ffw:datarow>
    </ffw:dataset>
</ffw:form>"""


def test_parse_fpp_xml_complete(valid_complete_xml):
    """Test parsing complete FPP XML with all fields."""
    result = parse_fpp_xml(valid_complete_xml)

    # Required fields
    assert result["internal_project_id"] == "FPP-2026-001"
    assert result["name"] == "Neubau Bundesstraße B123"
    assert result["entry_date"].isoformat() == "2026-05-04"

    # Company and address
    assert result["company"] == "Bauunternehmen GmbH"
    assert result["country"] == "DEU"
    assert result["street"] == "Hauptstraße"
    assert result["house_number"] == "45"
    assert result["plz"] == "10115"
    assert result["location"] == "Berlin"
    assert result["address_combined"] == "Gebäude A"

    # Contact information
    assert result["email"] == "projekt@example.com"
    assert result["phone"] == "+49 30 12345678"
    assert result["fax"] == "+49 30 12345679"

    # State
    assert result["state"] == "Berlin"

    # XML preserved
    assert result["xml"] == valid_complete_xml


def test_parse_fpp_xml_minimal(minimal_xml):
    """Test parsing minimal FPP XML with only required fields."""
    result = parse_fpp_xml(minimal_xml)

    # Required fields present
    assert result["internal_project_id"] == "FPP-MIN-001"
    assert result["name"] == "Minimal Project"
    assert result["entry_date"].isoformat() == "2026-05-04"

    # Optional fields are None
    assert result["company"] is None
    assert result["country"] is None
    assert result["street"] is None
    assert result["house_number"] is None
    assert result["plz"] is None
    assert result["location"] is None
    assert result["address_combined"] is None
    assert result["email"] is None
    assert result["phone"] is None
    assert result["fax"] is None
    assert result["state"] is None


def test_parse_fpp_xml_with_representative(xml_with_representative):
    """Test that representative data takes precedence over VHT data."""
    result = parse_fpp_xml(xml_with_representative)

    # Representative data should be used
    assert result["company"] == "Vertreter GmbH"
    assert result["country"] == "DEU"
    assert result["street"] == "Rosenweg"
    assert result["house_number"] == "12a"
    assert result["plz"] == "80331"
    assert result["location"] == "München"
    assert result["address_combined"] == "2. OG"
    assert result["email"] == "vertreter@example.com"
    assert result["phone"] == "+49 89 98765432"


def test_parse_fpp_xml_with_multiple_states(xml_with_multiple_states):
    """Test parsing XML with multiple Bundesländer."""
    result = parse_fpp_xml(xml_with_multiple_states)

    # Should contain all three states, sorted
    assert result["state"] == "Baden-Württemberg, Bayern, Berlin"


def test_parse_fpp_xml_missing_required_field():
    """Test that ValueError is raised when required fields are missing."""
    xml_missing_name = """<?xml version="1.0" encoding="UTF-8"?>
<ffw:form xmlns:ffw="http://www.lucom.com/ffw/xml-data-1.0.xsd">
    <ffw:element id="aktenzeichen_eingabe">FPP-2026-001</ffw:element>
</ffw:form>"""

    with pytest.raises(ValueError) as exc_info:
        parse_fpp_xml(xml_missing_name)

    assert "Missing required fields" in str(exc_info.value)
    assert "entry_date (creationDate)" in str(exc_info.value)


def test_parse_fpp_xml_invalid_xml():
    """Test that ValueError is raised for invalid XML."""
    invalid_xml = "<invalid>not closed"

    with pytest.raises(ValueError) as exc_info:
        parse_fpp_xml(invalid_xml)

    assert "Invalid XML" in str(exc_info.value)


def test_parse_fpp_xml_unsafe_xml():
    """Test that unsafe XML (XXE attack) is blocked."""
    xxe_xml = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<ffw:form xmlns:ffw="http://www.lucom.com/ffw/xml-data-1.0.xsd">
    <ffw:element id="aktenzeichen_eingabe">&xxe;</ffw:element>
</ffw:form>"""

    with pytest.raises(ValueError) as exc_info:
        parse_fpp_xml(xxe_xml)

    assert "Unsafe XML" in str(exc_info.value) or "Invalid XML" in str(exc_info.value)


def test_parse_street_and_number_standard():
    """Test parsing standard street and house number."""
    result = _parse_street_and_number("Rosenweg 12")

    assert result["street"] == "Rosenweg"
    assert result["house_number"] == "12"


def test_parse_street_and_number_with_letter():
    """Test parsing house number with letter suffix."""
    result = _parse_street_and_number("Hauptstraße 45a")

    assert result["street"] == "Hauptstraße"
    assert result["house_number"] == "45a"


def test_parse_street_and_number_with_range():
    """Test parsing house number with range."""
    result = _parse_street_and_number("Am Markt 3-5")

    assert result["street"] == "Am Markt"
    assert result["house_number"] == "3-5"


def test_parse_street_and_number_no_number():
    """Test parsing street without house number."""
    result = _parse_street_and_number("Hauptstraße")

    assert result["street"] == "Hauptstraße"
    assert result["house_number"] is None


def test_parse_street_and_number_empty():
    """Test parsing empty string."""
    result = _parse_street_and_number("")

    assert result["street"] is None
    assert result["house_number"] is None


def test_parse_street_and_number_none():
    """Test parsing None."""
    result = _parse_street_and_number(None)

    assert result["street"] is None
    assert result["house_number"] is None


def test_parse_fpp_xml_without_namespace():
    """Test parsing XML without namespace (fallback)."""
    xml_no_namespace = """<?xml version="1.0" encoding="UTF-8"?>
<form>
    <element id="aktenzeichen_eingabe">FPP-NO-NS-001</element>
    <element id="v-bezeichnung">No Namespace Project</element>
    <element id="creationDate">2026-05-04T11:56:42.000+02:00</element>
</form>"""

    result = parse_fpp_xml(xml_no_namespace)

    assert result["internal_project_id"] == "FPP-NO-NS-001"
    assert result["name"] == "No Namespace Project"
    assert result["entry_date"].isoformat() == "2026-05-04"


def test_parse_fpp_xml_with_additional_contact():
    """Test that additional contact person is used as fallback."""
    xml_with_ap = """<?xml version="1.0" encoding="UTF-8"?>
<ffw:form xmlns:ffw="http://www.lucom.com/ffw/xml-data-1.0.xsd">
    <ffw:element id="aktenzeichen_eingabe">FPP-AP-001</ffw:element>
    <ffw:element id="v-bezeichnung">Project with AP</ffw:element>
    <ffw:element id="creationDate">2026-05-04T11:56:42.000+02:00</ffw:element>
    <ffw:element id="ap_kontakt_email">ap@example.com</ffw:element>
    <ffw:element id="ap_kontakt_telefon">+49 123 456789</ffw:element>
</ffw:form>"""

    result = parse_fpp_xml(xml_with_ap)

    # AP contact should be used as fallback
    assert result["email"] == "ap@example.com"
    assert result["phone"] == "+49 123 456789"


def test_parse_fpp_xml_contact_priority():
    """Test contact information priority: representative > project leader > AP."""
    xml_all_contacts = """<?xml version="1.0" encoding="UTF-8"?>
<ffw:form xmlns:ffw="http://www.lucom.com/ffw/xml-data-1.0.xsd">
    <ffw:element id="aktenzeichen_eingabe">FPP-PRIO-001</ffw:element>
    <ffw:element id="v-bezeichnung">Priority Test</ffw:element>
    <ffw:element id="creationDate">2026-05-04T11:56:42.000+02:00</ffw:element>
    <ffw:element id="org_vertreter_np_mailadresse">vertreter@example.com</ffw:element>
    <ffw:element id="vertreter_np_telefonnummer">+49 111 111111</ffw:element>
    <ffw:element id="projektleiter-email">projektleiter@example.com</ffw:element>
    <ffw:element id="projektleiter-telefon">+49 222 222222</ffw:element>
    <ffw:element id="ap_kontakt_email">ap@example.com</ffw:element>
    <ffw:element id="ap_kontakt_telefon">+49 333 333333</ffw:element>
</ffw:form>"""

    result = parse_fpp_xml(xml_all_contacts)

    # Representative should have highest priority
    assert result["email"] == "vertreter@example.com"
    assert result["phone"] == "+49 111 111111"


# Security tests for ReDoS protection


def test_parse_street_and_number_with_complex_range():
    """Test parsing house number with complex range including letters."""
    result = _parse_street_and_number("Berliner Straße 12a-14b")

    assert result["street"] == "Berliner Straße"
    assert result["house_number"] == "12a-14b"


def test_parse_street_and_number_invalid_format():
    """Test that invalid house number format falls back to street only."""
    result = _parse_street_and_number("Hauptstraße ABC")

    # Invalid format - entire string should be treated as street
    assert result["street"] == "Hauptstraße ABC"
    assert result["house_number"] is None


def test_parse_street_and_number_multiple_spaces():
    """Test parsing with multiple spaces (should use last space)."""
    result = _parse_street_and_number("Am Alten Markt 15")

    # Should split on last space
    assert result["street"] == "Am Alten Markt"
    assert result["house_number"] == "15"


def test_parse_street_and_number_trailing_spaces():
    """Test parsing with trailing spaces."""
    result = _parse_street_and_number("Rosenweg 12   ")

    assert result["street"] == "Rosenweg"
    assert result["house_number"] == "12"


def test_parse_street_and_number_leading_spaces():
    """Test parsing with leading spaces."""
    result = _parse_street_and_number("   Rosenweg 12")

    assert result["street"] == "Rosenweg"
    assert result["house_number"] == "12"


def test_parse_street_and_number_max_length_exceeded():
    """Test that addresses exceeding max length are truncated safely."""
    from src.services.xml_parser import MAX_ADDRESS_FIELD_LENGTH

    # Create an address that exceeds the maximum length
    long_street = "A" * (MAX_ADDRESS_FIELD_LENGTH + 100)
    result = _parse_street_and_number(long_street)

    # Should be truncated to max length
    assert result["street"] == "A" * MAX_ADDRESS_FIELD_LENGTH
    assert result["house_number"] is None
    assert len(result["street"]) == MAX_ADDRESS_FIELD_LENGTH


def test_parse_street_and_number_redos_protection():
    """Test that potential ReDoS patterns are handled safely.

    This test verifies that the new implementation using rpartition()
    handles patterns that would cause catastrophic backtracking in the
    old regex-based implementation.
    """
    # Pattern that would cause ReDoS with old regex: many spaces followed by non-digit
    redos_pattern = "Street Name" + " " * 1000 + "X"
    result = _parse_street_and_number(redos_pattern)

    # Should complete quickly in O(n) time - the key security improvement
    # rpartition splits on last space: "Street Name" + spaces vs "X"
    # "X" doesn't match house number pattern, so falls back to combined.strip()
    # which collapses all whitespace, leaving just the first two words
    assert result["street"] == "Street Name"
    assert result["house_number"] is None


def test_parse_street_and_number_edge_case_only_number():
    """Test parsing when input is only a number."""
    result = _parse_street_and_number("123")

    # No space, so entire string is street
    assert result["street"] == "123"
    assert result["house_number"] is None


def test_parse_street_and_number_special_characters():
    """Test parsing with special characters in street name."""
    result = _parse_street_and_number("Straße-der-Einheit 42")

    assert result["street"] == "Straße-der-Einheit"
    assert result["house_number"] == "42"


def test_parse_street_and_number_unicode():
    """Test parsing with unicode characters."""
    result = _parse_street_and_number("Königstraße 99")

    assert result["street"] == "Königstraße"
    assert result["house_number"] == "99"
