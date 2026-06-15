from src.services.workflows.create_project_version import CreateProjectVersionWorkflow
from src.services.workflows.delete_project import DeleteProjectWorkflow
from src.services.workflows.initialize_project import ProjectInitializationWorkflow

workflows = [
    ProjectInitializationWorkflow,
    DeleteProjectWorkflow,
    CreateProjectVersionWorkflow,
]
