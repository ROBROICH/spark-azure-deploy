"""Trigger a bounded jura-db (Rechtsprechung) ingestion run.

Usage: .venv\\Scripts\\python.exe scripts\\_populate_jura.py [MAX_DOCS]
Starts UpdateRechtsprechungWorkflow on task queue 'rechtsprechung' (worker-jura-db),
which downloads court decisions from the public RII source, chunks them, and
embeds with OpenAI (text-embedding-3-small @ 1024 dims) into begruendungen chunks.
"""

import asyncio
import sys
import time

from temporalio.client import Client
from temporalio.contrib.pydantic import PydanticPayloadConverter
from temporalio.converter import DataConverter
from temporal.workflows.jura_db.types import UpdateRechtsprechungInput


async def main() -> None:
    max_docs = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    client = await Client.connect(
        "localhost:7233",
        namespace="default",
        data_converter=DataConverter(payload_converter_class=PydanticPayloadConverter),
    )
    inp = UpdateRechtsprechungInput(overwrite=False, offset=None, max_documents=max_docs)
    wf_id = f"manual-jura-populate-{int(time.time())}"
    handle = await client.start_workflow(
        "UpdateRechtsprechungWorkflow",
        inp,
        id=wf_id,
        task_queue="rechtsprechung",
    )
    print(f"STARTED id={handle.id} run={handle.first_execution_run_id} max_documents={max_docs}")


if __name__ == "__main__":
    asyncio.run(main())
