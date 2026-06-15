from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.models.db.enums import ProcessStep, SourceType
from src.services import comment_service


@pytest.mark.asyncio
async def test_get_comments_builds_fixed_order_and_pagination_query() -> None:
    db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = list[object]()
    db.execute.return_value = mock_result

    project_id = uuid4()

    await comment_service.get_comments(
        project_id=project_id,
        db=db,
        process_steps=[ProcessStep.UNSORTED],
        source_types=[SourceType.MANUAL],
        limit=10,
        offset=5,
    )

    query = db.execute.call_args.args[0]
    sql = str(query)

    assert "WHERE comment.project_id" in sql
    assert "comment.process_step IN" in sql
    assert "comment.source_type IN" in sql
    assert "ORDER BY comment.created_at ASC" in sql
    assert "LIMIT" in sql
    assert "OFFSET" in sql
