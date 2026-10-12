import pytest
from authentification.resolver import path_param, query_param, snake_to_camel
from fastapi import HTTPException, Request


# ----------------------
# snake_to_camel tests
# ----------------------
def test_snake_to_camel():
    assert snake_to_camel("project_id") == "projectId"
    assert snake_to_camel("file_id") == "fileId"
    assert snake_to_camel("simple") == "simple"
    assert snake_to_camel("nested_value_test") == "nestedValueTest"


# ----------------------
# path_param tests
# ----------------------
@pytest.mark.asyncio
async def test_path_param_success():
    req = Request(scope={"type": "http", "path_params": {"project_id": "123"}})
    resolver = path_param("project_id")
    value = await resolver(req)
    assert value == "123"


@pytest.mark.asyncio
async def test_path_param_camel_case():
    req = Request(scope={"type": "http", "path_params": {"projectId": "456"}})
    resolver = path_param("project_id")
    value = await resolver(req)
    assert value == "456"


@pytest.mark.asyncio
async def test_path_param_missing():
    req = Request(scope={"type": "http", "path_params": {}})
    resolver = path_param("project_id")
    with pytest.raises(HTTPException) as exc_info:
        await resolver(req)
    assert exc_info.value.status_code == 400
    assert "Missing path parameter" in exc_info.value.detail


# ----------------------
# query_param tests
# ----------------------
@pytest.mark.asyncio
async def test_query_param_success_snake():
    req = Request(
        scope={
            "type": "http",
            "query_string": b"project_id=123",
        }
    )
    resolver = query_param("project_id")
    value = await resolver(req)
    assert value == "123"


@pytest.mark.asyncio
async def test_query_param_success_camel():
    req = Request(
        scope={
            "type": "http",
            "query_string": b"projectId=456",
        }
    )
    resolver = query_param("project_id")
    value = await resolver(req)
    assert value == "456"


@pytest.mark.asyncio
async def test_query_param_missing():
    req = Request(
        scope={
            "type": "http",
            "query_string": b"",
        }
    )
    resolver = query_param("project_id")

    with pytest.raises(HTTPException) as exc_info:
        await resolver(req)

    assert exc_info.value.status_code == 400
    assert "Missing query parameter" in exc_info.value.detail


@pytest.mark.asyncio
async def test_query_param_empty_value():
    req = Request(
        scope={
            "type": "http",
            "query_string": b"project_id=",
        }
    )
    resolver = query_param("project_id")

    with pytest.raises(HTTPException) as exc_info:
        await resolver(req)

    assert exc_info.value.status_code == 400
    assert "Missing query parameter" in exc_info.value.detail
