import { describe, expect, test } from "bun:test";

import { SERVICE_ORDER, type ServiceName } from "../../src/temporal/contracts.ts";
import {
  runCreateProjectVersionWorkflow,
  runDeleteProjectWorkflow,
  runProjectInitializationWorkflow,
  type ProjectLogicWorkflowRuntime,
} from "../../src/temporal/workflow-logic.ts";

const PROJECT_ID = "72000000-0000-4000-8000-000000000001";
const PROJECT_TYPE_ID = "72000000-0000-4000-8000-000000000002";
const FILE_ID = "72000000-0000-4000-8000-000000000003";
const DELETED_SOURCE_FILE_ID = "72000000-0000-4000-8000-000000000004";

class Cancellation extends Error {}

const rejection = async (operation: () => Promise<unknown>): Promise<Error> => {
  try {
    await operation();
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  throw new Error("Expected operation to reject");
};

interface WorkflowState {
  initialized: boolean;
  templateAssigned: boolean;
  projectDeleted: boolean;
  status: string | null;
  lockHeld: boolean;
  lockReleaseError: string | null | undefined;
  committedServices: Set<ServiceName>;
  undoneServices: Set<ServiceName>;
  rootCommitted: boolean;
  rootUndone: boolean;
  rootCopyLockToken: string | undefined;
  rootUndoLockToken: string | undefined;
  dmsCommitted: boolean;
  approval: { status: string; error: string | null } | undefined;
  fvpVersion: number | undefined;
}

interface WorkflowScenario {
  runtime: ProjectLogicWorkflowRuntime;
  state: WorkflowState;
}

function workflowRuntime(): WorkflowScenario {
  const state: WorkflowState = {
    initialized: false,
    templateAssigned: false,
    projectDeleted: false,
    status: null,
    lockHeld: false,
    lockReleaseError: undefined,
    committedServices: new Set(),
    undoneServices: new Set(),
    rootCommitted: false,
    rootUndone: false,
    rootCopyLockToken: undefined,
    rootUndoLockToken: undefined,
    dmsCommitted: false,
    approval: undefined,
    fvpVersion: undefined,
  };
  const runtime: ProjectLogicWorkflowRuntime = {
    initializeFcs: async () => {
      state.initialized = true;
    },
    assignTemplate: async () => {
      state.templateAssigned = true;
    },
    updateStatus: async (_project, status) => {
      state.status = status;
    },
    deleteProject: async () => {
      state.projectDeleted = true;
    },
    latestVersion: async () => 1,
    internalStatus: async () => state.status ?? "OPEN",
    acquireLock: async () => {
      state.lockHeld = true;
      return "lock-4348";
    },
    prepareRollback: async () => "rollback-4348",
    releaseLock: async (_project, _lock, error) => {
      state.lockHeld = false;
      state.lockReleaseError = error ?? null;
    },
    cancelProjectWorkflows: async () => undefined,
    dmsDiff: async () => ({ deleted: [], changed: [], renamed: [] }),
    buildCopyPlan: async () => ({
      survivorsPerService: {},
      deletedFileIds: [],
      deletedKeysCount: 0,
    }),
    copyService: async (service, _project, _source, _target, _lock, _nodes, dry) => {
      if (!dry) state.committedServices.add(service);
    },
    undoService: async (service) => {
      state.undoneServices.add(service);
    },
    updateDmsApproval: async (_project, _file, status, error) => {
      state.approval = { status, error: error ?? null };
    },
    commitDmsDiff: async (_project, _file, _source, _target, _lock, dry) => {
      if (!dry) state.dmsCommitted = true;
    },
    copyRoot: async (_project, _source, _target, lockToken, dry) => {
      state.rootCopyLockToken = lockToken;
      if (!dry) state.rootCommitted = true;
    },
    undoRoot: async (_project, _target, lockToken) => {
      state.rootUndoLockToken = lockToken;
      state.rootCommitted = false;
      state.rootUndone = true;
    },
    cleanupQdrant: async () => ({}),
    compensateQdrant: async () => ({}),
    startFvp: async (_project, version) => {
      state.fvpVersion = version;
    },
    info: () => ({ workflowId: "create-version", runId: "run-4348", parentWorkflowId: "parent" }),
    projectContext: () => ({ projectId: PROJECT_ID, projectVersion: 1 }),
    isCancellation: (error) => error instanceof Cancellation,
    patched: () => true,
  };
  return { runtime, state };
}

describe("Project Logic TypeScript workflow behavior", () => {
  test("initialization and deletion produce their intended project state", async () => {
    const { runtime, state } = workflowRuntime();
    expect(
      await runProjectInitializationWorkflow(
        { projectId: PROJECT_ID, projectTypeId: PROJECT_TYPE_ID, projectVersion: 1 },
        runtime,
      ),
    ).toMatchObject({ status: "COMPLETED" });
    await runDeleteProjectWorkflow(
      { projectId: PROJECT_ID, projectVersion: 1, workflowActor: null },
      runtime,
    );
    expect(state.initialized).toBeTrue();
    expect(state.templateAssigned).toBeTrue();
    expect(state.status).toBe("UPLOAD_DOCUMENTS");
    expect(state.projectDeleted).toBeTrue();
  });

  test("normal version creation commits each stable service ID, releases its lock, and starts FVP", async () => {
    const { runtime, state } = workflowRuntime();
    const result = await runCreateProjectVersionWorkflow(
      { projectId: PROJECT_ID, fileDiff: { deleted: [], changed: [], renamed: [] } },
      runtime,
    );
    expect(result).toMatchObject({ status: "COMPLETED", newVersion: 2, idMappings: null });
    expect(state.rootCommitted).toBeTrue();
    expect(state.rootCopyLockToken).toBe("lock-4348");
    expect(state.committedServices).toEqual(
      new Set(SERVICE_ORDER.filter((service) => service !== "documentManagementService")),
    );
    expect(state.lockHeld).toBeFalse();
    expect(state.lockReleaseError).toBeNull();
    expect(state.fvpVersion).toBe(2);
  });

  test("ordinary failure compensates committed state and releases the lock without disclosing the failure", async () => {
    const { runtime, state } = workflowRuntime();
    let commits = 0;
    const failure = new Error("second capability failed");
    runtime.copyService = async (service, _project, _source, _target, _lock, _nodes, dry) => {
      if (dry) return;
      if (++commits === 2) throw failure;
      state.committedServices.add(service);
    };
    expect(
      await rejection(() => runCreateProjectVersionWorkflow({ projectId: PROJECT_ID }, runtime)),
    ).toBe(failure);
    for (const service of state.committedServices) {
      expect(state.undoneServices.has(service)).toBeTrue();
    }
    expect(state.rootCommitted).toBeFalse();
    expect(state.rootUndone).toBeTrue();
    expect(state.rootUndoLockToken).toBe("rollback-4348");
    expect(state.lockHeld).toBeFalse();
    expect(state.lockReleaseError).toBeString();
    expect(state.lockReleaseError).not.toContain(failure.message);
  });

  test("a failing Qdrant compensation still rolls back the version, fails the approval, and releases the lock", async () => {
    const { runtime, state } = workflowRuntime();
    const cleanupFailure = new Error("Qdrant source-file cleanup failed");
    runtime.buildCopyPlan = async () => ({
      survivorsPerService: {},
      deletedFileIds: [DELETED_SOURCE_FILE_ID],
      deletedKeysCount: 1,
    });
    runtime.cleanupQdrant = async () => {
      throw cleanupFailure;
    };
    runtime.compensateQdrant = async () => {
      throw new Error("Qdrant source-file cleanup compensation failed");
    };

    const error = await rejection(() =>
      runCreateProjectVersionWorkflow({ projectId: PROJECT_ID, zipFileId: FILE_ID }, runtime),
    );

    expect(state.undoneServices).toEqual(new Set(SERVICE_ORDER));
    expect(state.rootUndone).toBeTrue();
    expect(state.approval?.status).toBe("FAILED_APPROVE");
    expect(state.approval?.error).toBeString();
    expect(state.approval?.error).not.toContain(cleanupFailure.message);
    expect(state.lockHeld).toBeFalse();
    expect(state.lockReleaseError).toBeString();
    expect(state.lockReleaseError).not.toContain(cleanupFailure.message);
    expect(state.fvpVersion).toBeUndefined();
    expect(error).toBe(cleanupFailure);
  });

  test("cancellation returns CANCELED after compensation", async () => {
    const { runtime, state } = workflowRuntime();
    let commits = 0;
    runtime.copyService = async (service, _project, _source, _target, _lock, _nodes, dry) => {
      if (dry) return;
      if (++commits === 2) throw new Cancellation("cancelled");
      state.committedServices.add(service);
    };
    expect(await runCreateProjectVersionWorkflow({ projectId: PROJECT_ID }, runtime)).toMatchObject(
      {
        status: "CANCELED",
      },
    );
    for (const service of state.committedServices) {
      expect(state.undoneServices.has(service)).toBeTrue();
    }
    expect(state.rootUndone).toBeTrue();
    expect(state.lockHeld).toBeFalse();
    expect(state.lockReleaseError).toBeString();
  });

  test("releases a known reservation when both approval status updates fail", async () => {
    const { runtime, state } = workflowRuntime();
    const original = new Error("approval update unavailable");
    runtime.updateDmsApproval = async (_project, _file, status) => {
      throw status === "APPROVING" ? original : new Error("failure reporting unavailable");
    };
    expect(
      await rejection(() =>
        runCreateProjectVersionWorkflow({ projectId: PROJECT_ID, zipFileId: FILE_ID }, runtime),
      ),
    ).toBe(original);
    expect(state.lockHeld).toBeFalse();
    expect(state.rootUndone).toBeFalse();
  });

  test("keeps the reservation when database compensation has not completed", async () => {
    const { runtime, state } = workflowRuntime();
    runtime.copyService = async (_service, _project, _source, _target, _lock, _nodes, dry) => {
      if (!dry) throw new Error("copy failed");
    };
    runtime.undoRoot = async () => {
      throw new Error("rollback unavailable");
    };
    await expect(
      runCreateProjectVersionWorkflow({ projectId: PROJECT_ID }, runtime),
    ).rejects.toThrow("rollback unavailable");
    expect(state.lockHeld).toBeTrue();
  });

  test("an interrupted copy is undone with the fenced rollback token", async () => {
    const { runtime, state } = workflowRuntime();
    const undoTokens: string[] = [];
    runtime.copyService = async (_service, _project, _source, _target, _lock, _nodes, dry) => {
      if (!dry) throw new Error("copy reply lost");
    };
    runtime.undoService = async (service, _project, _target, lockToken) => {
      state.undoneServices.add(service);
      undoTokens.push(lockToken);
    };
    await rejection(() => runCreateProjectVersionWorkflow({ projectId: PROJECT_ID }, runtime));
    expect([...state.undoneServices]).toEqual(["projectLogicService"]);
    expect(undoTokens).toEqual(["rollback-4348"]);
    expect(state.rootUndoLockToken).toBe("rollback-4348");
    expect(state.lockHeld).toBeFalse();
  });

  test("first-upload ZIP keeps its narrow compensation", async () => {
    const { runtime, state } = workflowRuntime();
    const failure = new Error("status transition failed after DMS commit");
    state.status = "UPLOAD_DOCUMENTS";
    runtime.updateStatus = async (_project, status) => {
      state.status = status;
      throw failure;
    };
    expect(
      await rejection(() =>
        runCreateProjectVersionWorkflow({ projectId: PROJECT_ID, zipFileId: FILE_ID }, runtime),
      ),
    ).toBe(failure);
    expect(state.dmsCommitted).toBeTrue();
    expect(state.undoneServices.has("documentManagementService")).toBeFalse();
    expect(state.approval?.status).toBe("FAILED_APPROVE");
    expect(state.approval?.error).toBeString();
    expect(state.approval?.error).not.toContain(failure.message);
    expect(state.lockReleaseError).toBeNull();
  });

  test("does not compensate a committed version when the FVP start fails", async () => {
    const { runtime, state } = workflowRuntime();
    const failure = new Error("FVP start failed");
    runtime.startFvp = async (_project, version) => {
      state.fvpVersion = version;
      throw failure;
    };
    expect(
      await rejection(() => runCreateProjectVersionWorkflow({ projectId: PROJECT_ID }, runtime)),
    ).toBe(failure);
    expect(state.rootCommitted).toBeTrue();
    expect(state.undoneServices.size).toBe(0);
    expect(state.rootUndone).toBeFalse();
    expect(state.lockReleaseError).toBeNull();
  });
});
