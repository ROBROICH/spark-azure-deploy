from db_pipelines.parsers.utils.xml_sentence_split import process_absatz


def test_process_absatz_nested(load_absatz):
    """should split absatz into saetze, including nested entries (like 2a, 2b)"""
    # § 1 Abs. 1: intro + nested arabic/alpha list + shared endtext sentence
    test_absatz = load_absatz("test_saetze.xml", "1", "1")
    result = process_absatz(test_absatz)
    sentences = result.saetze
    assert len(sentences) == 4
    assert sentences[0].satz_nr == 1
    assert sentences[0].markers == ["1"]
    assert "Tests zu skippen (Skipverbote)." in sentences[0].satz_text
    # nested list entries share the intro and carry hierarchical markers
    assert sentences[2].satz_id == 3
    assert sentences[2].satz_nr == 1
    assert sentences[2].markers == ["2", "b"]
    assert (
        sentences[2].satz_text
        == "Es ist verboten, Tests der besonders geschützten Arten "
        + "auf `pytest.mark.integration` zu setzen oder sonst zu deaktivieren (Deaktivierungsverbote)."
    )
    # the trailing sentence after the list is its own satz
    assert sentences[3].satz_id == 4
    assert sentences[3].satz_nr == 2
    assert sentences[3].markers == []
    assert sentences[3].satz_text == "Artikel 6 und 7 der Verordnung bleiben unberührt."


def test_process_absatz_end_text(load_absatz):
    """should split absatz into saetze, including closing statements."""
    # § 2 Abs. 1: the abbreviation "e. V." must not trigger a sentence split
    test_absatz = load_absatz("test_saetze.xml", "2", "1")
    result = process_absatz(test_absatz)
    sentences = result.saetze
    assert len(sentences) == 2
    assert "des Projekts Spark Workflow eingehalten worden sind" in sentences[0].satz_text
    assert "der Auftraggeber eingehalten worden sind" in sentences[1].satz_text

    # § 2 Abs. 2: list with a shared endtext, followed by a new sentence
    test_absatz = load_absatz("test_saetze.xml", "2", "2")
    result = process_absatz(test_absatz)
    sentences = result.saetze
    assert len(sentences) == 3
    assert sentences[0].markers == ["1"]
    assert "und endtext" in sentences[0].satz_text
    assert sentences[1].markers == ["2"]
    assert sentences[2].satz_id == 3
    assert sentences[2].satz_nr == 2
    assert sentences[2].markers == []
    assert sentences[2].satz_text == "Satz 2 kommt nach dem endtext."


def test_process_absatz_madness(load_absatz):
    """should handle ambiguous markers (dashes get a synthetic numeric prefix)"""
    # § 1 Abs. 2: dash markers are made unique as "1. –", "2. –"
    test_absatz = process_absatz(load_absatz("test_saetze.xml", "1", "2"))
    sentences = test_absatz.saetze
    assert len(sentences) == 2
    assert sentences[0].satz_nr == 1
    assert sentences[0].markers == ["1. –"]
    assert sentences[1].satz_nr == 1
    assert sentences[1].markers == ["2. –"]

    # § 1 Abs. 1: nested markers combine parent and child
    test_absatz = process_absatz(load_absatz("test_saetze.xml", "1", "1"))
    sentences = test_absatz.saetze
    assert [(x.satz_nr, x.markers) for x in sentences] == [
        (1, ["1"]),
        (1, ["2", "a"]),
        (1, ["2", "b"]),
        (2, []),
    ]


def test_process_absatz_weggefallen_filter(load_absatz):
    """should remove sentences that are marked as `(weggefallen)`"""
    # § 3 Abs. 1: list item 2 is "(weggefallen)" and must be dropped
    test_absatz = process_absatz(load_absatz("test_saetze.xml", "3", "1"))
    sentences = test_absatz.saetze
    assert all("(weggefallen)" not in s.satz_text for s in sentences)
    assert [s.markers for s in sentences] == [["1"], ["3"]]


def test_process_absatz_clean_footnotes(load_absatz):
    """
    should clean up <FnR> elements (footnote markers)
    """
    # § 3 Abs. 2a: footnote marker must be stripped, no markup left in the text
    raw_absatz = load_absatz("test_saetze.xml", "3", "2a")
    test_absatz = process_absatz(raw_absatz)
    sentences = test_absatz.saetze
    assert len(sentences) == 1
    assert "<" not in sentences[0].satz_text
    assert sentences[0].satz_text == "Ein Satz mit einer Fußnote im Text."


def test_process_satz_split(load_absatz):
    """should not split sentences on semicolon, period in a date or ALL CAPS"""
    # § 3 Abs. 3a: semicolons, dates and ALL CAPS abbreviations stay in one sentence
    raw_absatz = load_absatz("test_saetze.xml", "3", "3a")
    test_absatz = process_absatz(raw_absatz)
    sentences = test_absatz.saetze
    assert len(sentences) == 3
    # the semicolon does not split the first sentence
    assert sentences[0].satz_text == "Diese Vorschrift gilt; sie ist gültig."
    # dates and ALL CAPS references stay within a single sentence
    assert "20. Juli 2022 (BGBl. I S. 1353)" in sentences[1].satz_text
    assert "8. Mai 2024 (BGBl. 2024 I Nr. 151)" in sentences[1].satz_text
