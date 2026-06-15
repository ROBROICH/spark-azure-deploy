"""api endpoint tests"""

import json
import pytest

pytestmark = pytest.mark.skip("ci does not load data, cannot reproduce")


@pytest.mark.asyncio
async def test_get_documents(api_client):
    """test retrieving all documents"""
    response = await api_client.get("/documents")
    assert response.status_code == 200
    documents = json.loads(response.text)
    assert len(documents) == 3


@pytest.mark.asyncio
async def test_get_urheber(api_client):
    """test retrieving all urheber"""
    response = await api_client.get("/urheber/")
    assert response.status_code == 200
    documents = json.loads(response.text)
    assert len(documents) == 2


@pytest.mark.asyncio
async def test_get_fundstelle(api_client):
    """test retrieving all urheber"""
    response = await api_client.get("/fundstelle/")
    assert response.status_code == 200
    documents = json.loads(response.text)
    assert len(documents) == 3


@pytest.mark.asyncio
async def test_get_vorgangsbezug(api_client):
    """test retrieving all urheber"""
    response = await api_client.get("/vorgangsbezug/")
    assert response.status_code == 200
    documents = json.loads(response.text)
    assert len(documents) == 3


@pytest.mark.asyncio
async def test_get_autoren_anzeige(api_client):
    """test retrieving all urheber"""
    response = await api_client.get("/autoren_anzeige/")
    assert response.status_code == 200
    documents = json.loads(response.text)
    assert len(documents) == 0


@pytest.mark.asyncio
async def test_search_documents(api_client):
    """test searching documents"""
    response = await api_client.get(
        "/documents/search?jurabk=UTCG"
        + "&drucksachetyp=Gesetzentwurf&herausgeber=BR"
    )
    assert response.status_code == 200
    content = json.loads(response.text)
    assert len(content) == 2
    assert (
        content[0]["titel"]
        == "Entwurf eines Gesetzes zu der Zweiten Anderung "
        + "des Ubereinkommens vom 15. Mai 2026 uber die "
        + "Unittestcoverageprufung im grenzuberschreitenden "
        + "Rahmen (Zweites Spark-Workflow-Vertragsgesetz)"
    )


@pytest.mark.asyncio
async def test_search_urheber(api_client):
    """test searching urheber"""
    response = await api_client.get(
        "/urheber/search?einbringer=false&rolle=undefiniert&bezeichnung=BRg"
    )
    assert response.status_code == 200
    content = json.loads(response.text)
    assert len(content) == 1
    assert content[0]["titel"] == "Bundesregierung"


@pytest.mark.asyncio
async def test_search_fundstelle(api_client):
    """test searching fundstelle"""
    response = await api_client.get(
        "/fundstelle/search?dokumentnummer=16%2F341&herausgeber=BT&"
        + "drucksachetyp=Gesetzentwurf"
    )
    assert response.status_code == 200
    content = json.loads(response.text)
    assert len(content) == 1
    assert content[0]["id"] == "123"

@pytest.mark.asyncio
@pytest.mark.skip("data not present in DB")
async def test_search_vorgangsbezug(api_client):
    """test searching vorgangsbezug"""
    response = await api_client.get("/vorgangsbezug/search?doknr=123")
    assert response.status_code == 200
    content = json.loads(response.text)
    assert len(content) == 1
    assert content[0]["vorgangstyp"] == ["Gesetzgebung"]


@pytest.mark.asyncio
@pytest.mark.skip("data not present in DB")
async def test_search_autoren_anzeige(api_client):
    """test searching vorgangsbezug"""
    response = await api_client.get("/autoren_anzeige/search?doknr=123&id=51")
    assert response.status_code == 200
    content = json.loads(response.text)
    assert len(content) == 1
    assert content[0]["autor_titel"] == "P. Mustermann, Berichterstattung"


@pytest.mark.asyncio
async def test_get_urheber_for_document(api_client):
    """test getting urheber for documents"""
    response = await api_client.get("/urheber_for_document/?doknr=123")
    assert response.status_code == 200
    content = json.loads(response.text)
    assert len(content) == 1
    assert (
        content[0]["einbringer"] is False
        and content[0]["rolle"] == "undefiniert"
        and content[0]["bezeichnung"] == "BRg"
    )


@pytest.mark.skip("data not present in DB")
@pytest.mark.asyncio
async def test_get_document_for_urheber(api_client):
    """test getting documents for urheber"""
    response = await api_client.get(
        "/documents_for_urheber/?einbringer=false&rolle=undefiniert&bezeichnung=BR"
    )
    assert response.status_code == 200
    content = json.loads(response.text)
    assert len(content) == 1
    assert content[0]["doknr"] == 123


@pytest.mark.asyncio
async def test_get_query_top_k(api_client):
    """smoke test for the query_top_k endpoint"""
    response = await api_client.post("/query_top_k", json={
        "query_text": "bla",
        "jurabk": "UTCG",
        "k": 10,
        "section_substrings": [
            "2. Vollzugsaufwand"
        ]
    })
    assert response.status_code == 200
    results = response.json()
    assert isinstance(results, list)
    assert len(results) > 0
    assert len(results) <= 10
    for result in results:
        assert "similarity" in result
        assert result["section_title"] == "2. Vollzugsaufwand"


@pytest.mark.asyncio
async def test_get_query_top_k_unique(api_client):
    """Test that query_top_k returns only one chunk per section"""
    response = await api_client.post("/query_top_k", json={
        "query_text": "Was ist die rechtliche Grundlage für die Entscheidung?",
        "jurabk": "UTCG",
        "k": 10,
        "section_substrings": [
            "Denkschrift: I. Allgemeines",
        ]
    })
    assert response.status_code == 200
    results = response.json()

    assert results != []
    assert len(results) <= 10
    seen_sections = set()
    # generic duplicates check
    for result in results:
        section_id = (result["dokumentnummer"], result["section_title"])
        assert section_id not in seen_sections, f"Duplicate section found: {section_id}"
        seen_sections.add(section_id)


@pytest.mark.asyncio
async def test_query_top_k_no_section_filter(api_client):
    """should allow"""
    response = await api_client.post("/query_top_k", json={
        "query_text": "bla?",
        "jurabk": "UTCG",
        "k": 10,
        "section_substrings": None
    })
    assert response.status_code == 200
