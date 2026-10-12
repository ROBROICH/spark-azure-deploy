import { defineResource } from "@spark-workflow/resource";

import type { IdentityEnvironment } from "./env.ts";
import type { KeycloakAdminClient } from "./providers/keycloak.ts";
import type { SpiceDbClient } from "./providers/spicedb.ts";

export interface IdentityService {
  readonly users: Pick<KeycloakAdminClient, "listAllUsers" | "listUsers">;
  readonly roles: Pick<KeycloakAdminClient, "replaceManagedRoles"> | undefined;
  readonly assignments: Pick<
    SpiceDbClient,
    "listProjectRelations" | "updateProjectRelations"
  >;
  upgrade(): Promise<void>;
}

export const Identity = defineResource<IdentityService>()("identity-management/Identity");
export const IdentityConfiguration = defineResource<IdentityEnvironment>()(
  "identity-management/Configuration",
);
