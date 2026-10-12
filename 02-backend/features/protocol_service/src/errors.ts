import { defineErrorCatalog } from "evlog";

export const protocolErrors = defineErrorCatalog("protocol", {
  SOURCE_UNAVAILABLE: {
    status: 503,
    message: "Protocol source unavailable",
    why: "A selected protocol source could not be queried",
    fix: "Retry after the source database is available",
  },
  EXPORT_LIMIT_EXCEEDED: {
    status: 413,
    message: ({ total, limit }: { total: number; limit: number }) =>
      `Audit trail has ${total} entries but export is capped at ${limit}. Use the paginated /history endpoint or apply date/source/service filters to reduce the result.`,
    why: "The unpaginated audit export exceeds its bounded response size",
    fix: "Use the paginated history endpoint or narrow the export filters",
  },
});
