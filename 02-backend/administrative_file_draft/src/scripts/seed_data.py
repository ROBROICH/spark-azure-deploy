import asyncio
import json
import uuid
from pathlib import Path

from event_logging import EventAction, EventOutcome
from event_logging.enums import EventCategory, LogEventDefault
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db.database import get_db_session
from src.models.db_models import VaeTemplate, VaeTemplateNode
from src.utils.logger import logger

PROJECT_TYPE_ID = uuid.UUID("00000000-0000-0000-0000-000000000000")
TEMPLATE_NAME = "Default Template"
TEMPLATE_VERSION = 1

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"


async def seed_vae_template(db: AsyncSession, json_path: Path) -> None:
    data = json.loads(Path(json_path).read_text())

    # 1. Deactivate existing templates for this project type
    await db.execute(update(VaeTemplate).where(VaeTemplate.project_type_id == PROJECT_TYPE_ID).values(is_active=False))

    # 2. Create NEW template (always)
    template = VaeTemplate(
        id=uuid.uuid4(),
        name=TEMPLATE_NAME,
        project_type_id=PROJECT_TYPE_ID,
        version=TEMPLATE_VERSION,
        is_active=True,
    )
    db.add(template)
    await db.flush()

    # 3. Create ID mapping (old → new)
    id_map = {node["id"]: str(uuid.uuid4()) for node in data}

    # 4. Insert nodes with NEW IDs
    for node in data:
        new_id = uuid.UUID(id_map[node["id"]])

        db.add(
            VaeTemplateNode(
                id=new_id,
                template_id=template.id,
                title=node["title"],
                text=node.get("text", ""),
                parent_vae_node_id=None,  # set later
                order=node["order"],
                topic=node["topic"],
                is_hidden=node["is_hidden"],
                can_add_child=node["can_add_child"],
            )
        )

    await db.flush()

    # 5. Fix parent UUID using mapped IDs
    for node in data:
        parent_id = node["parent_vae_node_id"]

        if parent_id:
            await db.execute(
                update(VaeTemplateNode)
                .where(VaeTemplateNode.id == uuid.UUID(id_map[node["id"]]))
                .values(parent_vae_node_id=uuid.UUID(id_map[parent_id]))
            )

    await db.commit()


async def seed_data(db: AsyncSession) -> None:
    """Populate the database with required vae template.

    Idempotent: existing rows are skipped. Safe to run on every startup.

    Args:
        db: Async SQLAlchemy session.
    """
    logger.info(
        action=EventAction.WRITE,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.DATABASE,
        default_event=LogEventDefault.DB_WRITE,
        message="Starting database seeding...",
    )

    await seed_vae_template(db=db, json_path=DATA_DIR / "vae_nodes.json")

    logger.info(
        action=EventAction.WRITE,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.DATABASE,
        default_event=LogEventDefault.DB_SUCCESS,
        message="Successfully seeded database",
    )


async def main() -> None:
    """Main entry point to seed the database."""
    async for session in get_db_session():
        await seed_data(db=session)
        break


if __name__ == "__main__":
    asyncio.run(main())
