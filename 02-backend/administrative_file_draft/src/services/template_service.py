import uuid
from collections.abc import Sequence
from typing import Any

from audit_client import ChangeType, record_audit_entry
from event_logging import EventAction, EventCategory, EventOutcome
from sqlalchemy import insert, select, update
from sqlalchemy.ext.asyncio.session import AsyncSession

from src.exceptions.exceptions import NotFoundError
from src.models.db_models import VaeNode, VaeTemplate, VaeTemplateNode
from src.models.schemas.template_schemas import AssignTemplateRequest, TemplateNodeInput
from src.services.risks_service import _get_latest_project_version, _validate_project_write_version
from src.utils.logger import logger


class TemplateService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_templates(self, project_type_id: uuid.UUID) -> Sequence[VaeTemplate]:
        """Lists all available templates"""
        result = await self.db.execute(select(VaeTemplate).where(VaeTemplate.project_type_id == project_type_id))
        return result.scalars().all()

    async def get_template(self, template_id: uuid.UUID) -> VaeTemplate:
        """Gets a template by id"""
        template = await self.db.execute(select(VaeTemplate).where(VaeTemplate.id == template_id))
        return template.scalar_one()

    async def create_template(self, name: str, project_type_id: uuid.UUID) -> VaeTemplate:
        """Create a new template (inactive by default)."""

        # determine next version
        version = (
            (
                await self.db.execute(
                    select(VaeTemplate.version)
                    .where(VaeTemplate.project_type_id == project_type_id)
                    .order_by(VaeTemplate.version.desc())
                )
            )
            .scalars()
            .first()
        )

        template = VaeTemplate(
            name=name,
            project_type_id=project_type_id,
            version=(version or 0) + 1,
            is_active=False,
        )

        self.db.add(template)
        await self.db.commit()

        return template

    async def activate_template(self, template_id: uuid.UUID) -> None:
        """Activate template and deactivate others of same project_type."""

        template = await self.db.get(VaeTemplate, template_id)
        if template is None:
            raise NotFoundError(f"Template {template_id} not found")

        await self.db.execute(
            update(VaeTemplate).where(VaeTemplate.project_type_id == template.project_type_id).values(is_active=False)
        )
        template.is_active = True
        await self.db.commit()

    async def get_active_template(self, project_type_id: uuid.UUID) -> VaeTemplate:
        return (
            await self.db.execute(
                select(VaeTemplate)
                .where(VaeTemplate.project_type_id == project_type_id)
                .where(VaeTemplate.is_active.is_(True))
            )
        ).scalar_one()

    async def add_template_nodes(self, template_id: uuid.UUID, nodes: list[TemplateNodeInput]) -> None:
        """
        Insert nodes into template.
        nodes must contain:
        - id (temp id)
        - parent_id
        - title
        - order
        """

        id_map: dict[uuid.UUID, uuid.UUID] = {}
        db_nodes: list[dict[str, object]] = []

        for node in nodes:
            id_map[node.id] = uuid.uuid4()

        for node in nodes:
            db_nodes.append(
                {
                    "id": id_map[node.id],
                    "template_id": template_id,
                    "parent_vae_node_id": id_map.get(node.parent_id) if node.parent_id is not None else None,
                    "title": node.title,
                    "text": node.text,
                    "topic": node.topic.value if node.topic is not None else None,
                    "order": node.order,
                    "is_hidden": node.is_hidden,
                    "can_add_child": node.can_add_child,
                }
            )

        await self.db.execute(insert(VaeTemplateNode), db_nodes)
        await self.db.commit()

    async def get_template_nodes(self, template_id: uuid.UUID) -> Sequence[VaeTemplateNode]:
        """Gets the list of VAE template nodes for a given template id."""
        return (
            (await self.db.execute(select(VaeTemplateNode).where(VaeTemplateNode.template_id == template_id)))
            .scalars()
            .all()
        )

    async def assign_template(
        self,
        project_id: uuid.UUID,
        project_type_id: uuid.UUID,
        data: AssignTemplateRequest,
        audit_context: dict[str, Any] | None = None,
    ) -> None:
        """
        Copy template nodes into project (idempotent).
        Handles multiple hierarchies via topological ordering.
        """

        async with self.db.begin():
            project_version = await _get_latest_project_version(project_id)
            await _validate_project_write_version(project_id, project_version)
            exists = await self.db.scalar(
                select(VaeNode.id)
                .where(
                    VaeNode.project_id == project_id,
                    VaeNode.project_version == project_version,
                    VaeNode.is_deleted.is_(False),
                )
                .limit(1)
            )
            if exists:
                return

            template = await self.get_active_template(project_type_id)
            template_nodes = await self.get_template_nodes(template.id)

            id_map = {n.id: uuid.uuid4() for n in template_nodes}
            topic_map = {t.name.lower(): t.id for t in data.topics}

            ordered_nodes = self.order_template_nodes(template_nodes)

            new_nodes: list[dict[str, object]] = []
            created_node_ids: list[uuid.UUID] = []

            for node in ordered_nodes:
                topic_id = None
                if node.topic:
                    topic_id = topic_map.get(node.topic.lower())
                    if not topic_id:
                        logger.warn(
                            action=EventAction.NOTIFY,
                            outcome=EventOutcome.FAILURE,
                            category=EventCategory.SERVICE,
                            message=f"Could not find matching topic in DB: {node.topic}",
                        )

                node_id = id_map[node.id]
                created_node_ids.append(node_id)
                new_nodes.append(
                    {
                        "id": node_id,
                        "project_id": project_id,
                        "project_version": project_version,
                        "parent_vae_node_id": id_map.get(node.parent_vae_node_id)
                        if node.parent_vae_node_id is not None
                        else None,
                        "title": node.title,
                        "text": node.text,
                        "order": node.order,
                        "is_hidden": node.is_hidden,
                        "can_add_child": node.can_add_child,
                        "topic_id": topic_id,
                        "checked_by_assignee": False,
                        "checked_by_leader": False,
                    }
                )

            await self.db.execute(insert(VaeNode).values(new_nodes))

            if audit_context is not None:
                for node_id in created_node_ids:
                    await record_audit_entry(
                        self.db,
                        project_id=project_id,
                        entity_type="vae_node",
                        change_type=ChangeType.CREATE,
                        entity_id=node_id,
                        **audit_context,
                    )

    @classmethod
    def order_template_nodes(cls, template_nodes: Sequence[VaeTemplateNode]) -> list[VaeTemplateNode]:
        """
        Return nodes in parent-before-children order,
        preserving sibling order.
        """

        children_map: dict[uuid.UUID | None, list[VaeTemplateNode]] = {}

        for node in template_nodes:
            children_map.setdefault(node.parent_vae_node_id, []).append(node)

        # preserve sibling order
        for siblings in children_map.values():
            siblings.sort(key=lambda n: n.order or 0)

        ordered_nodes: list[VaeTemplateNode] = []
        visited: set[uuid.UUID] = set()

        stack = list(children_map.get(None, []))

        while stack:
            node = stack.pop()

            if node.id in visited:
                continue

            visited.add(node.id)
            ordered_nodes.append(node)

            # reverse to maintain correct order with stack (LIFO)
            stack.extend(reversed(children_map.get(node.id, [])))

        return ordered_nodes
