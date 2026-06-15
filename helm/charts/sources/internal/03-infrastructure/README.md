# 03-infrastructure

The infrastructure charts that were originally sourced from this category have been
moved to [`../../sources/external/`](../../sources/external/) to align with the internal / external
resource split used across this chart structure.

| Chart | Current location |
|---|---|
| `clamav` | `sources/external/clamav/` |
| `docling-rq` | `sources/external/docling-rq/` |
| `qdrant` | `sources/external/qdrant/` |
| `redis` | `sources/external/redis/` |
| `spicedb` | `sources/external/spicedb/` |
| `temporal` | `sources/external/temporal/` |
| `unoserver` | `sources/external/unoserver/` |

The remaining infrastructure components (PostgreSQL cluster operator, gateway) are
not yet part of this chart structure.
