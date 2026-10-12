import type { ProjectsService } from "@spark-workflow/core/projects/resource";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const SubtopicNodesSchema = Type.Array(
  Type.Object({ id: Type.String(), name: Type.String(), topicId: Type.String() }),
);

export interface TopicReference {
  readonly kind: "topic" | "subtopic";
  readonly name: string;
  readonly parentTopicId: string | null;
}

export type TopicProjectData = Pick<ProjectsService, "listTopics" | "batchNodes">;

export async function loadTopics(
  projects: TopicProjectData,
  projectId: string,
  projectVersion: number,
): Promise<Map<string, TopicReference>> {
  const listed = await projects.listTopics(projectId, projectVersion);
  if (listed.isErr()) throw listed.error;
  return new Map(
    listed.value.map((topic) => [
      topic.id,
      { kind: "topic", name: topic.name, parentTopicId: topic.parentTopicId },
    ]),
  );
}

export async function addSubtopics(
  projects: TopicProjectData,
  projectId: string,
  projectVersion: number,
  references: Map<string, TopicReference>,
  subtopicIds: Iterable<string | null>,
): Promise<void> {
  const unresolved = [...new Set(subtopicIds)].flatMap((id) =>
    id === null || references.has(id) ? [] : [{ nodeType: "subtopic", id }],
  );
  if (unresolved.length === 0) return;
  const nodes = await projects.batchNodes(projectId, projectVersion, unresolved);
  if (nodes.isErr()) throw nodes.error;
  for (const subtopic of Value.Parse(SubtopicNodesSchema, nodes.value)) {
    if (references.get(subtopic.topicId)?.kind !== "topic") continue;
    references.set(subtopic.id, {
      kind: "subtopic",
      name: subtopic.name,
      parentTopicId: subtopic.topicId,
    });
  }
}
