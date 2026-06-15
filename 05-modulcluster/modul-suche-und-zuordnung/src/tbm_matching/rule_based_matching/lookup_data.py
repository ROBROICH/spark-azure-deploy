"""Static lookup rules mapping law references to required document types for rule-based matching."""

from dataclasses import dataclass


@dataclass(frozen=True)
class MatchingRule:
    """A rule mapping a law paragraph (with optional absatz/satz) to a set of document types."""

    number: str | tuple[str, str] | None  # single, range, or wildcard
    law: str | None  # None = wildcard
    absatz: str | None  # None = wildcard
    satz: str | None  # None = wildcard
    documents: tuple[str, ...]


LOOKUP_RULES = [
    MatchingRule("43l", "EnWG", "1", "1", ("Erläuterungsbericht",)),
    MatchingRule("43l", "EnWG", "2", "1", ("Erläuterungsbericht",)),
    MatchingRule(
        "43l",
        "EnWG",
        "3",
        "1",
        (
            "Erläuterungsbericht",
            "(Ggf. vorläufige landesplanerische Stellungnahme / Landesplanerische Beurteilung)",
            "(Ggf. Alternativen- / Variantenprüfung bzw. Beschreibung der relevanten, vernünftigen, geprüften Alternativen)",
        ),
    ),
    MatchingRule(
        "15", "ROG", "1", "4", ("(Ggf. vorläufige landesplanerische Stellungnahme / Landesplanerische Beurteilung)",)
    ),
    MatchingRule(
        "49",
        "EnWG",
        None,
        None,
        ("Sicherheitsstudie bzw. Bestätigung der Einhaltung der Anforderungen an die Anlagensicherheit",),
    ),
    MatchingRule(
        None,
        "GasHDrLtgV",
        None,
        None,
        (
            "Sicherheitsstudie bzw. Bestätigung der Einhaltung der Anforderungen an die Anlagensicherheit",
            "Erläuterungsbericht",
        ),
    ),
    MatchingRule(("15", "28"), "UVPG", None, None, ("Bericht über die Umweltverträglichkeitsprüfung / UVP-Bericht",)),
    MatchingRule(
        ("13", "30a"),
        "BNatSchG",
        None,
        None,
        ("Landschaftspflegerischer Begleitplan (LBP)", "Artenschutzrechtlicher Fachbeitrag"),
    ),
    MatchingRule(
        ("31", "36"), "BNatSchG", None, None, ("FFH-Verträglichkeitsprüfung / Natura 2000-Verträglichkeitsprüfung",)
    ),
    MatchingRule(("44", "47"), "BNatSchG", None, None, ("Artenschutzrechtlicher Fachbeitrag",)),
    MatchingRule(
        "67",
        "BNatSchG",
        None,
        None,
        (
            "Landschaftspflegerischer Begleitplan (LBP)",
            "Artenschutzrechtlicher Fachbeitrag",
            "(Ggf. gesonderte Unterlage mit Anträgen zu naturschutzrechtlichen Genehmigungen)",
        ),
    ),
    MatchingRule(("27", "28"), "WHG", None, None, ("Fachbeitrag Wasserrahmenrichtlinie",)),
    MatchingRule("47", "WHG", None, None, ("Fachbeitrag Wasserrahmenrichtlinie",)),
    MatchingRule(None, "BBodSchG", None, None, ("Bodenschutzkonzept",)),
    MatchingRule(None, "BBodSchV", None, None, ("Bodenschutzkonzept",)),
    MatchingRule(None, "ErsatzbaustoffV", None, None, ("Bodenschutzkonzept",)),
    MatchingRule(None, "GefStoffV", None, None, ("Bodenschutzkonzept",)),
    MatchingRule(
        "22,3",
        "BImSchG",
        None,
        None,
        (
            "Immissionsschutztechnische Untersuchung zum Baulärm / Baulärmgutachten",
            "Immissionsschutztechnische Untersuchung zum Betriebslärm / Betriebslärmgutachten",
            "Immissionsschutztechnische Untersuchung zu baubedingten Erschütterungen",
        ),
    ),
    MatchingRule(
        "66", "BImSchG", "2", None, ("Immissionsschutztechnische Untersuchung zum Baulärm / Baulärmgutachten",)
    ),
    MatchingRule("19", "WHG", "1", "3", ("Fachbeitrag Wasserrahmenrichtlinie",)),
    MatchingRule(("8", "10"), "WHG", None, None, ("Wasserrechtliche Anträge",)),
    MatchingRule("12", "WHG", None, None, ("Wasserrechtliche Anträge",)),
    MatchingRule("36", "WHG", None, None, ("Wasserrechtliche Anträge",)),
    MatchingRule("38", "WHG", "5", None, ("Wasserrechtliche Anträge",)),
    MatchingRule(("72", "81"), "WHG", None, None, ("Wasserrechtliche Anträge",)),
]
