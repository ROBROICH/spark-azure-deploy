# flake8: noqa: E501
import pytest
from db_pipelines.parsers.utils.sentence_split import smart_split_sentences

@pytest.mark.parametrize(
    ("test_text", "n_sentences"),
    [
        ("Dies ist Satz 1. Dies ist Satz 2.", 2),
        ("Ein einfacher Satz mit Interpunktion. Ein zweiter Satz ohne Markierungen. § 1 Absatz 1 enthält 3 Sätze.", 3),
        ("Dies ist ein Satz mit einem Verweis auf Art. 22 und BGBl. I S. 1440.", 1),
        ("Ein Satz mit Sonderfällen (z.B. 01. Januar 2000, e. V., a. n. g., Art. 2 4. BImSchV 1 BA BGBl. I S. 1440, CAS-Nr. 72-54-8; EU-Nr. 200-783-0).", 1),
        ("Test. Das deutsche 'Die' beginnt mit einem römischen Zahlbuchstaben, sollte aber keinen Satz unterbrechen.", 2),
        ("§ 180 VwGO (BGBl. FN 310-4) findet entsprechende Anwendung.", 1),
        ("Siehe ABl. EG Nr. L 182 S. 1.", 1),
        ("Art. 19a tritt mit Ablauf des 31. Dezember 2024 außer Kraft.", 1),
        ("Ein satz. In sieht aus wie Römisch 1, unterpunkt n.", 2)
    ]
)
def test_smart_sentence_split(test_text, n_sentences):
    """should split sentences at periods, but not when they are part of a marker
    or reference"""
    sentences = smart_split_sentences(test_text)
    assert len(sentences) == n_sentences

