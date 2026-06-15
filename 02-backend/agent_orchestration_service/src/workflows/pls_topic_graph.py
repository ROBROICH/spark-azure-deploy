from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class TopicTreeNode:
    id: Any
    name: str
    description: str | None
    show_in_ewm: bool


@dataclass(frozen=True, slots=True)
class TopicTree:
    topic: TopicTreeNode
    subtopics: list[TopicTreeNode]


def _field(item: Any, field_name: str) -> Any:
    if isinstance(item, dict):
        return item.get(field_name)
    return getattr(item, field_name, None)


def _tree_node(item: Any) -> TopicTreeNode:
    return TopicTreeNode(
        id=_field(item, "id"),
        name=_field(item, "name"),
        description=_field(item, "description"),
        show_in_ewm=bool(_field(item, "show_in_ewm")),
    )


def build_topic_trees(topics: list[Any], subtopics: list[Any] | None = None) -> list[TopicTree]:
    subtopics_by_parent_id: dict[str, list[TopicTreeNode]] = {}
    for topic in topics:
        parent_topic_id = _field(topic, "parent_topic_id")
        if parent_topic_id is not None:
            subtopics_by_parent_id.setdefault(str(parent_topic_id), []).append(_tree_node(topic))

    for subtopic in subtopics or []:
        parent_topic_id = _field(subtopic, "topic_id")
        if parent_topic_id is not None:
            subtopics_by_parent_id.setdefault(str(parent_topic_id), []).append(_tree_node(subtopic))

    return [
        TopicTree(
            topic=_tree_node(topic),
            subtopics=subtopics_by_parent_id.get(str(_field(topic, "id")), []),
        )
        for topic in topics
        if _field(topic, "parent_topic_id") is None
    ]


async def fetch_topic_trees(pls_client: Any, project_id: Any) -> list[TopicTree]:
    pls_graph = await pls_client.list_nodes(project_id)
    graph_nodes = pls_graph.get("nodes", [])
    topic_scope = TopicGraphScope.from_nodes(graph_nodes)
    node_refs = topic_scope.topic_refs() + topic_scope.subtopic_refs()
    if not node_refs:
        return []

    batch = await pls_client.batch_get_nodes(project_id, node_refs)
    nodes = batch.get("results", [])
    topics = [node for node in nodes if node.get("node_type") == "topic"]
    subtopics = [node for node in nodes if node.get("node_type") == "subtopic"]

    return build_topic_trees(topics, subtopics=subtopics)


def _has_graph_parent(node: dict[str, Any], node_type: str, parent_ids: set[str]) -> bool:
    return any(
        parent.get("node_type") == node_type and str(parent.get("id")) in parent_ids
        for parent in node.get("parents", [])
    )


@dataclass(frozen=True, slots=True)
class TopicGraphScope:
    topic_ids: set[str]
    subtopic_ids_by_topic_id: dict[str, set[str]]

    @classmethod
    def from_nodes(
        cls,
        graph_nodes: list[dict[str, Any]],
        topic_ids: set[str] | None = None,
    ) -> "TopicGraphScope":
        selected_topic_ids = (
            topic_ids
            if topic_ids is not None
            else {str(node["id"]) for node in graph_nodes if node.get("node_type") == "topic"}
        )
        subtopic_ids_by_topic_id: dict[str, set[str]] = {topic_id: set() for topic_id in selected_topic_ids}
        for node in graph_nodes:
            if node.get("node_type") != "subtopic":
                continue
            subtopic_id = str(node["id"])
            for parent in node.get("parents", []):
                parent_id = str(parent.get("id"))
                if parent.get("node_type") == "topic" and parent_id in selected_topic_ids:
                    subtopic_ids_by_topic_id.setdefault(parent_id, set()).add(subtopic_id)

        return cls(
            topic_ids=selected_topic_ids,
            subtopic_ids_by_topic_id=subtopic_ids_by_topic_id,
        )

    @property
    def subtopic_ids(self) -> set[str]:
        return {subtopic_id for subtopic_ids in self.subtopic_ids_by_topic_id.values() for subtopic_id in subtopic_ids}

    def owns_topic_norm_summary(self, node: dict[str, Any]) -> bool:
        return node.get("node_type") == "topic_norm" and (
            _has_graph_parent(node, "topic", self.topic_ids) or _has_graph_parent(node, "subtopic", self.subtopic_ids)
        )

    def topic_norm_refs(self, graph_nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            {"node_type": node["node_type"], "id": node["id"]}
            for node in graph_nodes
            if self.owns_topic_norm_summary(node)
        ]

    def topic_refs(self) -> list[dict[str, Any]]:
        return [{"node_type": "topic", "id": topic_id} for topic_id in sorted(self.topic_ids)]

    def subtopic_refs(self) -> list[dict[str, Any]]:
        return [{"node_type": "subtopic", "id": subtopic_id} for subtopic_id in sorted(self.subtopic_ids)]
