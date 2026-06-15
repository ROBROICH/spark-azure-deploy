from authentification.auth import AuthClient

revision: str = "001"

SCHEMA = """
// Users
definition user {}

// Groups
definition group {
    relation member: user | group#member
}

//Projects
definition project {
  relation member: user | group#member
  relation owner: user | group#member

  permission access = member + owner

  permission read    = member + owner
  permission create  = member + owner
  permission update  = member + owner
  permission execute = member + owner
  permission delete  = member + owner
  permission assign = owner
}
"""


async def upgrade(client: AuthClient) -> None:
    """Initial migration."""
    await client.write_schema(schema=SCHEMA)
