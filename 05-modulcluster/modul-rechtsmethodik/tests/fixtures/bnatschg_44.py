"""Real-world example data from BNatSchG § 44 workflow run.

These constants are derived from an actual production run and serve as
ground-truth fixtures for tests that need realistic LLM-mocked outputs.
"""

from temporal.contracts import (
    Auslegungsvorschlag,
    BestimmterRechtsbegriff,
    Legaldefinition,
    Rechtsfolge,
    Source,
    UnbestimmterRechtsbegriff,
    Verweise,
)

# ── paragraph metadata ────────────────────────────────────────────────────────

JURABK = "BNatSchG"
PARAGRAPH_NR = "44"
ABSATZ_NR = "1"

# ── satz 1 (§ 44 Abs. 1 Nr. 1) ───────────────────────────────────────────────

SATZ_1_NR_1_TEXT = (
    "Es ist verboten, wild lebenden Tieren der besonders geschützten Arten nachzustellen, "
    "sie zu fangen, zu verletzen oder zu töten oder ihre Entwicklungsformen aus der Natur "
    "zu entnehmen, zu beschädigen oder zu zerstören (Zugriffsverbote)."
)
SATZ_1_NR_1_NORM_TYP_LVL_1 = "materiell-rechtlich"
SATZ_1_NR_1_NORM_TYP_LVL_2 = "wenn-dann"

SATZ_1_NR_1_TATBESTANDSMERKMALE = [
    "wild lebenden Tieren der besonders geschützten Arten nachzustellen,",
    "sie zu fangen,",
    "zu verletzen",
    "oder zu töten",
    "oder ihre Entwicklungsformen aus der Natur zu entnehmen,",
    "zu beschädigen",
    "oder zu zerstören (Zugriffsverbote).",
]

SATZ_1_NR_1_ATOMARE_TATBESTANDSMERKMALE = [
    "Wenn wild lebende Tiere der besonders geschützten Arten nachgestellt werden.",
    "Wenn wild lebende Tiere der besonders geschützten Arten gefangen werden.",
    "Wenn wild lebende Tiere der besonders geschützten Arten verletzt werden.",
    "Wenn wild lebende Tiere der besonders geschützten Arten getötet werden.",
    "Wenn die Entwicklungsformen wild lebender Tiere der besonders geschützten Arten aus der Natur entnommen werden.",
    "Wenn die Entwicklungsformen wild lebender Tiere der besonders geschützten Arten beschädigt werden.",
    "Wenn die Entwicklungsformen wild lebender Tiere der besonders geschützten Arten zerstört werden.",
]

# ── satz 2 (§ 44 Abs. 1 Nr. 2) ───────────────────────────────────────────────

SATZ_1_NR_2_TEXT = (
    "Es ist verboten, wild lebende Tiere der streng geschützten Arten und der europäischen "
    "Vogelarten während der Fortpflanzungs-, Aufzucht-, Mauser-, Überwinterungs- und "
    "Wanderungszeiten erheblich zu stören; eine erhebliche Störung liegt vor, wenn sich durch "
    "die Störung der Erhaltungszustand der lokalen Population einer Art verschlechtert (Zugriffsverbote)."
)

# ── rechtsfolge ───────────────────────────────────────────────────────────────

RECHTSFOLGE = Rechtsfolge(
    text="Es ist verboten.",
    sollensanordnungen="verbot",
    rechtsfolgen_adressat="keine handlungsermächtigung",
    ermessensspielraum=None,
    ermessensart=None,
    verweise=Verweise(explizit=[], implizit=[]),
)

# ── bestimmte Rechtsbegriffe ──────────────────────────────────────────────────

BESONDERS_GESCHUETZTE_ARTEN_DEFINITION = Legaldefinition(
    begriff="besonders geschützte Arten",
    definition=(
        "besonders geschützte Arten a) Tier- und Pflanzenarten, die in Anhang A oder Anhang B "
        "der Verordnung (EG) Nr. 338/97 des Rates vom 9. Dezember 1996 über den Schutz von "
        "Exemplaren wildlebender Tier- und Pflanzenarten durch Überwachung des Handels aufgeführt sind, "
        "b) nicht unter Buchstabe a fallende aa) Tier- und Pflanzenarten, die in Anhang IV der "
        "Richtlinie 92/43/EWG aufgeführt sind, bb) europäische Vogelarten, c) Tier- und "
        "Pflanzenarten, die in einer Rechtsverordnung nach § 54 Absatz 1 aufgeführt sind;"
    ),
    source=Source(jurabk="BNatSchG", paragraph_nr="7"),
)

BESONDERS_GESCHUETZTE_ARTEN = BestimmterRechtsbegriff(
    begriff="besonders geschützte Arten",
    definitions=[BESONDERS_GESCHUETZTE_ARTEN_DEFINITION],
    selected_definition=None,
)

STRENG_GESCHUETZTE_ARTEN = BestimmterRechtsbegriff(
    begriff="streng geschützte Arten",
    definitions=[
        Legaldefinition(
            begriff="streng geschützte Arten",
            definition=(
                "streng geschützte Arten besonders geschützte Arten, die a) in Anhang A der "
                "Verordnung (EG) Nr. 338/97, b) in Anhang IV der Richtlinie 92/43/EWG, "
                "c) in einer Rechtsverordnung nach § 54 Absatz 2 aufgeführt sind;"
            ),
            source=Source(jurabk="BNatSchG", paragraph_nr="7"),
        )
    ],
    selected_definition=None,
)

# ── unbestimmte Rechtsbegriffe ────────────────────────────────────────────────

ERHEBLICHE_STOERUNG_WORTLAUT = (
    "Wortbedeutungen werden über die Wikimedia REST API abgerufen. Die Inhalte stehen unter CC-BY-SA 3.0.\n\n"
    'Wiktionary definiert „erheblich“ als „beträchtlich, wesentlich, bedeutend“. '
    'Demnach bezeichnet „erhebliche Störung“ eine nicht nur geringfügige Beeinträchtigung, '
    "die in nennenswertem Ausmaß in das Verhalten oder die Lebensfunktionen wild lebender Tiere eingreift. "
    "Eine Störung ist erst dann erheblich, wenn sie zu einer Verschlechterung des Erhaltungszustands "
    "der lokalen Population führt."
)

ERHEBLICHE_STOERUNG_SYSTEMATIK = (
    "Der Begriff der 'erheblichen Störung' in § 44 Abs. 1 Satz 1 Nr. 2 BNatSchG ist systematisch "
    "in engem Zusammenhang mit den anderen Verbotsbestimmungen des Absatzes 1 zu sehen. "
    "Eine Störung ist erst dann erheblich, wenn sie geeignet ist, den Erhaltungszustand der "
    "lokalen Population einer Art zu verschlechtern."
)

ERHEBLICHE_STOERUNG_HISTORIE = (
    "Die semantische Suche hat keine einschlägigen Materialien zur historischen Auslegung "
    "des unbestimmten Rechtsbegriffs identifiziert und war in diesem Sinne unergiebig."
)

ERHEBLICHE_STOERUNG_TELOS = (
    'Der unbestimmte Rechtsbegriff der „erheblichen Störung" ist teleologisch so auszulegen, '
    "dass eine Störung erst dann als erheblich gilt, wenn sich durch sie der Erhaltungszustand "
    "der lokalen Population einer Art verschlechtert."
)

ERHEBLICHE_STOERUNG = UnbestimmterRechtsbegriff(
    begriff="erhebliche Störung",
    auslegungsvorschläge=[
        Auslegungsvorschlag(
            auslegung_methode="wortlaut",
            auslegungsvorschlag=ERHEBLICHE_STOERUNG_WORTLAUT,
        ),
        Auslegungsvorschlag(
            auslegung_methode="systematik",
            auslegungsvorschlag=ERHEBLICHE_STOERUNG_SYSTEMATIK,
        ),
        Auslegungsvorschlag(
            auslegung_methode="historie",
            auslegungsvorschlag=ERHEBLICHE_STOERUNG_HISTORIE,
        ),
        Auslegungsvorschlag(
            auslegung_methode="telos",
            auslegungsvorschlag=ERHEBLICHE_STOERUNG_TELOS,
        ),
    ],
)

# ── pruefformulierungen ───────────────────────────────────────────────────────

PRUEFFRAGEN_SATZ_1_NR_1 = [
    "Wird wild lebenden Tieren der besonders geschützten Arten nachgestellt?",
    "Werden wild lebende Tiere der besonders geschützten Arten gefangen?",
    "Werden wild lebende Tiere der besonders geschützten Arten verletzt?",
    "Werden wild lebende Tiere der besonders geschützten Arten getötet?",
    "Werden die Entwicklungsformen wild lebender Tiere der besonders geschützten Arten aus der Natur entnommen?",
    "Werden die Entwicklungsformen wild lebender Tiere der besonders geschützten Arten beschädigt?",
    "Werden die Entwicklungsformen wild lebender Tiere der besonders geschützten Arten zerstört?",
]

PRUEFGEGENSTAENDE_SATZ_1_NR_1 = [
    "Prüfe, ob wild lebenden Tieren der besonders geschützten Arten nachgestellt wird!",
    "Prüfe, ob wild lebende Tiere der besonders geschützten Arten gefangen werden!",
    "Prüfe, ob wild lebende Tiere der besonders geschützten Arten verletzt werden!",
    "Prüfe, ob wild lebende Tiere der besonders geschützten Arten getötet werden!",
    "Prüfe, ob die Entwicklungsformen wild lebender Tiere der besonders geschützten Arten aus der Natur entnommen werden!",
    "Prüfe, ob die Entwicklungsformen wild lebender Tiere der besonders geschützten Arten beschädigt werden!",
    "Prüfe, ob die Entwicklungsformen wild lebender Tiere der besonders geschützten Arten zerstört werden!",
]

# ── formel ────────────────────────────────────────────────────────────────────

FORMEL_SATZ_1_NR_1 = "(TBM_1 oder TBM_2 oder TBM_3 oder TBM_4 oder TBM_5 oder TBM_6 oder TBM_7)"
