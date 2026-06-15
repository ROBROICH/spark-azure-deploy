"""Tests for llm_client.worker — Worker entry-point."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from llm_client.env import ENV, QueueConfig


class TestWorkerMain:
    @pytest.mark.asyncio
    @patch("llm_client.worker.shutdown_observability")
    @patch("llm_client.worker.start_temporal_worker", new_callable=AsyncMock)
    @patch("llm_client.worker.S3PayloadStorage")
    async def test_main_starts_workers_for_each_queue(
        self,
        mock_storage_cls: MagicMock,
        mock_start_worker: AsyncMock,
        mock_shutdown: MagicMock,
    ) -> None:
        from llm_client.worker import main

        mock_storage_cls.return_value = "mock_storage"

        # Patch ENV.queue_config to return two queues
        test_queues = [
            QueueConfig(NAME="llm-nvidia", MAX_CONCURRENT=10),
            QueueConfig(NAME="llm-mistral", MAX_CONCURRENT=5, MAX_PER_SECOND=2.0),
        ]
        with patch.object(
            type(ENV),
            "queue_config",
            new_callable=lambda: property(lambda self: test_queues),
        ):
            await main()

        assert mock_start_worker.call_count == 2

        # Check first worker call
        call_args_0 = mock_start_worker.call_args_list[0][1]
        assert call_args_0["task_queue"] == "llm-nvidia"
        assert call_args_0["max_concurrent_activities"] == 10
        assert call_args_0["max_task_queue_activities_per_second"] is None
        assert call_args_0["storage"] == "mock_storage"
        assert call_args_0["host"] == ENV.TEMPORAL.HOST
        assert call_args_0["workflows"] == []

        # Check second worker call
        call_args_1 = mock_start_worker.call_args_list[1][1]
        assert call_args_1["task_queue"] == "llm-mistral"
        assert call_args_1["max_concurrent_activities"] == 5
        assert call_args_1["max_task_queue_activities_per_second"] == 2.0

    @pytest.mark.asyncio
    @patch("llm_client.worker.shutdown_observability")
    @patch("llm_client.worker.start_temporal_worker", new_callable=AsyncMock)
    @patch("llm_client.worker.S3PayloadStorage")
    async def test_main_calls_shutdown_on_error(
        self,
        mock_storage_cls: MagicMock,
        mock_start_worker: AsyncMock,
        mock_shutdown: MagicMock,
    ) -> None:
        from llm_client.worker import main

        mock_start_worker.side_effect = RuntimeError("connection failed")

        test_queues = [QueueConfig(NAME="llm-nvidia", MAX_CONCURRENT=10)]
        with patch.object(
            type(ENV),
            "queue_config",
            new_callable=lambda: property(lambda self: test_queues),
        ):
            with pytest.raises(RuntimeError, match="connection failed"):
                await main()

        mock_shutdown.assert_called_once()

    @pytest.mark.asyncio
    @patch("llm_client.worker.shutdown_observability")
    @patch("llm_client.worker.start_temporal_worker", new_callable=AsyncMock)
    @patch("llm_client.worker.S3PayloadStorage")
    async def test_main_passes_s3_config(
        self,
        mock_storage_cls: MagicMock,
        mock_start_worker: AsyncMock,
        mock_shutdown: MagicMock,
    ) -> None:
        from llm_client.worker import main

        test_queues = [QueueConfig(NAME="q", MAX_CONCURRENT=1)]
        with patch.object(
            type(ENV),
            "queue_config",
            new_callable=lambda: property(lambda self: test_queues),
        ):
            await main()

        mock_storage_cls.assert_called_once_with(
            bucket_name=ENV.TEMPORAL.S3_BUCKET_NAME,
            endpoint_url=ENV.TEMPORAL.S3_ENDPOINT_URL,
            access_key=ENV.TEMPORAL.S3_ACCESS_KEY_ID,
            secret_key=ENV.TEMPORAL.S3_SECRET_ACCESS_KEY,
            region=ENV.TEMPORAL.S3_REGION,
        )

    @pytest.mark.asyncio
    @patch("llm_client.worker.shutdown_observability")
    @patch("llm_client.worker.start_temporal_worker", new_callable=AsyncMock)
    @patch("llm_client.worker.S3PayloadStorage")
    async def test_main_passes_activities(
        self,
        mock_storage_cls: MagicMock,
        mock_start_worker: AsyncMock,
        mock_shutdown: MagicMock,
    ) -> None:
        from llm_client.worker import main

        test_queues = [QueueConfig(NAME="q", MAX_CONCURRENT=1)]
        with patch.object(
            type(ENV),
            "queue_config",
            new_callable=lambda: property(lambda self: test_queues),
        ):
            await main()

        call_kwargs = mock_start_worker.call_args[1]
        activity_names = [a.__name__ for a in call_kwargs["activities"]]
        assert "_llm_invoke" in activity_names
        assert "_embedding_invoke" in activity_names
        assert "_vlm_invoke" in activity_names
        assert len(call_kwargs["activities"]) == 3
