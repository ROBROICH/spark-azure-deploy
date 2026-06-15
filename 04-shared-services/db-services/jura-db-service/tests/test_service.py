"""Unit tests for jura_db.service"""
import pytest

from db_services_shared.utils.app_state import app_state


def test_healthz_probe(api_client):
    """Test Kubernetes healthz probe"""
    response = api_client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_ready_probe(api_client):
    """Test Kubernetes readiness probe"""
    response = api_client.get("/ready")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_startup_probe_complete(api_client):
    """Test startup probe when startup is complete"""
    api_client.startup_complete = True
    response = api_client.get("/startup")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_read_documents_no_filter(api_client):
    """Test reading all documents with default pagination"""

    response = api_client.get("/documents/")
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_read_documents_with_pagination(api_client):
    """Test reading documents with limit and offset"""

    response = api_client.get("/documents/?limit=50&offset=10")
    assert response.status_code == 200


def test_search_documents_by_gertyp(api_client):
    """Test searching documents by court type"""

    response = api_client.get("/documents/search?gertyp=BGH")
    assert response.status_code == 200


def test_search_documents_not_found(api_client):
    """Test searching documents returns 404 when no results"""

    response = api_client.get("/documents/search?gertyp=NONEXISTENT")
    assert response.status_code == 404


def test_read_document_by_id(api_client):
    """Test getting a specific document by ID"""
    response = api_client.get("/documents/TESTDOC0001")
    assert response.status_code == 200
    assert response.json()["doc_id"] == "TESTDOC0001"


def test_read_document_not_found(api_client):
    """Test getting a document that does not exist"""

    response = api_client.get("/documents/NONEXISTENT")
    assert response.status_code == 404


def test_search_by_norm(api_client):
    """Test searching documents by legal norm"""

    response = api_client.get("/documents/by-norm?norm_name=§ 7 TestG")
    assert response.status_code == 200


def test_search_by_norm_not_found(api_client):
    """Test searching by norm returns 404 when not found"""

    response = api_client.get("/documents/by-norm?norm_name=INVALID")
    assert response.status_code == 404


def test_read_norms(api_client):
    """Test reading legal norms"""

    response = api_client.get("/norms/")
    assert response.status_code == 200


def test_read_regions(api_client):
    """Test reading geographic regions"""

    response = api_client.get("/regions/")
    assert response.status_code == 200


def test_read_tenor(api_client):
    """Test reading tenor sections"""
    response = api_client.get("/tenor/")
    assert response.status_code == 200


def test_read_gruende(api_client):
    """Test reading legal reasoning"""

    response = api_client.get("/gruende/")
    assert response.status_code == 200


def test_get_database_stats(api_client):
    """Test getting database statistics"""

    response = api_client.get("/stats")
    assert response.status_code == 200
    assert "documents" in response.json()
    assert "legal_norms" in response.json()
    assert "regions" in response.json()
    assert "tenor" in response.json()
    assert "gruende" in response.json()

def test_get_chunks_ordered(api_client):
    """Test that document chunks are returned in the correct order"""
    response = api_client.post(
        "/chunks",
        json={"aktenzeichen": "IX ZB 1/26", "section_number": 1}
    )
    assert response.status_code == 200
    chunks = response.json()
    assert len(chunks) > 0
    # Check that chunk IDs are in ascending order
    chunk_ids = [chunk["id"] for chunk in chunks]
    assert chunk_ids == sorted(chunk_ids)

def test_get_query_top_k(api_client):
    """smoke test for the query_top_k endpoint"""
    response = api_client.post("/query_k_results", json={
        "query_text": "Was ist die rechtliche Grundlage für die Entscheidung?",
        "k": 5,
        "similarity_threshold": 0.1,
        "norms": [
            {
                "name": "Test2G",
                "name_suffix": None,
                "paragraph": "§ 17",
                "absatz": None
            }
        ]
    })
    assert response.status_code == 200
    results = response.json()
    assert isinstance(results, list)
    assert len(results) > 0
    assert len(results) <= 5
    assert "7" not in [r["section_number"] for r in results]
    for result in results:
        assert "similarity" in result
        assert result["similarity"] >= 0.1
        assert result["normen"] is not None
        assert any(norm["name"] == "Test2G" and norm["paragraph"] == "§ 17" for norm in result["normen"])


def test_get_query_top_k_fallback(api_client):
    """Test that query_top_k falls back to partial key matching when no results with full keys"""
    response = api_client.post("/query_k_results", json={
        "query_text": "Was ist die rechtliche Grundlage für die Entscheidung?",
        "k": 5,
        "similarity_threshold": 0.1,
        "norms": [
            {
                "name": "Test2G",
                "name_suffix": None,
                "paragraph": "17",
                "absatz": "1"
            }
        ]
    })
    assert response.status_code == 200
    results = response.json()
    assert isinstance(results, list)
    assert len(results) > 0
    assert len(results) <= 5
    for result in results:
        assert "similarity" in result
        assert result["similarity"] >= 0.1
        assert result["normen"] is not None
        # should match § 17 Test2G even though absatz doesn't match
        assert any(norm["name"] == "Test2G" and norm["paragraph"] == "§ 17" for norm in result["normen"])


def test_get_query_top_k_unique(api_client, mock_query_embedding):
    """Test that query_top_k returns only one chunk per section"""
    response = api_client.post("/query_k_results", json={
        "query_text": "Was ist die rechtliche Grundlage für die Entscheidung?",
        "k": 10,
        "similarity_threshold": 0.1,
        "norms": []
    })
    assert response.status_code == 200
    results = response.json()

    assert results != []
    section_7_results = [result for result in results if result["section_number"] == "7"]
    assert len(section_7_results) == 1
    assert section_7_results[0]["text"] == "test_chunk_1"
    assert section_7_results[0]["similarity"] == 1.0

    seen_sections = set()
    # generic duplicates check
    for result in results:
        section_id = (result["gericht"], result["aktenzeichen"], result["section_number"])
        assert section_id not in seen_sections, f"Duplicate section found: {section_id}"
        seen_sections.add(section_id)


def test_query_top_k_norms_none(api_client):
    """should throw validation error for norms=None in request"""
    response = api_client.post("/query_k_results", json={
        "query_text": "bla?",
        "k": 10,
        "similarity_threshold": 0.1,
        "norms": None
    })
    assert response.status_code == 422
    assert "Input should be a valid list" in response.text
