import inspect
import json
import subprocess
import sys
from textwrap import dedent
from uuid import uuid4

import pytest
from temporal.contracts import (
    ArgumentSubtopic,
    DocumentManagementFileProcessingTemporalInput,
    DocumentMeta,
    Extra,
    RechtsmethodikWorkflowInput,
)
from temporalio.contrib.pydantic import pydantic_data_converter


def test_cold_generated_contract_serializes_at_a_temporal_child_boundary() -> None:
    completed = subprocess.run(
        [
            sys.executable,
            "-c",
            dedent(
                """
                import asyncio
                import json
                from dataclasses import dataclass

                from pydantic import BaseModel
                from temporal.contracts import Chunk
                from temporalio.contrib.pydantic import pydantic_data_converter

                class ParentInput(BaseModel):
                    chunks: list[Chunk]

                @dataclass
                class ChildInput:
                    chunks: list[Chunk]

                async def main() -> None:
                    parent = ParentInput.model_validate(
                        {
                            "chunks": [
                                {
                                    "chunk_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                                    "page_content": "Artenschutzbeitrag",
                                    "metadata": {},
                                    "sub_chunks": [],
                                }
                            ]
                        }
                    )
                    [parent_payload] = await pydantic_data_converter.encode([parent])
                    [decoded] = await pydantic_data_converter.decode([parent_payload], [ParentInput])
                    [child_payload] = await pydantic_data_converter.encode(
                        [ChildInput(chunks=decoded.chunks)]
                    )
                    print(json.dumps(json.loads(child_payload.data)))

                asyncio.run(main())
                """
            ),
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    assert json.loads(completed.stdout) == {
        "chunks": [
            {
                "chunkId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                "parentChunkId": None,
                "pageContent": "Artenschutzbeitrag",
                "metadata": {},
                "subChunks": [],
                "header": None,
                "pageIndexNode": None,
            }
        ]
    }


def test_python_dump_uses_snake_case() -> None:
    topic_id = uuid4()
    model = ArgumentSubtopic(topic_id=topic_id, name="Artenschutz", description="desc")
    payload = model.model_dump(mode="json")

    assert payload["topic_id"] == str(topic_id)
    assert "topicId" not in payload
    assert model.topic_id == topic_id


def test_camel_json_validates_to_snake_attribute() -> None:
    topic_id = uuid4()
    model = ArgumentSubtopic.model_validate({"topicId": str(topic_id), "name": "Artenschutz", "description": "desc"})
    assert model.topic_id == topic_id


def test_python_json_dump_uses_snake_case() -> None:
    model = RechtsmethodikWorkflowInput(jurabk="BNatSchG", paragraph_nr="44")

    dumped = json.loads(model.model_dump_json())

    assert dumped["paragraph_nr"] == "44"
    assert "paragraphNr" not in dumped
    assert model.paragraph_nr == "44"


def test_paragraph_nr_camel_json_validates_to_snake_attribute() -> None:
    model = RechtsmethodikWorkflowInput.model_validate({"jurabk": "BNatSchG", "paragraphNr": "44"})
    assert model.paragraph_nr == "44"


def test_generated_constructor_signature_uses_snake_case() -> None:
    parameters = inspect.signature(RechtsmethodikWorkflowInput).parameters

    assert "paragraph_nr" in parameters
    assert "paragraphNr" not in parameters


@pytest.mark.asyncio
async def test_temporal_boundary_serializes_camel_case_and_decodes_to_snake_attributes() -> None:
    model = RechtsmethodikWorkflowInput(jurabk="BNatSchG", paragraph_nr="44")

    [payload] = await pydantic_data_converter.encode([model])
    wire_value = json.loads(payload.data)
    [decoded] = await pydantic_data_converter.decode([payload], [RechtsmethodikWorkflowInput])

    assert wire_value["paragraphNr"] == "44"
    assert "paragraph_nr" not in wire_value
    assert decoded.paragraph_nr == "44"


def test_discriminated_union_accepts_camel_wire_input() -> None:
    file_id = uuid4()
    model = DocumentManagementFileProcessingTemporalInput.model_validate(
        {
            "request": {
                "kind": "single_file",
                "workflowName": "SingleFileProcessingWorkflow",
                "executionId": "single-file",
                "taskQueue": "dms",
                "projectId": None,
                "projectVersion": None,
                "idReusePolicy": "ALLOW_DUPLICATE_FAILED_ONLY",
                "idConflictPolicy": "USE_EXISTING",
                "workflowInput": {
                    "fileId": str(file_id),
                    "bucketPath": "documents/file.pdf",
                    "filename": "file.pdf",
                    "fileType": "document",
                    "projectId": None,
                    "workflowActor": None,
                },
            }
        }
    )

    assert model.request.kind == "single_file"
    assert model.request.workflow_input.file_id == file_id


@pytest.mark.asyncio
async def test_temporal_boundary_preserves_declared_snake_wire_names() -> None:
    payloads = await pydantic_data_converter.encode(
        [
            DocumentMeta(id="document", drucksachetyp="Gesetzentwurf", pdf_url="https://example.test/document.pdf"),
            Extra(api_key="secret"),
        ]
    )
    document_meta, extra = [json.loads(payload.data) for payload in payloads]

    assert document_meta["pdf_url"] == "https://example.test/document.pdf"
    assert "pdfUrl" not in document_meta
    assert extra["api_key"] == "secret"
    assert "apiKey" not in extra
