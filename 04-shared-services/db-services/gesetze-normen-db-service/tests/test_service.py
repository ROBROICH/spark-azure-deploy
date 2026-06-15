"""api endpoint tests"""

import pytest


def test_get_documents(api_client):
    """basic smoke test"""
    response = api_client.get("/documents/")
    assert response.status_code == 200
    assert len(response.json()) > 1


def test_get_legaldefinitionen_by_jurabk(api_client):
    """should return legal definitions for a document jurabk"""
    response = api_client.get("/legaldefinitionen/Test2G")
    json_response = response.json()

    assert response.status_code == 200
    assert len(json_response) == 2
    assert {entry["begriff"] for entry in json_response} == {
        "Testnetz",
        "Testverbraucher",
    }
    assert all(entry["jurabk"] == "Test2G" for entry in json_response)


def test_get_legaldefinitionen_by_jurabk_and_titel(api_client):
    """should support exact title filtering for legal definitions"""
    response = api_client.get("/legaldefinitionen/BTestG?titel=%C2%A7%203%20Begriffsbestimmungen")
    json_response = response.json()

    assert response.status_code == 200
    assert len(json_response) == 1
    assert json_response[0]["begriff"] == "Testbegriff"
    assert json_response[0]["titel"] == "§ 3 Begriffsbestimmungen"


def test_get_documents_specific_not_found(api_client):
    """should return 404 when nothing is found"""
    response = api_client.get("/documents/unknown")
    assert response.status_code == 404


def test_get_anlagen(api_client):
    """basic smoke test"""
    response = api_client.get("/anlagen?doknr=BJNRTEST")
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_get_toc(api_client):
    """should return toc for given doknr"""
    response = api_client.get("/toc?doknr=BJNRTEST")
    json_response = response.json()
    assert len(json_response) == 10
    for entry in json_response:
        assert entry["doknr"] == "BJNRTEST"


def test_get_norms_by_jurabk(api_client):
    """should return only relevant norms"""
    response = api_client.get("/norms/search?jurabk=BTestG")
    json_response = response.json()
    assert response.status_code == 200
    for entry in json_response:
        assert entry["jurabk"].lower() == "btestg"


def test_get_norms_by_doknr(api_client):
    """should return only relevant norms"""
    response = api_client.get("/norms/search?doknr=BJNRTEST2")
    json_response = response.json()
    assert response.status_code == 200
    for entry in json_response:
        assert entry["jurabk"] == "Test2G"


def test_get_specific_norm(api_client):
    """should return a specific norm when `paragraph_nr` param is set"""
    response = api_client.get("/norms/search?jurabk=Test2G&paragraph_nr=17d&include_absaetze=true")
    json_response = response.json()
    assert response.status_code == 200
    assert "Betreiber von Testsuites" in json_response[0]["absaetze"][0]["absatz_text"]
    assert "next" in json_response[0].keys()
    assert json_response[0]["paragraph_nr"] == "17d"
    assert json_response[0]["prev"] == "17"
    assert json_response[0]["next"] == "17e"
    assert len(json_response) == 1


def test_get_specific_norm_numeric_only(api_client):
    """should return a specific norm when `paragraph_nr` is numeric only"""
    response = api_client.get("/norms/search?jurabk=Test2G&paragraph_nr=17")
    json_response = response.json()
    assert response.status_code == 200
    assert json_response[0]["paragraph_nr"] == "17"
    assert json_response[0]["prev"] == "16a"
    assert json_response[0]["next"] == "17d"
    assert len(json_response) == 1


def test_get_specific_norm_no_prev(api_client):
    """should return successfully when no previous norm exists"""
    response = api_client.get("/norms/search?jurabk=Test2G&paragraph_nr=1")
    json_response = response.json()
    assert response.status_code == 200
    assert json_response[0]["paragraph_nr"] == "1"
    assert json_response[0]["prev"] is None
    assert json_response[0]["next"] == "1a"
    assert len(json_response) == 1


def test_get_specific_norm_no_next(api_client):
    """should return successfully when no next norm exists"""
    response = api_client.get("/norms/search?jurabk=Test2G&paragraph_nr=121")
    json_response = response.json()
    assert response.status_code == 200
    assert json_response[0]["paragraph_nr"] == "121"
    assert json_response[0]["next"] is None
    assert json_response[0]["prev"] == "120"
    assert len(json_response) == 1


def test_get_specific_norm_awkward_neighbours(api_client):
    """
    should handle cases where a digit only paragraph nr is between two entries
    with alphabetic part, in which case we get >3 entries from the query
    """
    response = api_client.get("/norms/search?jurabk=BTestG&paragraph_nr=15")
    json_response = response.json()
    assert response.status_code == 200
    assert json_response[0]["paragraph_nr"] == "15"
    assert json_response[0]["next"] == "16"
    assert json_response[0]["prev"] == "14a"


def test_get_specific_norm_malformed_paragraph_nr(api_client):
    """should return a specific norm even when `paragraph_nr` has extra whitespace"""
    # add extra space in paragraph_nr string
    response = api_client.get("/norms/search?jurabk=Test2G&paragraph_nr=1 a")
    json_response = response.json()
    assert response.status_code == 200
    assert json_response[0]["paragraph_nr"] == "1a"
    assert json_response[0]["prev"] == "1"
    assert json_response[0]["next"] == "2"
    assert len(json_response) == 1


def test_get_specific_norm_by_doknr(api_client):
    """should get a specific norm, given doknr"""
    response = api_client.get("/norms/search?doknr=BJNRTEST&paragraph_nr=1")
    json_response = response.json()
    assert response.status_code == 200
    assert json_response[0]["paragraph_nr"] == "1"
    assert json_response[0]["prev"] is None
    assert json_response[0]["next"] == "2"
    assert "Test2G" not in json_response[0]["jurabk"]
    assert len(json_response) == 1


def test_get_specific_norm_by_doknr_malformed_paragraph_nr(api_client):
    """should return a specific norm even when `paragraph_nr` has extra whitespace"""
    # add extra space in paragraph_nr string
    response = api_client.get("/norms/search?doknr=BJNRTEST2&paragraph_nr=1 a")
    json_response = response.json()
    assert response.status_code == 200
    assert json_response[0]["paragraph_nr"] == "1a"
    assert json_response[0]["prev"] == "1"
    assert json_response[0]["next"] == "2"
    assert len(json_response) == 1


@pytest.mark.parametrize(
    "query",
    [
        "jurabk=Foo",
        "jurabk=Test2G&paragraph_nr=500f",
        "doknr=BJNR999990005&paragraph_nr=1",
    ]
)
def test_get_specific_norm_not_found(query, api_client):
    """should return an empty list when a specific norm is not found"""
    response = api_client.get(f"/norms/search?{query}")
    assert response.status_code == 200
    assert response.json() == []


def test_get_specific_norm_including_absaetze(api_client):
    """should return absaetze when parameter is specified"""
    response = api_client.get("/norms/search?jurabk=Test2G&paragraph_nr=1&include_absaetze=true")
    assert response.status_code == 200
    json_response = response.json()
    assert json_response[0]["absaetze"] is not None


def test_filter_empty_norms(api_client):
    """
    should return the next populated norm for `next` or `prev`
    when there are empty norms in between
    """
    response = api_client.get("/norms/search?jurabk=Test2G&paragraph_nr=50d")
    json_response = response.json()
    assert response.status_code == 200
    assert json_response[0]["next"] == "51"
    assert json_response[0]["prev"] == "50"


# temporary, should be tested where it gets written to db?
def test_norm_parsing(api_client):
    """should return only relevant norms"""
    response = api_client.get("/norms/search?jurabk=Test2G&include_absaetze=true")
    json_response = response.json()
    assert response.status_code == 200
    # excerpt from nested list text
    assert "den vorausschauenden Ausbau, die optimierte Nutzung" in json_response[0]["absaetze"][1]["absatz_text"]


def test_get_norm_absaetze_sorted(api_client):
    """should sort returned absaetze"""
    response = api_client.get("/norms/search?jurabk=BTestG&paragraph_nr=10&include_absaetze=true")
    assert response.status_code == 200
    json_response = response.json()
    assert len(json_response) == 1
    assert [
        "1",
        "1a",
        "2",
        "3",
        "3a",
        "4",
        "5",
        "6",
        "6a",
        "7",
        "8",
        "8a",
        "9",
        "10",
        "11",
    ] == [entry["absatz_nr"] for entry in json_response[0]["absaetze"]]


def test_get_norm_success(api_client):
    """should return a single norm object (not a list) with its absaetze"""
    response = api_client.get("/norms/Test2G/1")
    json_response = response.json()
    assert response.status_code == 200
    # single object, not a list
    assert isinstance(json_response, dict)
    assert json_response["jurabk"].lower() == "test2g"
    assert json_response["paragraph_nr"] == "1"
    assert json_response["absaetze"] is not None


def test_get_norm_malformed_paragraph_nr(api_client):
    """should resolve a norm even when paragraph_nr has extra whitespace"""
    response = api_client.get("/norms/Test2G/1 a")
    json_response = response.json()
    assert response.status_code == 200
    assert json_response["paragraph_nr"] == "1a"


def test_get_norm_not_found(api_client):
    """should return 404 when the norm does not exist"""
    response = api_client.get("/norms/Test2G/500f")
    assert response.status_code == 404


def test_get_norm_missing_paragraph_nr(api_client):
    """should return 404 when the required paragraph_nr path segment is missing"""
    response = api_client.get("/norms/Test2G")
    assert response.status_code == 404


def test_get_absaetze_sorted(api_client):
    """should sort returned absaetze"""
    response = api_client.get("/absatz/BTestG?paragraph_nr=10")
    assert response.status_code == 200
    json_response = response.json()
    assert [
        "1",
        "1a",
        "2",
        "3",
        "3a",
        "4",
        "5",
        "6",
        "6a",
        "7",
        "8",
        "8a",
        "9",
        "10",
        "11",
    ] == [entry["absatz_nr"] for entry in json_response]


@pytest.mark.parametrize(
    "jurabk, paragraph_nr",
    [
        ("BTestG", "10"),
        ("BTestG", "7"),
    ],
)
def test_get_absaetze_includes_saetze(api_client, jurabk, paragraph_nr):
    """should include sorted saetze list when fetching absaetze"""
    response = api_client.get(f"/absatz/{jurabk}?paragraph_nr={paragraph_nr}")
    assert response.status_code == 200
    json_response = response.json()
    for absatz in json_response:
        assert "saetze" in absatz.keys()
        satz_id_list = [satz["satz_id"] for satz in absatz["saetze"]]
        assert satz_id_list == sorted(satz_id_list)


def test_search_documents_with_bundesland_filter(api_client):
    """should not crash when bundesland query param is provided"""
    response = api_client.get("/documents/search/test?bundesland=BY")
    assert response.status_code == 200


def test_documents_by_jurabk(api_client):
    """should return document when queried by jurabk"""
    response = api_client.get("/documents/search/btestg")
    json_response = response.json()
    assert len(json_response) == 1
    assert json_response[0]["jurabk"].lower() == "btestg"


@pytest.mark.parametrize(
    "query,result",
    [("von gesetzen", "btestg"), ("normen", "test2g"), ("coverage", "test2g")],
)
def test_documents_by_kurzue(query: str, result: str, api_client):
    """should return document when queried by kurzue or langue"""
    response = api_client.get(f"/documents/search/{query}")
    json_response = response.json()
    assert len(json_response) == 1
    assert json_response[0]["jurabk"].lower() == result


def test_get_specific_doc(api_client):
    """should return a single document on exact match"""
    response = api_client.get("/documents/BTestG")
    json_response = response.json()
    assert json_response["jurabk"].lower() == "btestg"
    assert isinstance(json_response, dict)


def test_get_technische_norm_by_dokument(api_client):
    """should return technische Norm for an exact dokument match"""
    response = api_client.get("/technische-normen/ASME B31.12-2019")
    json_response = response.json()

    assert response.status_code == 200
    assert json_response["dokument"] == "ASME B31.12-2019"
    assert json_response["titel_en"] == "Hydrogen Piping and Pipelines"
    assert "kurzbeschreibung" in json_response


def test_get_technische_norm_case_insensitive(api_client):
    """should match dokument identifier case-insensitively"""
    response = api_client.get("/technische-normen/asme b31.12-2019")
    json_response = response.json()

    assert response.status_code == 200
    assert json_response["dokument"] == "ASME B31.12-2019"


def test_get_technische_norm_not_found(api_client):
    """should return 404 when dokument does not exist"""
    response = api_client.get("/technische-normen/NONEXISTENT-NORM-XYZ")
    assert response.status_code == 404
