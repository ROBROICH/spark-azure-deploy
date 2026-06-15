import asyncio
from datetime import timedelta
from uuid import UUID

from temporal.project_context import current_project_context
from temporal.workflows.project_lifecycle.project_lifecycle import PROJECT_INITIALIZATION_WORKFLOW_ID
from temporalio import workflow
from temporalio.common import RetryPolicy

from src.models.db.workflow_enum import WorkflowStatusEnum
from src.models.schemas.project_schemas import ProjectInternalStatusEnum
from src.services.workflows.activities.initialize_templates import (
    assign_vae_template,
    initialize_fcs_required_document_types,
)
from src.services.workflows.activities.update_project_status import update_project_status
from src.services.workflows.workflow_models import ProjectInitializationInput, ProjectInitializationOutput

RETRY_POLICY = RetryPolicy(
    initial_interval=timedelta(seconds=10),
    maximum_interval=timedelta(minutes=1),
    maximum_attempts=1,
)


@workflow.defn(name=PROJECT_INITIALIZATION_WORKFLOW_ID)
class ProjectInitializationWorkflow:
    @workflow.run
    async def run(self, workflow_input: ProjectInitializationInput) -> ProjectInitializationOutput:
        workflow.logger.info(f"ProjectInitializationWorkflow started for '{workflow_input.project_id}' ")

        try:
            await self._initialize_fcs_required_document_types(
                project_id=workflow_input.project_id,
                project_type_id=workflow_input.project_type_id,
                project_version=workflow_input.project_version,
            )

            await self._assign_vae_template(
                project_id=workflow_input.project_id,
                project_type_id=workflow_input.project_type_id,
            )

            project_context = current_project_context()
            if project_context is None or project_context.project_version == 1:
                await self._update_project_status(
                    project_id=workflow_input.project_id,
                )
            else:
                workflow.logger.info(
                    "Skipping project status update for ProjectInitializationWorkflow "
                    f"on project '{workflow_input.project_id}' version {project_context.project_version}."
                )

            return ProjectInitializationOutput(
                status=WorkflowStatusEnum.COMPLETED,
                message="Project initialized successfully",
            )

        except asyncio.CancelledError:
            workflow.logger.exception(
                f"ProjectInitializationWorkflow for project '{workflow_input.project_id}' has been canceled."
            )
            return ProjectInitializationOutput(
                status=WorkflowStatusEnum.CANCELED,
                message="ProjectInitialization workflow has been canceled",
            )
        except Exception as e:
            workflow.logger.exception(
                f"ProjectInitializationWorkflow for project '{workflow_input.project_id}' failed: {e}."
            )
            raise

    async def _assign_vae_template(
        self,
        project_id: UUID,
        project_type_id: UUID,
    ) -> None:
        """Helper method to assign the VAE template to the project."""
        await workflow.execute_activity(
            assign_vae_template,
            args=(project_id, project_type_id),
            start_to_close_timeout=timedelta(seconds=10),
            retry_policy=RETRY_POLICY,
        )

    async def _initialize_fcs_required_document_types(
        self,
        project_id: UUID,
        project_type_id: UUID,
        project_version: int,
    ) -> None:
        """Helper method to initialize FCS required document types."""
        await workflow.execute_activity(
            initialize_fcs_required_document_types,
            args=(project_id, project_type_id, project_version),
            start_to_close_timeout=timedelta(seconds=10),
            retry_policy=RETRY_POLICY,
        )

    async def _update_project_status(self, project_id: UUID) -> None:
        """Helper to update the project status."""
        await workflow.execute_activity(
            update_project_status,
            args=(project_id, ProjectInternalStatusEnum.UPLOAD_DOCUMENTS),
            start_to_close_timeout=timedelta(seconds=10),
            retry_policy=RETRY_POLICY,
        )
