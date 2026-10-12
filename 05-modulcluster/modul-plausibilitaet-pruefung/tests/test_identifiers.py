"""Unit tests for the module-wide identifier definition."""

from src.activities import identifiers as k


class TestIdentifiers:
    def test_structural_forms(self) -> None:
        text = (
            "Das Regenrückhaltebecken RRB 3 bei Bau-km 4+800 erhält 34.000 m³; die Lärmschutzwand LSW 2 und "
            "die Talbrücke BW 3.02 liegen an der B 51 alt. Maßnahme A 4.3 CEF, Variante 2, Flurstück 112, "
            "Zauneidechse (Lacerta agilis), Bereich Musterbach-Aue, Immissionsort 14."
        )
        ids = k.identifiers(text)
        assert {"RRB 3", "LSW 2", "BW 3.02", "B 51", "KM 4+800", "VARIANTE 2", "FLURSTUECK 112", "IO 14"} <= ids
        assert "MASSNAHME A4.3 CEF" in ids
        assert "ART lacerta agilis" in ids
        assert "NAME musterbach-aue" in ids

    def test_blocked_forms(self) -> None:
        ids = k.identifiers("nach DIN 18300, § 17 Abs. 1, DTV 48.500 Kfz, RQ 31, im Jahr 2040, S. 12, Tab. 3")
        assert not any(i.startswith(("DIN ", "ABS ", "DTV ", "RQ ", "S ", "TAB ")) for i in ids)

    def test_template_conflict_only_for_template_classes(self) -> None:
        a = k.identifier_classes("Maßnahmen-Nr. 6.2a ACEF an der B 51")
        b = k.identifier_classes("Maßnahmen-Nr. 11.4 ACEF an der B 202")
        assert k.class_conflict(a, b) == "MASSNAHME"
        # roads differ but are no template class -> no conflict
        assert k.class_conflict(k.identifier_classes("an der B 51"), k.identifier_classes("an der B 202")) is None
        # species sheets
        assert (
            k.class_conflict(
                k.identifier_classes("Durch das Vorhaben betroffene Art Hohltaube (Columba oenas)"),
                k.identifier_classes("Durch das Vorhaben betroffene Art Star (Sturnus vulgaris)"),
            )
            == "STECKBRIEF"
        )

    def test_model_objects_normalise_to_identifiers(self) -> None:
        assert k.normalise_object("Regenrückhaltebecken RRB 3") == {"RRB 3"}
        assert k.normalise_object("Zauneidechse") == {"OBJ zauneidechse"}
        assert k.normalise_object("") == set()
