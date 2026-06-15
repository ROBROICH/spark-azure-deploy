"""shared constants for db services"""

from enum import StrEnum


class Hierarchy(StrEnum):

    """legal text hierarchy level within the EU/federal system"""

    EU = "eu"
    BUND = "bund"
    BUNDESLAND = "bundesland"
    KOMMUNE = "kommune"


class BundeslandParam(StrEnum):
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


class Bundesland(StrEnum):
    """
    [destatis](https://www.destatis.de/DE/Methoden/abkuerzung-bundeslaender-DE-EN.html) shortform to name enum.
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