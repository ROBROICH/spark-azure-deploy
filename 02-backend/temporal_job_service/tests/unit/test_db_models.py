from src.models.db_models import Base, WorkflowExecution, WorkflowStatus


def test_workflow_execution_defaults():
    row = WorkflowExecution(
        workflow_id="wf-1",
        run_id="run-1",
        workflow_type="FVPWorkflow",
        status=WorkflowStatus.PENDING,
    )
    assert row.workflow_id == "wf-1"
    assert row.run_id == "run-1"
    assert row.workflow_type == "FVPWorkflow"
    assert row.status == WorkflowStatus.PENDING
    assert row.project_id is None
    assert row.history_s3_key is None


def test_workflow_status_values():
    assert {s.value for s in WorkflowStatus} == {
        "pending",
        "running",
        "failed",
        "completed",
        "terminated",
        "cancelled",
        "timed_out",
    }


def test_base_is_declarative_base():
    assert hasattr(Base, "metadata")
    assert "workflow_execution" in Base.metadata.tables
