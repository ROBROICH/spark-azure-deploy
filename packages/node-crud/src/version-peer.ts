import type { Result } from "better-result";
import type { EvlogError } from "evlog";

export interface VersionLockValidation {
  readonly projectId: string;
  readonly sourceVersion: number;
  readonly targetVersion: number;
  readonly lockToken: string;
  readonly zipFileId?: string;
}

export interface ProjectVersionPeer {
  resolveLatestVersion(projectId: string): Promise<Result<number, EvlogError>>;
  validateWriteVersion(
    projectId: string,
    projectVersion: number,
  ): Promise<Result<void, EvlogError>>;
  validateVersionLock(validation: VersionLockValidation): Promise<Result<void, EvlogError>>;
}

export interface ProjectVersionWrite {
  readonly postgres: Readonly<{ transact<T>(work: () => Promise<T>): Promise<T> }>;
  readonly projects: Pick<ProjectVersionPeer, "validateWriteVersion">;
  readonly projectId: string;
  readonly projectVersion: number;
}

export function transactVersionWrite<T>(
  { postgres, projects, projectId, projectVersion }: ProjectVersionWrite,
  work: () => Promise<T>,
): Promise<T> {
  return postgres.transact(async () => {
    const admission = await projects.validateWriteVersion(projectId, projectVersion);
    if (admission.isErr()) throw admission.error;
    return work();
  });
}
