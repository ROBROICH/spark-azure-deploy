import type { ExaminationNode } from "@spark-workflow/examination-service";
import type { ProcessedFileInfo } from "../schemas.ts";
import type { ChunkMetadata } from "@spark-temporal/contracts";

type MarkdownTextNode = ExaminationNode<"markdownText">;
type SubChunkRelationNode = ExaminationNode<"subChunkRelation">;
type SubChunkNode = ExaminationNode<"subChunk">;
type ChunkNode = ExaminationNode<"chunk">;
type DocumentNode = ExaminationNode<"dokument">;
type ExtractionNode = ExaminationNode<
  | "markdownText"
  | "subChunkRelation"
  | "subChunk"
  | "chunk"
  | "dokument"
  | "subChunkText"
  | "subChunkTable"
  | "subChunkImage"
>;
interface TypedSubChunkNode {
  subChunkId: string;
  assetPath?: string | null;
  caption?: string | null;
  summary?: string | null;
  description?: string | null;
  content?: string | null;
  footnote?: string | null;
}

function groupNodes(nodes: readonly ExtractionNode[]) {
  const markdown_text: MarkdownTextNode[] = [];
  const typed_sub_chunk: TypedSubChunkNode[] = [];
  const sub_chunk_relation: SubChunkRelationNode[] = [];
  const sub_chunk: SubChunkNode[] = [];
  const chunk: ChunkNode[] = [];
  const dokument: DocumentNode[] = [];
  for (const node of nodes) {
    if (
      node.nodeType === "sub_chunk_text" ||
      node.nodeType === "sub_chunk_table" ||
      node.nodeType === "sub_chunk_image"
    ) {
      typed_sub_chunk.push(node);
      continue;
    }
    if (node.nodeType === "markdown_text") {
      markdown_text.push(node);
      continue;
    }
    if (node.nodeType === "sub_chunk_relation") {
      sub_chunk_relation.push(node);
      continue;
    }
    if (node.nodeType === "sub_chunk") {
      sub_chunk.push(node);
      continue;
    }
    if (node.nodeType === "chunk") {
      chunk.push(node);
      continue;
    }
    if (node.nodeType === "dokument") {
      dokument.push(node);
    }
  }
  return {
    markdown_text,
    typed_sub_chunk,
    sub_chunk_relation,
    sub_chunk,
    chunk,
    dokument,
  };
}

function relatedMetadata(subChunkId: string, relations: readonly SubChunkRelationNode[]) {
  const relatedAssets: NonNullable<ChunkMetadata["related_assets"]> = [];
  const relatedText: NonNullable<ChunkMetadata["related_text"]> = [];
  for (const relation of relations) {
    const otherId =
      relation.fromSubChunkId === subChunkId ? relation.toSubChunkId : relation.fromSubChunkId;
    const relationType = relation.relationType ?? "text";
    const target =
      relationType === "table" || relationType === "image" ? relatedAssets : relatedText;
    target.push({ chunk_id: otherId, type: relationType });
  }
  if (relatedAssets.length > 0 && relatedText.length > 0) {
    return { related_assets: relatedAssets, related_text: relatedText };
  }
  if (relatedAssets.length > 0) return { related_assets: relatedAssets };
  if (relatedText.length > 0) return { related_text: relatedText };
  return {};
}

function subChunkMetadata(
  subChunk: SubChunkNode,
  typed: TypedSubChunkNode | undefined,
  relations: readonly SubChunkRelationNode[],
) {
  const metadata: ChunkMetadata = {
    chunk_type: subChunk.chunkType ?? "text",
    page_numbers: subChunk.pageNumbers ?? [],
    focus_topic: subChunk.focusTopic ?? "",
    hypothetical_questions: subChunk.hypotheticalQuestions ?? [],
    wildlife_species: subChunk.wildlifeSpecies ?? [],
    plant_species: subChunk.plantSpecies ?? [],
    ...relatedMetadata(subChunk.id, relations),
  };
  for (const [stored, restored] of [
    ["header1", "Header 1"],
    ["header2", "Header 2"],
    ["header3", "Header 3"],
  ] satisfies [keyof SubChunkNode, keyof ChunkMetadata][]) {
    if (subChunk[stored] !== null && subChunk[stored] !== undefined) {
      metadata[restored] = subChunk[stored];
    }
  }
  if (subChunk.wildlifeMentioned !== null && subChunk.wildlifeMentioned !== undefined) {
    metadata.wildlife_mentioned = subChunk.wildlifeMentioned;
  }
  if (subChunk.plantSpeciesMentioned !== null && subChunk.plantSpeciesMentioned !== undefined) {
    metadata.plant_species_mentioned = subChunk.plantSpeciesMentioned;
  }
  if (subChunk.mapScale !== null && subChunk.mapScale !== undefined) {
    metadata.map_scale = subChunk.mapScale;
  }
  if (typed !== undefined) {
    for (const [stored, restored] of [
      ["assetPath", "asset_path"],
      ["caption", "caption"],
      ["summary", "summary"],
      ["description", "description"],
      ["content", "content"],
      ["footnote", "footnote"],
    ] satisfies [keyof TypedSubChunkNode, keyof ChunkMetadata][]) {
      if (typed[stored]) metadata[restored] = typed[stored];
    }
  }
  return metadata;
}

export function reconstructProcessedFiles(
  allNodes: readonly ExtractionNode[],
  projectId: string,
): ProcessedFileInfo[] {
  const groups = groupNodes(allNodes);
  const markdown = new Map(groups.markdown_text.map((node) => [node.id, node.text]));
  const typedBySubChunk = new Map(groups.typed_sub_chunk.map((node) => [node.subChunkId, node]));
  const relationsBySubChunk = new Map<string, SubChunkRelationNode[]>();
  for (const relation of groups.sub_chunk_relation) {
    for (const endpoint of [relation.fromSubChunkId, relation.toSubChunkId]) {
      const relations = relationsBySubChunk.get(endpoint) ?? [];
      relations.push(relation);
      relationsBySubChunk.set(endpoint, relations);
    }
  }
  const subChunksByChunk = new Map<string, SubChunkNode[]>();
  for (const subChunk of groups.sub_chunk) {
    const values = subChunksByChunk.get(subChunk.chunkId) ?? [];
    values.push(subChunk);
    subChunksByChunk.set(subChunk.chunkId, values);
  }
  const chunksByDocument = new Map<string, ChunkNode[]>();
  for (const chunk of groups.chunk) {
    const values = chunksByDocument.get(chunk.dokumentId) ?? [];
    values.push(chunk);
    chunksByDocument.set(chunk.dokumentId, values);
  }

  return groups.dokument.map((document) => {
    const dmsFileId = document.dmsFileId ?? null;
    const chunks = [...(chunksByDocument.get(document.id) ?? [])]
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
      .map((chunk) => {
        const subChunks = [...(subChunksByChunk.get(chunk.id) ?? [])]
          .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
          .map((subChunk) => ({
            chunkId: subChunk.id,
            parentChunkId: chunk.id,
            pageContent: markdown.get(subChunk.markdownTextId) ?? "",
            metadata: subChunkMetadata(
              subChunk,
              typedBySubChunk.get(subChunk.id),
              relationsBySubChunk.get(subChunk.id) ?? [],
            ),
            header: subChunk.header || null,
          }));
        return {
          chunkId: chunk.id,
          pageContent: chunk.pageContent ?? "",
          metadata: {
            page_numbers: chunk.pageNumbers ?? [],
            toc_path: chunk.tocPath ?? [],
            all_subchapters: chunk.allSubchapters ?? [],
            hypothetical_questions: chunk.hypotheticalQuestions ?? [],
          },
          subChunks: subChunks,
          header: chunk.header || null,
        };
      });
    const filename = document.filename ?? "unknown";
    return {
      documentName: filename,
      documentPath: "",
      processedJsonFileId: dmsFileId ?? document.id,
      sourceFileId: dmsFileId,
      processedDocument: {
        metadata: {
          documentId: document.documentId ?? document.id,
          originalDocumentName: filename,
          sourceFileId: dmsFileId,
          documentType:
            document.documentType === null || document.documentType === undefined
              ? null
              : { name: document.documentType },
          pages: document.pageCount ?? null,
          summary: document.summary ?? "",
          projectId: projectId,
        },
        markdownContent: markdown.get(document.markdownTextId) ?? "",
        chunks,
      },
    };
  });
}
