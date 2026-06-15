import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, TypedDict

import grpc  # type: ignore[untyped-import]
from authzed.api.v1 import (
    AsyncClient,
    CheckBulkPermissionsRequest,
    CheckBulkPermissionsRequestItem,
    CheckPermissionRequest,
    CheckPermissionResponse,
    Consistency,
    DeleteRelationshipsRequest,
    LookupResourcesRequest,
    ObjectReference,
    ReadRelationshipsRequest,
    ReadSchemaRequest,
    ReadSchemaResponse,
    Relationship,
    RelationshipFilter,
    RelationshipUpdate,
    SubjectReference,
    WriteRelationshipsRequest,
    WriteSchemaRequest,
)
from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
)
from grpc import Compression, RpcError  # type: ignore[untyped-import]
from grpcutil import bearer_token_credentials

from authentification.auth_insecure import AsyncInsecureClient
from authentification.config import auth_settings
from authentification.enums import Permission, Relation, Resource, Subject
from authentification.logger import get_logger
from authentification.utils import chunked


class BulkCheckItem(TypedDict):
    resource_type: Resource
    resource_id: str
    permission: Permission


@dataclass(frozen=True)
class RelationshipItem:
    resource_type: Resource
    resource_id: str
    relation: Relation
    subject_type: Subject
    subject_id: str
    subject_relation: str | None = None


type RelationKey = str
type SubjectID = str
type ResourceID = str
type BulkCheckKey = tuple[ResourceID, ResourceID, RelationKey]
type BulkCheckResult = dict[BulkCheckKey, bool]
type BulkRelationsResult = dict[ResourceID, dict[RelationKey, list[SubjectID]]]


class AuthClient:
    """SpiceDB auth client."""

    def __init__(
        self,
        endpoint: str,
        token: str,
        *,
        options: Sequence[tuple[str, Any]] | None = None,
        compression: Compression | None = None,
        consistency: Consistency = Consistency(fully_consistent=True),
        cert_path: str | None = None,
        insecure: bool = False,
    ) -> None:
        """Initialize SpiceDB async client.

        Args:
            endpoint: SpiceDB gRPC endpoint (host:port).
            token: Bearer token for authentication.
            options: Additional gRPC channel options.
            compression: gRPC compression algorithm to use.
            consistency: Default read consistency level.
            cert_path: Optional certificate part to use for authentication.
            insecure: Use plaintext connection (for local dev/testing).
        """
        self.consistency = consistency
        self.cert_path = cert_path
        self.client: Any

        if insecure:
            self.client = AsyncInsecureClient(
                target=endpoint,
                token=token,
                options=options,
                compression=compression,
            )
        else:
            ca_cert = self._load_cert()
            self.client = AsyncClient(  # type: ignore
                target=endpoint,
                credentials=bearer_token_credentials(token, certChain=ca_cert),
                options=options,
                compression=compression,
            )

    def _load_cert(self) -> bytes | None:
        """Loads a CA certificate bundle if provided."""
        if not self.cert_path:
            return None

        try:
            with open(self.cert_path, "rb") as f:
                ca_cert = f.read()
        except Exception as e:
            get_logger().error(
                action=EventAction.READ,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.FILE,
                message=f"Could not load certification file {self.cert_path}: {e}",
            )
            raise
        return ca_cert

    @staticmethod
    def _log_error(error: RpcError) -> None:
        """Logs an GRPC error.

        Args:
            error: gRPC error.
        """
        status_code: grpc.StatusCode = error.code()
        details = error.details() or ""

        get_logger().error(
            action=EventAction.NOTIFY,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            message=f"gRPC Error {status_code.value[0]} {status_code.name}: {details} ",
        )

    @staticmethod
    def _create_write_request(
        resource_type: Resource,
        resource_id: str,
        relation: Relation,
        subject_type: Subject,
        subject_id: str,
        operation: int,
        subject_relation: str | None = None,
    ) -> RelationshipUpdate:
        """Helper method to create a request."""
        subject = SubjectReference(
            object=ObjectReference(
                object_type=subject_type,
                object_id=subject_id,
            ),
            optional_relation=subject_relation or "",
        )

        relationship = Relationship(
            resource=ObjectReference(
                object_type=resource_type,
                object_id=resource_id,
            ),
            relation=relation,
            subject=subject,
        )

        return RelationshipUpdate(
            operation=operation,  # type: ignore[bad-argument-type]
            relationship=relationship,
        )

    async def _bulk_operation_chunked(
        self,
        items: list[RelationshipItem],
        operation: int,
    ) -> None:
        """Helper method for bulk write relationship."""
        updates: list[RelationshipUpdate] = []

        for item in items:
            update = self._create_write_request(
                resource_type=item.resource_type,
                resource_id=item.resource_id,
                relation=item.relation,
                subject_type=item.subject_type,
                subject_id=item.subject_id,
                operation=operation,
                subject_relation=item.subject_relation,
            )
            updates.append(update)

        request = WriteRelationshipsRequest(updates=updates)
        try:
            await self.client.WriteRelationships(request)
        except RpcError as e:
            self._log_error(error=e)
            raise

    async def check_permission(
        self,
        *,
        resource_type: Resource,
        resource_id: str,
        permission: Permission,
        subject_type: Subject,
        subject_id: str,
    ) -> bool:
        """Check if a subject has a specific permission on a resource.

        Args:
            resource_type: Type of the resource (e.g. "project").
            resource_id: ID of the resource.
            permission: Permission to check (e.g. "read").
            subject_type: Type of the subject (usually "user").
            subject_id: ID of the subject (user ID).

        Returns:
            True if the permission is granted, False otherwise.
        """

        request = CheckPermissionRequest(
            resource=ObjectReference(
                object_type=resource_type,
                object_id=resource_id,
            ),
            permission=permission,
            subject=SubjectReference(
                object=ObjectReference(
                    object_type=subject_type,
                    object_id=subject_id,
                )
            ),
            consistency=self.consistency,
        )

        try:
            response = await self.client.CheckPermission(request)
        except RpcError as e:
            self._log_error(error=e)
            raise

        return response.permissionship == CheckPermissionResponse.PERMISSIONSHIP_HAS_PERMISSION

    async def create_relationship(
        self,
        *,
        resource_type: Resource,
        resource_id: str,
        relation: Relation,
        subject_type: Subject,
        subject_id: str,
        subject_relation: Relation | None = None,
    ) -> None:
        """Create or update (touch) a relationship between a resource and a subject.

        Args:
            resource_type: Type of the resource.
            resource_id: ID of the resource.
            relation: Relation name (e.g. "member", "owner").
            subject_type: Type of the subject.
            subject_id: ID of the subject.
            subject_relation: Optional relation on the subject (e.g. "...#member").
        """

        update = self._create_write_request(
            resource_type=resource_type,
            resource_id=resource_id,
            relation=relation,
            subject_type=subject_type,
            subject_id=subject_id,
            operation=RelationshipUpdate.Operation.OPERATION_TOUCH,
            subject_relation=subject_relation,
        )

        request = WriteRelationshipsRequest(updates=[update])
        try:
            await self.client.WriteRelationships(request)
        except RpcError as e:
            self._log_error(error=e)
            raise

    async def delete_relationship(
        self,
        *,
        resource_type: Resource,
        resource_id: str,
        relation: Relation,
        subject_type: Subject,
        subject_id: str,
        subject_relation: str | None = None,
    ) -> None:
        """Delete a specific relationship (idempotent — no error if missing).

        Args:
            resource_type: Type of the resource.
            resource_id: ID of the resource.
            relation: Relation name to remove.
            subject_type: Type of the subject.
            subject_id: ID of the subject.
            subject_relation: Optional subject relation (e.g. "...#member").
        """
        update = self._create_write_request(
            resource_type=resource_type,
            resource_id=resource_id,
            relation=relation,
            subject_type=subject_type,
            subject_id=subject_id,
            operation=RelationshipUpdate.Operation.OPERATION_DELETE,
            subject_relation=subject_relation,
        )
        request = WriteRelationshipsRequest(updates=[update])
        try:
            await self.client.WriteRelationships(request)
        except RpcError as e:
            self._log_error(error=e)
            raise

    async def list_resources_with_permission(
        self,
        *,
        resource_type: Resource,
        permission: Permission,
        subject_type: Subject = Subject.USER,
        subject_id: str,
    ) -> list[str]:
        """List all resource IDs of a given type that the subject can access via
        the permission.

        Args:
            resource_type: Type of resources to look up.
            permission: Permission the subject must have.
            subject_type: Type of the subject (default: "user").
            subject_id: ID of the subject.

        Returns:
            List of resource IDs the subject has the permission on.
        """
        request = LookupResourcesRequest(
            resource_object_type=resource_type,
            permission=permission,
            subject=SubjectReference(
                object=ObjectReference(
                    object_type=subject_type,
                    object_id=subject_id,
                )
            ),
            consistency=self.consistency,
        )

        resource_ids: list[str] = []

        try:
            async for resp in self.client.LookupResources(request):
                resource_ids.append(resp.resource_object_id)
        except RpcError as e:
            self._log_error(error=e)
            raise

        return resource_ids

    async def bulk_check_permissions(
        self,
        *,
        subject_type: Subject,
        subject_id: str,
        checks: list[BulkCheckItem],
        chunk_size: int | None = None,
    ) -> BulkCheckResult:
        """Perform multiple permission checks for the same subject in one request.

        Args:
            subject_type: Type of the subject (usually "user").
            subject_id: ID of the subject performing the action.
            chunk_size: Number of items to read at a time.
            checks: List of items to check, each with:
                - resource_type (str | Resource)
                - resource_id (str)
                - permission (str | Permission)

        Returns:
            Mapping of (resource_type, resource_id, permission) → bool
        """
        if not chunk_size:
            chunk_size = auth_settings().spice_db_bulk_chunk_size

        if not checks:
            return {}

        results: BulkCheckResult = {}

        for chunk in chunked(items=checks, size=chunk_size):
            chunk_result = await self._check_bulk_permissions_chunked(
                subject_type=subject_type,
                subject_id=subject_id,
                checks=chunk,
            )
            results.update(chunk_result)

        return results

    async def _check_bulk_permissions_chunked(
        self,
        *,
        subject_type: Subject,
        subject_id: str,
        checks: list[BulkCheckItem],
    ) -> BulkCheckResult:
        """Helper method for checking bulk permissions."""
        items = []

        for check in checks:
            resource_type = check["resource_type"]
            permission = check["permission"]

            items.append(
                CheckBulkPermissionsRequestItem(
                    resource=ObjectReference(
                        object_type=resource_type,
                        object_id=check["resource_id"],
                    ),
                    permission=permission,
                    subject=SubjectReference(
                        object=ObjectReference(
                            object_type=subject_type,
                            object_id=subject_id,
                        )
                    ),
                )
            )

        request = CheckBulkPermissionsRequest(
            items=items,
            consistency=self.consistency,
        )

        try:
            response = await self.client.CheckBulkPermissions(request)
        except RpcError as e:
            self._log_error(error=e)
            raise

        results: BulkCheckResult = {}

        for pair in response.pairs:
            object_type = pair.request.resource.object_type
            object_id = pair.request.resource.object_id
            permission = pair.request.permission
            if pair.HasField("error"):
                allowed = False
                status = pair.error
                get_logger().warn(
                    action=EventAction.NOTIFY,
                    outcome=EventOutcome.FAILURE,
                    category=EventCategory.AUTHENTICATION,
                    message=(
                        f"Bulk check item failed [{status.code}]: {status.message} "
                        f"→ {object_type}:{object_id}#{permission} "
                        f"@ {subject_type}:{subject_id}"
                    ),
                )
            else:
                allowed = pair.item.permissionship == CheckPermissionResponse.PERMISSIONSHIP_HAS_PERMISSION
            results[(object_type, object_id, permission)] = allowed

        return results

    async def bulk_write_relationships(
        self,
        *,
        items: list[RelationshipItem],
        chunk_size: int | None = None,
    ) -> None:
        """Performs multiple write relationship operation in one request.

        Args:
            items: List of Relationship inserts to perform.
            chunk_size: Number of items to read at a time.
        """
        if not chunk_size:
            chunk_size = auth_settings().spice_db_bulk_chunk_size

        if not items:
            return

        for chunk in chunked(items=items, size=chunk_size):
            await self._bulk_operation_chunked(
                items=chunk,
                operation=RelationshipUpdate.Operation.OPERATION_TOUCH,
            )

    async def bulk_delete_relationships(
        self,
        *,
        items: list[RelationshipItem],
        chunk_size: int | None = None,
    ) -> None:
        """Performs multiple delete relationship operation in one request.

        Args:
            items: List of Relationship deletes to perform.
            chunk_size: Number of items to read at a time.
        """
        if not chunk_size:
            chunk_size = auth_settings().spice_db_bulk_chunk_size

        if not items:
            return

        for chunk in chunked(items=items, size=chunk_size):
            await self._bulk_operation_chunked(
                items=chunk,
                operation=RelationshipUpdate.Operation.OPERATION_DELETE,
            )

    async def bulk_update_relationships(
        self,
        *,
        touch_items: list[RelationshipItem],
        delete_items: list[RelationshipItem],
        chunk_size: int | None = None,
    ) -> None:
        """Apply mixed TOUCH and DELETE relationship updates in bulk."""
        if not touch_items and not delete_items:
            return

        if not chunk_size:
            chunk_size = auth_settings().spice_db_bulk_chunk_size

        updates: list[RelationshipUpdate] = []

        for item in delete_items:
            updates.append(
                self._create_write_request(
                    resource_type=item.resource_type,
                    resource_id=item.resource_id,
                    relation=item.relation,
                    subject_type=item.subject_type,
                    subject_id=item.subject_id,
                    operation=RelationshipUpdate.Operation.OPERATION_DELETE,
                    subject_relation=item.subject_relation,
                )
            )

        for item in touch_items:
            updates.append(
                self._create_write_request(
                    resource_type=item.resource_type,
                    resource_id=item.resource_id,
                    relation=item.relation,
                    subject_type=item.subject_type,
                    subject_id=item.subject_id,
                    operation=RelationshipUpdate.Operation.OPERATION_TOUCH,
                    subject_relation=item.subject_relation,
                )
            )

        for chunk in chunked(items=updates, size=chunk_size):
            request = WriteRelationshipsRequest(updates=chunk)
            try:
                await self.client.WriteRelationships(request)
            except RpcError as e:
                self._log_error(error=e)
                raise

    async def delete_relations(
        self,
        resource_type: str,
        relation: str | None = None,
    ) -> None:
        """Deletes all relationships for a given resource_type.

        Args:
            resource_type: Resource type to filter on.
            relation: Resource type to filter on.
        """
        try:
            await self.client.DeleteRelationships(
                DeleteRelationshipsRequest(
                    relationship_filter=RelationshipFilter(
                        resource_type=resource_type,
                        optional_relation=relation or "",
                    )
                )
            )
        except RpcError as e:
            self._log_error(error=e)
            raise

    async def list_resource_relations_bulk(
        self,
        *,
        resource_type: Resource,
        resource_ids: list[str],
        relations: list[Relation],
        subject_type: Subject | None = Subject.USER,
    ) -> BulkRelationsResult:
        """
        Fetch multiple relations for multiple resources in bulk from SpiceDB.

        Args:
            resource_type: The SpiceDB resource type (e.g. project, group).
            resource_ids: List of resource IDs to fetch relations for.
            relations: List of relations to retrieve (e.g. owner, member).
            subject_type: Optional filter for subject object type.
                Defaults to USER. If None, all subject types are included.

        Returns:
            A nested dictionary of the form:

            {
                "<resource_id>": {
                    "<relation>": ["<subject_id>", ...]
                }
            }

            Example:
            {
                "project_1": {
                    "owner": ["user_1"],
                    "member": ["user_2", "user_3"]
                }
            }
        """

        if not resource_ids or not relations:
            return {}

        resource_set = set(resource_ids)

        relation_keys = [r.value if hasattr(r, "value") else str(r) for r in relations]

        result: dict[str, dict[str, set[str]]] = {rid: {rk: set() for rk in relation_keys} for rid in resource_ids}

        try:
            for relation in relations:
                relation_key = relation.value if hasattr(relation, "value") else str(relation)

                request = ReadRelationshipsRequest(
                    consistency=self.consistency,
                    relationship_filter=RelationshipFilter(
                        resource_type=resource_type,
                        optional_relation=relation_key,
                    ),
                )

                async for resp in self.client.ReadRelationships(request):
                    rel = resp.relationship

                    resource_id = rel.resource.object_id

                    if resource_id not in resource_set:
                        continue

                    if subject_type and rel.subject.object.object_type != subject_type:
                        continue

                    result[resource_id][rel.relation].add(rel.subject.object.object_id)

        except RpcError as e:
            self._log_error(error=e)
            raise

        return {
            rid: {relation: list(subjects) for relation, subjects in relations_map.items()}
            for rid, relations_map in result.items()
        }

    async def write_schema(self, schema: str) -> None:
        """Performs write schema operation."""
        await self.client.WriteSchema(WriteSchemaRequest(schema=schema))

    async def read_schema(self) -> ReadSchemaResponse:
        """Performs read schema operation in one request."""
        return await self.client.ReadSchema(ReadSchemaRequest())

    async def write_schema_file(self, path: str) -> None:
        """Performs write schema operation from a file."""
        with open(path, encoding="utf-8") as f:
            await self.write_schema(schema=f.read())

    async def delete_schema(self) -> None:
        """
        Fully wipe SpiceDB for tests using current schema.
        """
        schema = await self.read_schema()

        def _parse_definitions(schema: str) -> list[str]:
            return re.findall(r"definition\s+([A-Za-z_][A-Za-z0-9_]*)", schema)

        definitions = _parse_definitions(schema=schema.schema_text)

        # delete tuples for every object type except user
        for object_type in definitions:
            await self.delete_relations(resource_type=object_type)

        await self.write_schema(schema="")
