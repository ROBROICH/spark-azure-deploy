import { Result } from "better-result";
import type { EvlogError } from "evlog";
import { Value } from "@sinclair/typebox/value";

import { usecaseErrors } from "./errors.ts";
import {
  BeschlussDocument,
  DokumenteDocument,
  GesetzesgrundlageDocument,
  ProjekttypDocument,
  type Usecase,
} from "./formats.ts";

export const REQUIRED_FILES = [
  "projekttyp.yaml",
  "gesetzesgrundlage.yaml",
  "dokumente.yaml",
  "beschluss.yaml",
];

const invalid = (message: string) => Result.err(usecaseErrors.INVALID_CATALOG({ message }));

const collectTopicNames = (
  gesetzesgrundlage: GesetzesgrundlageDocument,
): Result<Set<string>, EvlogError> => {
  const names = new Set<string>();
  for (const topic of gesetzesgrundlage.topics) {
    if (names.has(topic.name)) return invalid(`duplicate topic name '${topic.name}'`);
    names.add(topic.name);
    const subNames = new Set<string>();
    for (const subtopic of topic.subtopics) {
      if (subNames.has(subtopic.name)) {
        return invalid(`duplicate subtopic name '${subtopic.name}' under '${topic.name}'`);
      }
      subNames.add(subtopic.name);
    }
  }
  return Result.ok(names);
};

const collectDeclaredIds = (usecase: Usecase): string[] => [
  usecase.projekttyp.id,
  ...usecase.dokumente.categories.flatMap((category) => [
    category.id,
    ...category.document_types.map((documentType) => documentType.id),
  ]),
  ...usecase.beschluss.nodes.map((node) => node.id),
];

export const validateUsecase = (usecase: Usecase) =>
  Result.gen(function* () {
    if (!Value.Check(ProjekttypDocument, usecase.projekttyp)) {
      return invalid(`invalid projekttyp in '${usecase.slug}'`);
    }
    if (!Value.Check(GesetzesgrundlageDocument, usecase.gesetzesgrundlage)) {
      return invalid(`invalid gesetzesgrundlage in '${usecase.slug}'`);
    }
    if (!Value.Check(DokumenteDocument, usecase.dokumente)) {
      return invalid(`invalid dokumente in '${usecase.slug}'`);
    }
    if (!Value.Check(BeschlussDocument, usecase.beschluss)) {
      return invalid(`invalid beschluss in '${usecase.slug}'`);
    }

    const categoryNames = new Set<string>();
    for (const category of usecase.dokumente.categories) {
      if (categoryNames.has(category.category)) {
        return invalid(`duplicate document category '${category.category}'`);
      }
      categoryNames.add(category.category);
      const typeNames = new Set<string>();
      for (const documentType of category.document_types) {
        if (typeNames.has(documentType.name)) {
          return invalid(
            `duplicate document type '${documentType.name}' under '${category.category}'`,
          );
        }
        typeNames.add(documentType.name);
      }
    }

    const topicNames = yield* collectTopicNames(usecase.gesetzesgrundlage);
    const nodeIds = new Set<string>();
    for (const node of usecase.beschluss.nodes) {
      if (nodeIds.has(node.id)) return invalid(`duplicate beschluss node id '${node.id}'`);
      nodeIds.add(node.id);
      if (node.topic !== null && !topicNames.has(node.topic)) {
        return invalid(`beschluss node '${node.id}' references unknown topic '${node.topic}'`);
      }
    }
    const orders = new Set<number>();
    for (const node of usecase.beschluss.nodes) {
      if (node.parent_vae_node_id !== null && !nodeIds.has(node.parent_vae_node_id)) {
        return invalid(
          `beschluss node '${node.id}' references missing parent '${node.parent_vae_node_id}'`,
        );
      }
      if (orders.has(node.order)) {
        return invalid(`duplicate beschluss node order '${node.order}'`);
      }
      orders.add(node.order);
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const nodesById = new Map(usecase.beschluss.nodes.map((node) => [node.id, node]));
    const visit = (id: string): Result<undefined, EvlogError> => {
      if (visited.has(id)) return Result.ok(undefined);
      if (visiting.has(id)) return invalid(`beschluss graph contains a cycle at '${id}'`);
      visiting.add(id);
      const parent = nodesById.get(id)?.parent_vae_node_id;
      if (parent !== null && parent !== undefined) {
        const walked = visit(parent);
        if (walked.status === "error") return walked;
      }
      visiting.delete(id);
      visited.add(id);
      return Result.ok(undefined);
    };
    for (const node of usecase.beschluss.nodes) {
      const walked = visit(node.id);
      if (walked.status === "error") return walked;
    }

    const seen = new Set<string>();
    for (const id of collectDeclaredIds(usecase)) {
      if (seen.has(id)) return invalid(`duplicate id '${id}'`);
      seen.add(id);
    }
    return Result.ok(undefined);
  });

export const validateCatalog = (usecases: readonly Usecase[]) =>
  Result.gen(function* () {
    const seenAuthorities = new Set<string>();
    const seenNames = new Set<string>();
    const seenIds = new Set<string>();
    for (const usecase of usecases) {
      yield* validateUsecase(usecase);
      const authority = usecase.projekttyp.id;
      if (seenAuthorities.has(authority)) {
        return invalid(`duplicate authority id '${usecase.projekttyp.id}'`);
      }
      seenAuthorities.add(authority);
      if (seenNames.has(usecase.projekttyp.name)) {
        return invalid(`duplicate projekttyp name '${usecase.projekttyp.name}'`);
      }
      seenNames.add(usecase.projekttyp.name);
      for (const id of collectDeclaredIds(usecase)) {
        if (seenIds.has(id)) return invalid(`duplicate id '${id}' across usecases`);
        seenIds.add(id);
      }
    }
    return Result.ok(undefined);
  });
