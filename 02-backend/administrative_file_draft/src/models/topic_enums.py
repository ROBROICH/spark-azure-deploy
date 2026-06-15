from enum import StrEnum


class TopicEnum(StrEnum):
    SONSTIGES_KEIN_THEMA = "Sonstiges / Kein Thema"

    # Grundlagen
    GEGENSTAND_VORHABEN = "Gegenstand des Vorhabens"
    PLANUNGSSTUFEN = "Planungsstufen"
    LINIENBESTIMMUNG = "Linienbestimmung"

    # Verfahren
    NOTWENDIGKEIT_PLANFESTSTELLUNGSVERFAHREN = "Notwendigkeit des Planfeststellungsverfahrens"
    ZUSTAENDIGKEIT = "Zuständigkeit"
    VERFAHREN = "Verfahren"
    ANHOERUNGSVERFAHREN = "Anhörungsverfahren"
    UMWELTVERTRAEGLICHKEITSPRUEFUNG = "Umweltverträglichkeitsprüfung"

    # Planung & Abwägung
    PLANRECHTFERTIGUNG = "Planrechtfertigung"
    ALTERNATIVENPRUEFUNG = "Fachplanerische Alternativenprüfung"
    PLANUNGSLEITSAETZE = "Planungsleitsätze"
    RAUMORDNUNG = "Raumordnung"
    BAULEITPLANUNG = "Bauleitplanung"
    GESAMTABWAEGUNG = "Gesamtabwägung"

    # Umwelt & Immissionen
    IMMISSIONSSCHUTZ = "Immissionsschutz"
    IMMISSIONSSCHUTZ_VERKEHRSLAERM = "Immissionsschutz: Verkehrslärm"
    IMMISSIONSSCHUTZ_BAULAERM = "Immissionsschutz: Baulärm"
    IMMISSIONSSCHUTZ_LUFTSCHADSTOFFE = "Immissionsschutz: Luftschadstoffe"
    IMMISSIONSSCHUTZ_ERSCHUETTERUNGEN = "Immissionsschutz: Erschütterungen"

    # Natur & Umweltrecht
    NATURSCHUTZRECHT = "Naturschutzrecht"
    ARTENSCHUTZRECHT = "Artenschutzrecht"
    NATURA_2000_FFH_VERTRÄGLICHKEIT = "FFH-Verträglichkeit / Natura 2000"
    NATURSCHUTZ_EINGRIFFSREGELUNG = "Naturschutzrechtliche Eingriffsregelung"
    WALDSCHUTZ = "Waldschutz"

    # Wasser
    WASSERRECHT_ERLAUBNISSE = "Wasserrechtliche Erlaubnisse"
    WASSERRAHMENRECHT = "Wasserrahmenrecht"
    GEWAESSERSCHUTZ = "Gewässerschutz"

    # Weitere Fachthemen
    DENKMALSCHUTZ = "Denkmalschutz"
    BODENSCHUTZ_ALTLASTEN_ABFALL = "Bodenschutz, Altlasten, Abfall"
    KLIMASCHUTZ = "Klimaschutz"
    KOMMUNALE_BELANGE = "Kommunale Belange"
    GRUNDERWERB_EIGENTUM = "Grunderwerb / Eigentum"

    # Nutzung
    LANDWIRTSCHAFT = "Landwirtschaft"
    FORSTWIRTSCHAFT = "Forstwirtschaft"
    JAGDRECHT = "Jagdrecht"

    # Sicherheit & Technik
    TECHNISCHE_SICHERHEIT = "Technische Sicherheit"
    BRAND_KATASTROPHENSCHUTZ = "Brand- und Katastrophenschutz"
    KAMPFMITTELBESEITIGUNG = "Kampfmittelbeseitigung"
    VER_ENTSORGUNGSANLAGEN = "Ver- und Entsorgungsanlagen"

    # Rechtliche Entscheidungen
    STRASSENRECHTLICHE_ENTSCHEIDUNGEN = "Straßenrechtliche Entscheidungen"
    NEBENBESTIMMUNGEN = "Nebenbestimmungen"
    ZUSAGEN_VORHABENTRAEGERIN = "Zusagen der Vorhabenträgerin"
    ENTSCHAEDIGUNGEN = "Entschädigungen"
    SOFORTIGE_VOLLZIEHBARKEIT = "Sofortige Vollziehbarkeit"
    KOSTENENTSCHEIDUNG = "Kostenentscheidung"
    RECHTSBEHELFSBELEHRUNG = "Rechtsbehelfsbelehrung"

    # Dokumente / Pläne
    HOEHENPLAENE = "Höhenpläne"
    REGELUNGSVERZEICHNIS = "Regelungsverzeichnis"
    STRASSENQUERSCHNITT = "Straßenquerschnitt"
    LAGEPLAENE = "Sonstige Pläne: Lagepläne"

    # Monitoring
    UEBERWACHUNGSMASSNAHMEN = "Überwachungsmaßnahmen zur Einhaltung umweltbezogener Bestimmungen"
