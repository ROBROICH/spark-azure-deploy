"""Constants module"""

from enum import Enum


# Enums
class Hierarchy(str, Enum):
    """toggles for different data sources"""

    EU = "eu"
    BUND = "bund"
    BUNDESLAND = "bundesland"
    KOMMUNE = "kommune"


class Bundesland(str, Enum):
    """
    state law sources
    short forms from [destatis](https://www.destatis.de/DE/Methoden/abkuerzung-bundeslaender-DE-EN.html)  # noqa: E501
    """

    BY = "Bayern"
    BW = "Baden-Württemberg"
    BE = "Berlin"
    BB = "Brandenburg"
    HB = "Bremen"
    HH = "Hamburg"
    HE = "Hessen"
    MV = "Mecklenburg-Vorpommern"
    NI = "Niedersachsen"
    NW = "Nordrhein-Westfalen"
    RP = "Rheinland-Pfalz"
    SL = "Saarland"
    SN = "Sachsen"
    ST = "Sachsen-Anhalt"
    SH = "Schleswig-Holstein"
    TH = "Thüringen"


# Mapping from destatis abbreviations to the common legal abbreviations
# used as suffixes in jurabk (e.g. "LNatSchG RhPf").
# Source: Legal team, "gebräuchliche Abkürzungen"
class BundeslandParam(str, Enum):
    """Bundesland query parameter enum using destatis abbreviations."""

    BY = "BY"
    BW = "BW"
    BE = "BE"
    BB = "BB"
    HB = "HB"
    HH = "HH"
    HE = "HE"
    MV = "MV"
    NI = "NI"
    NW = "NW"
    RP = "RP"
    SL = "SL"
    SN = "SN"
    ST = "ST"
    SH = "SH"
    TH = "TH"


# map destatis shortform to legally accepted suffixes for jurabk
DESTATIS_TO_LEGAL: dict[str, str] = {
    "BW": "BW",
    "BY": "Bay",
    "BE": "Bln",
    "BB": "Bbg",
    "HB": "Brem",
    "HH": "Hmb",
    "HE": "Hess",
    "MV": "MV",
    "NI": "Nds",
    "NW": "NRW",
    "RP": "RhPf",
    "SL": "Saarl",
    "SN": "Sächs",
    "ST": "LSA",
    "SH": "SchlH",
    "TH": "Thür",
}

# possible existing prefixes (multiple per state since conventions vary)
BUNDESLAND_PREFIXES: dict[str, list[str]] = {
    "BB": ["Bbg"],
    "BE": ["Bln"],
    "BY": ["Bay"],
    "HB": ["Brem"],
    "HE": ["H"],
    "HH": ["Hmb"],
    "NI": ["N"],
    # "NW": ["NRW-"],
    "SL": ["S"],
    "SN": ["Sächs"],
    "ST": ["LSA"],
    "SH": ["SchlH"],
    "TH": ["Thür", "Th"],
}

# suffixes that don't fix destatis
BUNDESLAND_SUFFIXES = {
    "HH": "HA",
    "MV": "M-V",
}
