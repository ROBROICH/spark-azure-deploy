"""Client for communicating with agent_orchestration_service."""

from uuid import UUID

import httpx
from event_logging.enums import EventAction, EventCategory, EventOutcome, LogEventDefault
from internal_auth import internal_api_key_headers

from src.config.settings import settings
from src.utils.logger import logger
from src.utils.retry import global_retry


class AgentOrchestrationClient:
    """Client for agent orchestration service API calls."""

    BASE_URL = settings.AGENT_ORCHESTRATION_BASE_URL
    TIMEOUT = 60  # seconds

    @classmethod
    @global_retry
    async def start_fpp_download_workflow(
        cls,
        project_id: UUID,
        file_id: UUID,
        file_url: str,
        file_name: str,
        file_type: str,
    ) -> dict:
        """
        Start FPP file download workflow in agent_orchestration_service.

        Args:
            project_id: Project ID
            file_id: FPP file ID
            file_url: URL to download the file from
            file_name: Name of the file
            file_type: Type of file (PLANUNTERLAGEN, ERGAENZENDE_UNTERLAGEN)

        Returns:
            Workflow response with workflow ID

        Raises:
            httpx.HTTPStatusError: If the request fails
        """
        url = f"{cls.BASE_URL}/workflows/fpp-download"
        payload = {
            "project_id": str(project_id),
            "file": {
                "url": file_url,
                "file_name": file_name,
                "file_id": str(file_id),
                "file_type": file_type,
            },
        }

        async with httpx.AsyncClient(timeout=cls.TIMEOUT, headers=internal_api_key_headers()) as client:
            try:
                response = await client.post(url, json=payload)
                response.raise_for_status()

                logger.info(
                    action=EventAction.NOTIFY,
                    outcome=EventOutcome.SUCCESS,
                    category=EventCategory.API,
                    default_event=LogEventDefault.GENERAL,
                    message=f"Started FPP download workflow for file {file_id}",
                )

                return response.json()

            except httpx.HTTPStatusError as e:
                logger.error(
                    action=EventAction.NOTIFY,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.API,
                    default_event=LogEventDefault.GENERAL,
                    message=f"Failed to start FPP download workflow: HTTP {e.response.status_code}",
                )
                raise

            except httpx.RequestError as e:
                logger.error(
                    action=EventAction.NOTIFY,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.API,
                    default_event=LogEventDefault.GENERAL,
                    message=f"Failed to start FPP download workflow: {e}",
                )
                raise
