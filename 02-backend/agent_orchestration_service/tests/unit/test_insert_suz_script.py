import runpy
from pathlib import Path

AGENT_ORCHESTRATION_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_GLOBALS = runpy.run_path(
    str(AGENT_ORCHESTRATION_ROOT / "scripts" / "insert_suz.py"),
    run_name="insert_suz_script",
)

SuZResultFile = SCRIPT_GLOBALS["SuZResultFile"]
build_fundstellen = SCRIPT_GLOBALS["build_fundstellen"]


def test_build_fundstellen_keeps_suz_metadata_in_payload() -> None:
    parsed = SuZResultFile.model_validate(
        {
            "satz_key": "absatz_1/satz_1",
            "originaltexte": [
                {
                    "node_id": "node-1",
                    "document_id": "file-1",
                    "title": "Fundstelle title",
                    "text": "Fundstelle text",
                    "chunk_ids": ["chunk-1", "chunk-2"],
                    "page_numbers": [3, 4],
                }
            ],
        }
    )

    inserts = build_fundstellen(
        parsed.originaltexte,
        gesetz_id="gesetz-1",
        norm_id="norm-1",
        satz_id="satz-1",
        dms_to_dokument={"file-1": "doc-1"},
    )

    assert inserts == [
        {
            "node_type": "fundstelle",
            "id": inserts[0]["id"],
            "payload": {
                "satz_id": "satz-1",
                "dokument_id": "doc-1",
                "gesetz_id": "gesetz-1",
                "norm_id": "norm-1",
                "title": "Fundstelle title",
                "text": "Fundstelle text",
                "page_numbers": [3, 4],
                "chunk_ids": ["chunk-1", "chunk-2"],
                "frontend_parent_ids": ["chunk:chunk-1", "chunk:chunk-2"],
            },
        }
    ]
