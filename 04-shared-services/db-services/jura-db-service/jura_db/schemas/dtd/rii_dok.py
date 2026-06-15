"""generated (and manually adjusted) from https://www.rechtsprechung-im-internet.de/dtd/v1/rii-dok.dtd"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class DD:
    class Meta:
        name = "dd"

    p: None | object = field(
        default=None,
        metadata={
            "type": "Wildcard",
            "namespace": "##any",
        },
    )


@dataclass
class DT:
    class Meta:
        name = "dt"

    a: None | object = field(
        default=None,
        metadata={
            "type": "Wildcard",
            "namespace": "##any",
        },
    )


@dataclass
class DL:
    class Meta:
        name = "dl"

    dt: DT = field(
        default_factory=DT,
        metadata={
            "type": "Element",
            "name": "dt",
            "namespace": "##any",
        },
    )
    dd: DD = field(
        default_factory=DD,
        metadata={
            "type": "Element",
            "name": "dd",
            "namespace": "##any",
        },
    )


@dataclass
class Div:
    class Meta:
        name = "div"

    dl: list[DL] = field(
        default_factory=list,
        metadata={
            "type": "Element",
            "name": "dl",
            "namespace": "##any",
        },
    )


@dataclass(kw_only=True)
class Abk:
    class Meta:
        name = "abk"

    value: str = field(default="")


@dataclass(kw_only=True)
class Abwmeinung:
    class Meta:
        name = "abwmeinung"

    any_element: None | object = field(
        default=None,
        metadata={
            "type": "Wildcard",
            "namespace": "##any",
        },
    )


@dataclass(kw_only=True)
class AccessRights:
    class Meta:
        name = "accessRights"

    value: str = field(default="")


@dataclass(kw_only=True)
class Aktenzeichen:
    class Meta:
        name = "aktenzeichen"

    value: str = field(default="")


@dataclass(kw_only=True)
class Coverage:
    class Meta:
        name = "coverage"

    value: str = field(default="")


@dataclass(kw_only=True)
class Doknr:
    class Meta:
        name = "doknr"

    value: str = field(default="")


@dataclass(kw_only=True)
class Doktyp:
    class Meta:
        name = "doktyp"

    value: str = field(default="")


@dataclass(kw_only=True)
class Ecli:
    class Meta:
        name = "ecli"

    value: str = field(default="")


@dataclass(kw_only=True)
class EntschDatum:
    class Meta:
        name = "entsch-datum"

    value: str = field(default="")


@dataclass(kw_only=True)
class Entscheidungsgruende:
    class Meta:
        name = "entscheidungsgruende"

    any_element: None | object = field(
        default=None,
        metadata={
            "type": "Wildcard",
            "namespace": "##any",
        },
    )


@dataclass(kw_only=True)
class Gerort:
    class Meta:
        name = "gerort"

    value: str = field(default="")


@dataclass(kw_only=True)
class Gertyp:
    class Meta:
        name = "gertyp"

    value: str = field(default="")


@dataclass(kw_only=True)
class Gruende:
    class Meta:
        name = "gruende"

    any_element: None | object = field(
        default=None,
        metadata={
            "type": "Wildcard",
            "namespace": "##any",
        },
    )


@dataclass(kw_only=True)
class Identifier:
    class Meta:
        name = "identifier"

    value: str = field(default="")


@dataclass(kw_only=True)
class Language:
    class Meta:
        name = "language"

    value: str = field(default="")


@dataclass(kw_only=True)
class Leitsatz:
    class Meta:
        name = "leitsatz"

    any_element: object | None = field(
        default=None,
        metadata={
            "type": "Wildcard",
            "namespace": "##any",
        },
    )


@dataclass(kw_only=True)
class Long:
    class Meta:
        name = "long"

    value: str = field(default="")


@dataclass(kw_only=True)
class Mitwirkung:
    class Meta:
        name = "mitwirkung"

    value: str = field(default="")


@dataclass(kw_only=True)
class Norm:
    class Meta:
        name = "norm"

    value: str = field(default="")


@dataclass(kw_only=True)
class Publisher:
    class Meta:
        name = "publisher"

    value: str = field(default="")


@dataclass(kw_only=True)
class Sonstlt:
    class Meta:
        name = "sonstlt"

    any_element: None | object = field(
        default=None,
        metadata={
            "type": "Wildcard",
            "namespace": "##any",
        },
    )


@dataclass(kw_only=True)
class Sonstosatz:
    class Meta:
        name = "sonstosatz"

    any_element: None | object = field(
        default=None, metadata={"type": "Wildcard", "namespace": "##any"}
    )


@dataclass(kw_only=True)
class Spruchkoerper:
    class Meta:
        name = "spruchkoerper"

    value: str = field(default="")


@dataclass(kw_only=True)
class Tatbestand:
    class Meta:
        name = "tatbestand"

    any_element: None | object = field(
        default=None,
        metadata={
            "type": "Wildcard",
            "namespace": "##any",
        },
    )


@dataclass(kw_only=True)
class Tenor:
    class Meta:
        name = "tenor"

    any_element: None | object = field(
        default=None,
        metadata={
            "type": "Wildcard",
            "namespace": "##any",
        },
    )


@dataclass(kw_only=True)
class Titelzeile:
    class Meta:
        name = "titelzeile"

    any_element: None | object = field(
        default=None,
        metadata={
            "type": "Wildcard",
            "namespace": "##any",
        },
    )


@dataclass(kw_only=True)
class Vorinstanz:
    class Meta:
        name = "vorinstanz"

    any_element: None | object = field(
        default=None,
        metadata={
            "type": "Wildcard",
            "namespace": "##any",
        },
    )


@dataclass(kw_only=True)
class Region:
    class Meta:
        name = "region"

    abk: Abk = field(
        metadata={
            "type": "Element",
        }
    )
    long: Long = field(
        metadata={
            "type": "Element",
        }
    )


@dataclass(kw_only=True)
class Dokument:
    class Meta:
        name = "dokument"

    doknr: Doknr = field(
        metadata={
            "type": "Element",
        }
    )
    ecli: Ecli = field(
        metadata={
            "type": "Element",
        }
    )
    gertyp: Gertyp = field(
        metadata={
            "type": "Element",
        }
    )
    gerort: Gerort = field(
        metadata={
            "type": "Element",
        }
    )
    spruchkoerper: Spruchkoerper = field(
        metadata={
            "type": "Element",
        }
    )
    entsch_datum: EntschDatum = field(
        metadata={
            "name": "entsch-datum",
            "type": "Element",
        }
    )
    aktenzeichen: Aktenzeichen = field(
        metadata={
            "type": "Element",
        }
    )
    doktyp: Doktyp = field(
        metadata={
            "type": "Element",
        }
    )
    norm: Norm = field(
        metadata={
            "type": "Element",
        }
    )
    vorinstanz: Vorinstanz = field(
        metadata={
            "type": "Element",
        }
    )
    region: Region = field(
        metadata={
            "type": "Element",
        }
    )
    mitwirkung: Mitwirkung = field(
        metadata={
            "type": "Element",
        }
    )
    titelzeile: Titelzeile = field(
        metadata={
            "type": "Element",
        }
    )
    leitsatz: Leitsatz = field(
        metadata={
            "type": "Element",
        }
    )
    sonstosatz: Sonstosatz = field(
        metadata={
            "type": "Element",
        }
    )
    tenor: Tenor = field(
        metadata={
            "type": "Element",
        }
    )
    tatbestand: Tatbestand = field(
        metadata={
            "type": "Element",
        }
    )
    entscheidungsgruende: Entscheidungsgruende = field(
        metadata={
            "type": "Element",
        }
    )
    gruende: Gruende = field(
        metadata={
            "type": "Element",
        }
    )
    abwmeinung: Abwmeinung = field(
        metadata={
            "type": "Element",
        }
    )
    sonstlt: Sonstlt = field(
        metadata={
            "type": "Element",
        }
    )
    identifier: Identifier = field(
        metadata={
            "type": "Element",
        }
    )
    coverage: Coverage = field(
        metadata={
            "type": "Element",
        }
    )
    language: Language = field(
        metadata={
            "type": "Element",
        }
    )
    publisher: Publisher = field(
        metadata={
            "type": "Element",
        }
    )
    access_rights: AccessRights = field(
        metadata={
            "name": "accessRights",
            "type": "Element",
        }
    )
