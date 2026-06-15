"""HTTP client for project_logic_service."""

from datetime import date
from uuid import UUID

import httpx
from event_logging.enums import EventAction, EventCategory, EventOutcome, LogEventDefault
from internal_auth import internal_api_key_headers

from src.config.settings import settings
from src.utils.logger import logger
from src.utils.retry import global_retry


class ProjectLogicClient:
    """Client for interacting with project_logic_service API."""

    def __init__(self, base_url: str | None = None):
        """Initialize the client.

        Args:
            base_url: Base URL of project_logic_service (defaults to settings)
        """
        self.base_url = base_url or settings.PROJECT_LOGIC_SERVICE_URL
        self.timeout = 30.0

    @global_retry
    async def create_project(
        self,
        name: str,
        internal_project_number: str,
        created_by_id: UUID | None,
        entry_date: date,
        project_type_id: UUID,
        state: str | None = None,
        company: str | None = None,
        street: str | None = None,
        house_number: str | None = None,
        plz: str | None = None,
        location: str | None = None,
        country: str | None = None,
        email: str | None = None,
        phone: str | None = None,
        fax: str | None = None,
    ) -> dict:
        """
        Create a project in project_logic_service.

        Args:
            name: Project name
            internal_project_number: Internal project number (Aktenzeichen)
            created_by_id: User ID
            entry_date: Entry date
            project_type_id: Project type UUID
            state: Bundesland
            company: Company name
            street: Street name
            house_number: House number
            plz: Postal code
            location: City/location
            country: Country
            email: Email address
            phone: Phone number
            fax: Fax number

        Returns:
            Created project data as dictionary

        Raises:
            httpx.HTTPError: If request fails
        """
        url = f"{self.base_url}/projects"

        payload = {
            "name": name,
            "projectTypeId": str(project_type_id),
            "imported": True,
            "createdById": str(created_by_id) if created_by_id else None,
            "entryDate": entry_date.isoformat(),
            "internalProjectNumber": internal_project_number,
        }

        # Add optional fields
        if state:
            payload["state"] = state
        if company:
            payload["company"] = company
        if street:
            payload["street"] = street
        if house_number:
            payload["houseNumber"] = house_number
        if plz:
            payload["plz"] = plz
        if location:
            payload["location"] = location
        if country:
            payload["country"] = country
        if email:
            payload["email"] = email
        if phone:
            payload["phone"] = phone
        if fax:
            payload["fax"] = fax

        try:
            async with httpx.AsyncClient(timeout=self.timeout, headers=internal_api_key_headers()) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()

                result = response.json()

                logger.info(
                    action=EventAction.ACCESS,
                    outcome=EventOutcome.SUCCESS,
                    category=EventCategory.API,
                    default_event=LogEventDefault.API_REQUEST,
                    message=f"Successfully created project: {result.get('id')}",
                )

                return result

        except httpx.HTTPStatusError as e:
            logger.error(
                action=EventAction.ACCESS,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.API,
                default_event=LogEventDefault.API_REQUEST,
                message=f"Failed to create project: {e.response.status_code} - {e.response.text}",
            )
            raise
        except httpx.HTTPError as e:
            logger.error(
                action=EventAction.ACCESS,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.API,
                default_event=LogEventDefault.API_REQUEST,
                message=f"HTTP error while creating project: {e}",
            )
            raise
