"""Builds a recursive VAE node tree from a flat list of DB rows."""

from dataclasses import dataclass, field
from uuid import UUID

from src.models.db_models import VaeNode


@dataclass
class VaeTreeNode:
    """A single node in the rendered tree."""

    id: UUID
    title: str
    text: str
    order: float
    children: list["VaeTreeNode"] = field(default_factory=list)


def build_tree(nodes: list[VaeNode]) -> list[VaeTreeNode]:
    """Convert a flat VaeNode list into a sorted recursive tree.

    Filters out nodes where is_hidden or is_deleted is True.
    Siblings are sorted by order. Nodes whose parent is absent
    (hidden, deleted, or not in the list) are promoted to root level.
    """
    visible = [n for n in nodes if not n.is_hidden and not n.is_deleted]

    lookup: dict[UUID, VaeTreeNode] = {
        n.id: VaeTreeNode(id=n.id, title=n.title, text=n.text, order=n.order) for n in visible
    }
    visible_ids = set(lookup.keys())

    roots: list[VaeTreeNode] = []
    for node in visible:
        tree_node = lookup[node.id]
        parent_id = node.parent_vae_node_id
        if parent_id is None or parent_id not in visible_ids:
            roots.append(tree_node)
        else:
            lookup[parent_id].children.append(tree_node)

    _sort_recursively(roots)
    return roots


def _sort_recursively(nodes: list[VaeTreeNode]) -> None:
    nodes.sort(key=lambda n: (n.order, str(n.id)))
    for node in nodes:
        _sort_recursively(node.children)
