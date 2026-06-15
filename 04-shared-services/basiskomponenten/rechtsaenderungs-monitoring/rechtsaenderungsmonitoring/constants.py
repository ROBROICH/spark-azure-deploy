from enum import Enum


class Source(str, Enum):
    EU = "EU"
    BUND = "Bund"
    BUNDESLAND = "Bundesland"


# length of the title hash in db
HASH_LENGTH: int = 32