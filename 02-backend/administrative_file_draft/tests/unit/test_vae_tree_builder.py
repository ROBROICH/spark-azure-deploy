"""Tests for recursive VAE tree construction."""

from types import SimpleNamespace
from uuid import UUID, uuid4

from src.docx_export.vae_tree_builder import build_tree


def _make_node(
    node_id: UUID,
    title: str,
    *,
    parent_id: UUID | None = None,
    order: float = 0,
    is_hidden: bool = False,
    is_deleted: bool = False,
):
    return SimpleNamespace(
        id=node_id,
        title=title,
        text="",
        order=order,
        parent_vae_node_id=parent_id,
        is_hidden=is_hidden,
        is_deleted=is_deleted,
    )


def test_build_tree_sorts_siblings_by_order_then_id():
    root_id = uuid4()
    child_a_id = UUID("00000000-0000-0000-0000-000000000001")
    child_b_id = UUID("00000000-0000-0000-0000-000000000002")

    tree = build_tree(
        [
            _make_node(child_b_id, "Child B", parent_id=root_id, order=1),
            _make_node(root_id, "Root", order=0),
            _make_node(child_a_id, "Child A", parent_id=root_id, order=1),
        ]
    )

    assert [node.id for node in tree] == [root_id]
    assert [child.id for child in tree[0].children] == [child_a_id, child_b_id]


def test_build_tree_promotes_visible_children_of_hidden_parents():
    hidden_parent_id = uuid4()
    visible_child_id = uuid4()

    tree = build_tree(
        [
            _make_node(hidden_parent_id, "Hidden parent", order=0, is_hidden=True),
            _make_node(visible_child_id, "Visible child", parent_id=hidden_parent_id, order=1),
        ]
    )

    assert [node.id for node in tree] == [visible_child_id]
