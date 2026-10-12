import { bindNodeRuntime, createNodeVersionService, type NodeRuntime } from "@spark-workflow/node-crud";
import type { PostgreSQLService } from "@spark-workflow/postgres-runtime";
import { PostgreSQL } from "@spark-workflow/postgres-runtime/postgresql";
import { defineResource, provide } from "@spark-workflow/resource";
import { Value } from "@sinclair/typebox/value";

import { projectLogicSchema } from "../../projects/src/db/schema.ts";
import { ProjectVersions } from "../../projects/src/project-versions.ts";
import { documentManagementSchema } from "./db/schema.ts";
import type { DmsScope } from "./db.ts";
import type { DocumentConfiguration as DocumentConfigurationValue } from "./env.ts";
import { FileService } from "./files/file-service.ts";
import { DocumentMutationService } from "./mutations/document-mutation-service.ts";
import {
  createDocumentManagementDescriptor,
  FileTopicParentsSchema,
  validateFileTopicParents,
} from "./node/descriptor.ts";
import { ClamAvClient } from "./scanner/clamav-client.ts";
import { ScanAndPromoteService } from "./scanner/scan-and-promote.ts";
import { S3Storage } from "./storage/s3-storage.ts";
import {
  DocumentCommandConfiguration,
  DocumentConfiguration,
  DocumentTemporalCommands,
} from "./resource.ts";
import { DocumentTemporalCommandsService } from "./temporal/commands.ts";

export const documentNodeDescriptor = createDocumentManagementDescriptor();

interface DocumentStorage {
  readonly clean: S3Storage;
  readonly quarantine: S3Storage;
}

const createDocumentStorage = (configuration: DocumentConfigurationValue): DocumentStorage => {
  const clean = new S3Storage(configuration.cleanStorage);
  const quarantine =
    configuration.quarantineStorage === null
      ? clean
      : new S3Storage(configuration.quarantineStorage);
  return { clean, quarantine };
};

export class DocumentRuntime {
  readonly configuration: DocumentConfigurationValue;
  readonly scope: DmsScope;
  readonly projectVersions: ProjectVersions;
  readonly node: NodeRuntime<typeof documentManagementSchema>;
  readonly versioning: ReturnType<typeof createNodeVersionService>;
  readonly cleanStorage: S3Storage;
  readonly quarantineStorage: S3Storage;
  readonly scanner: ClamAvClient;
  readonly files: FileService;
  readonly mutations: DocumentMutationService;
  readonly scanAndPromote: ScanAndPromoteService;
  private closePromise: Promise<void> | undefined;

  constructor(
    postgres: PostgreSQLService,
    configuration: DocumentConfigurationValue,
    commands: DocumentTemporalCommandsService,
  ) {
    this.configuration = configuration;
    this.scope = postgres.scope(documentManagementSchema);
    this.projectVersions = new ProjectVersions(postgres.scope(projectLogicSchema));
    const storage = createDocumentStorage(configuration);
    this.cleanStorage = storage.clean;
    this.quarantineStorage = storage.quarantine;
    this.scanner = new ClamAvClient({
      enabled: configuration.scanner.enabled,
      baseUrl: configuration.scanner.baseUrl,
    });
    this.node = bindNodeRuntime(documentNodeDescriptor, {
      persistence: this.scope,
      versionPeer: this.projectVersions,
      prepareMutation: async (projectId, projectVersion, mutation) =>
        (
          await this.scope.query((database) =>
            validateFileTopicParents(
              database,
              projectId,
              [projectVersion],
              [...mutation.inserts, ...mutation.updates]
                .filter(({ nodeType }) => nodeType === "file_topic")
                .map(({ payload }) => Value.Parse(FileTopicParentsSchema, payload)),
            ),
          )
        ).map(() => mutation),
      validateCopy: ({ projectId, sourceVersion, targetVersion, dryRun, nodes }) =>
        this.scope.query((database) =>
          validateFileTopicParents(
            database,
            projectId,
            dryRun ? [sourceVersion, targetVersion] : [targetVersion],
            nodes
              .filter(({ nodeType }) => nodeType === "file_topic")
              .flatMap(({ rows }) => rows.map((row) => Value.Parse(FileTopicParentsSchema, row))),
          ),
        ),
    });
    this.versioning = createNodeVersionService(this.node);
    const files = new FileService(
      this.scope,
      this.projectVersions,
      this.cleanStorage,
      this.quarantineStorage,
      configuration.scanner.enabled,
      configuration.maxObjectBytes,
    );
    this.files = files;
    this.mutations = new DocumentMutationService(
      this.scope,
      this.projectVersions,
      files,
      this.cleanStorage,
      commands,
    );
    this.scanAndPromote = new ScanAndPromoteService(
      this.scope,
      files,
      this.cleanStorage,
      this.quarantineStorage,
      this.scanner,
    );
  }

  close(): Promise<void> {
    return (this.closePromise ??= (async () => {
      const resources = [this.cleanStorage, this.quarantineStorage];
      const unique = [...new Set(resources)];
      const results = await Promise.allSettled(unique.map((storage) => storage.close()));
      const errors = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      if (errors.length > 0) throw new AggregateError(errors, "Failed to close DMS resources");
    })());
  }
}

export const DocumentRuntimeResource = defineResource<DocumentRuntime>()("core/DocumentRuntime");

export const documentTemporalCommandsProvider = provide({
  resource: DocumentTemporalCommands,
  needs: { configuration: DocumentCommandConfiguration },
  make: ({ configuration }) => new DocumentTemporalCommandsService(configuration),
  release: (commands) => commands.close(),
});

export const documentRuntimeProvider = provide({
  resource: DocumentRuntimeResource,
  needs: {
    postgres: PostgreSQL,
    configuration: DocumentConfiguration,
    commands: DocumentTemporalCommands,
  },
  make: ({ postgres, configuration, commands }) =>
    new DocumentRuntime(postgres, configuration, commands),
  release: (runtime) => runtime.close(),
});

export const DocumentNodes = defineResource<NodeRuntime<typeof documentManagementSchema>>()(
  "core/DocumentNodes",
);

export const documentNodesProvider = provide({
  resource: DocumentNodes,
  needs: { documentRuntime: DocumentRuntimeResource },
  make: ({ documentRuntime }) => documentRuntime.node,
});
