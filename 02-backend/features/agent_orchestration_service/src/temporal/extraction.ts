import type {
  DocumentExtractionEntry,
  NodeMutation,
  ProcessedChunk,
  ProcessedFileInfo,
} from "../schemas.ts";

import type { NodeJson } from "@spark-workflow/node-crud";
function mutation(
  nodeType: string,
  id: string,
  payload: { [key: string]: NodeJson | undefined },
): NodeMutation {
  return { nodeType: nodeType, id, payload };
}

function pageIndexPayloads(
  chunks: readonly ProcessedChunk[],
): { [key: string]: NodeJson | undefined }[] {
  let nodeId: string | null = null;
  let position: number | null = null;
  return chunks.map((chunk) => {
    const pageIndex = chunk.pageIndexNode;
    if (pageIndex !== null && pageIndex !== undefined) {
      nodeId = pageIndex.nodeId;
      position = 0;
      return {
        pageIndexNodeId: nodeId,
        pageIndexPosition: position,
        pageIndexSummary: pageIndex.summary ?? null,
      };
    }
    if (nodeId === null) {
      return {
        pageIndexNodeId: null,
        pageIndexPosition: null,
        pageIndexSummary: null,
      };
    }
    position = position === null ? 0 : position + 1;
    return {
      pageIndexNodeId: nodeId,
      pageIndexPosition: position,
      pageIndexSummary: null,
    };
  });
}

function typedSubChunkType(chunkType: string): string {
  if (chunkType === "table") return "sub_chunk_table";
  if (chunkType === "image") return "sub_chunk_image";
  return "sub_chunk_text";
}

/** Lockstep with examination node tables and Temporal `ChunkMetadata` in inhaltsextraktion.ts. */
export function mapProcessedDocumentNodes(
  processedFile: ProcessedFileInfo,
  nextId: () => string,
  dokumentIdOverride?: string,
): NodeMutation[] {
  if (processedFile.processedDocument == null) return [];
  const document = processedFile.processedDocument;
  const metadata = document.metadata;
  const chunks = document.chunks ?? [];
  const inserts: NodeMutation[] = [];

  const documentMarkdownId = nextId();
  inserts.push(
    mutation("markdown_text", documentMarkdownId, {
      text: document.markdownContent,
    }),
  );

  const frontendParentIds =
    metadata.documentTopic == null ? [] : [`topic:${metadata.documentTopic.id}`];
  const dokumentId = dokumentIdOverride ?? nextId();
  inserts.push(
    mutation("dokument", dokumentId, {
      filename: metadata.originalDocumentName,
      mimeType: "application/pdf",
      pageCount: metadata.pages ?? 0,
      dmsFileId: metadata.sourceFileId ?? processedFile.sourceFileId ?? null,
      documentId: metadata.documentId,
      documentType: metadata.documentType?.name ?? null,
      frontendParentIds: frontendParentIds,
      summary: metadata.summary,
      markdownTextId: documentMarkdownId,
    }),
  );

  const pageIndexes = pageIndexPayloads(chunks);
  for (const [index, chunk] of chunks.entries()) {
    const chunkId = chunk.chunkId;
    const chunkMetadata = chunk.metadata ?? {};
    inserts.push(
      mutation("chunk", chunkId, {
        dokumentId: dokumentId,
        order: index,
        previousChunkId: index === 0 ? null : (chunks[index - 1]?.chunkId ?? null),
        nextChunkId: index === chunks.length - 1 ? null : (chunks[index + 1]?.chunkId ?? null),
        header: chunk.header ?? "",
        pageContent: chunk.pageContent,
        pageNumbers: chunkMetadata.page_numbers ?? [],
        tocPath: chunkMetadata.toc_path ?? [],
        allSubchapters: chunkMetadata.all_subchapters ?? [],
        hypotheticalQuestions: chunkMetadata.hypothetical_questions ?? [],
        ...pageIndexes[index],
      }),
    );
  }

  const subChunks = chunks.flatMap((chunk) =>
    (chunk.subChunks ?? []).map((subChunk) => ({ parentChunkId: chunk.chunkId, subChunk })),
  );
  for (const [index, { parentChunkId, subChunk }] of subChunks.entries()) {
    const subChunkId = subChunk.chunkId;
    const subMetadata = subChunk.metadata ?? {};
    const chunkType = subMetadata.chunk_type ?? "text";
    const markdownId = nextId();
    inserts.push(
      mutation("markdown_text", markdownId, {
        text: subChunk.pageContent,
      }),
    );
    inserts.push(
      mutation("sub_chunk", subChunkId, {
        chunkId: subChunk.parentChunkId ?? parentChunkId,
        order: index,
        previousSubChunkId: index === 0 ? null : (subChunks[index - 1]?.subChunk.chunkId ?? null),
        nextSubChunkId:
          index === subChunks.length - 1 ? null : (subChunks[index + 1]?.subChunk.chunkId ?? null),
        header: subChunk.header ?? "",
        chunkType: chunkType,
        focusTopic: subMetadata.focus_topic ?? "",
        hypotheticalQuestions: subMetadata.hypothetical_questions ?? [],
        markdownTextId: markdownId,
        pageNumbers: subMetadata.page_numbers ?? [],
        header1: subMetadata["Header 1"] ?? null,
        header2: subMetadata["Header 2"] ?? null,
        header3: subMetadata["Header 3"] ?? null,
        wildlifeMentioned: subMetadata.wildlife_mentioned ?? null,
        plantSpeciesMentioned: subMetadata.plant_species_mentioned ?? null,
        wildlifeSpecies: subMetadata.wildlife_species ?? [],
        plantSpecies: subMetadata.plant_species ?? [],
        mapScale: subMetadata.map_scale ?? null,
      }),
    );
    inserts.push(
      mutation(
        typedSubChunkType(chunkType),
        nextId(),
        chunkType === "table" || chunkType === "image"
          ? {
              subChunkId: subChunkId,
              assetPath: subMetadata.asset_path ?? "",
              caption: subMetadata.caption ?? "",
              summary: subMetadata.summary ?? "",
              description: subMetadata.description ?? "",
              content: subMetadata.content ?? "",
              footnote: subMetadata.footnote ?? "",
            }
          : { subChunkId: subChunkId },
      ),
    );
  }

  const knownSubChunks = new Set(subChunks.map(({ subChunk }) => subChunk.chunkId));
  const relations = new Set<string>();
  for (const { subChunk } of subChunks) {
    const sourceId = subChunk.chunkId;
    const metadata = subChunk.metadata ?? {};
    for (const candidates of [metadata.related_assets, metadata.related_text]) {
      for (const candidate of candidates ?? []) {
        const targetId = candidate.chunk_id;
        if (!knownSubChunks.has(sourceId) || !knownSubChunks.has(targetId)) continue;
        const pair = [sourceId, targetId].sort().join(":");
        if (relations.has(pair)) continue;
        relations.add(pair);
        inserts.push(
          mutation("sub_chunk_relation", nextId(), {
            fromSubChunkId: sourceId,
            toSubChunkId: targetId,
            relationType: candidate.type ?? "text",
          }),
        );
      }
    }
  }
  return inserts;
}

export function extractionEntries(
  processedFiles: readonly ProcessedFileInfo[],
  dokumentIdByFileId: Readonly<Record<string, string>>,
  nextId: () => string,
): DocumentExtractionEntry[] {
  const entries: DocumentExtractionEntry[] = [];
  for (const processedFile of processedFiles) {
    if (processedFile.processedDocument == null) continue;
    const sourceFileId =
      processedFile.processedDocument.metadata.sourceFileId ?? processedFile.sourceFileId ?? null;
    if (sourceFileId === null) continue;
    const override = dokumentIdByFileId[sourceFileId];
    const inserts = mapProcessedDocumentNodes(processedFile, nextId, override);
    const dokument = inserts.find(({ nodeType }) => nodeType === "dokument");
    if (dokument === undefined) throw new Error("Mapped inserts are missing a 'dokument' node");
    entries.push({
      dokumentId: dokument.id,
      sourceFileId: sourceFileId,
      hasDokumentIdOverride: override !== undefined,
      inserts,
    });
  }
  return entries;
}
