# File and ZIP upload limits

SPARK Workflow accepts `zip` and `ewms_zip` uploads larger than 1 GiB.
`MAX_OBJECT_SIZE_MB` limits other uploads and file reads that load the complete
file into memory.

The extractor streams each ZIP entry from object storage and processes one entry
at a time. Each entry remains subject to the extraction limits below.
Upload confirmation rejects every upload whose storage metadata omits the
object size.

The deployment configuration and the [Helm charts](/helm/charts/README.md)
define these defaults. Settings ending in `_MB` use MiB. Settings ending in
`_GB` use GiB.

| Setting                       | Default | Maximum allowed                                             |
| ----------------------------- | ------- | ----------------------------------------------------------- |
| `MAX_OBJECT_SIZE_MB`          | `1024`  | Size of a non-ZIP upload or a file read into memory         |
| `MAX_SINGLE_ENTRY_SIZE_MB`    | `1024`  | Uncompressed size of one ZIP entry                          |
| `MAX_ZIP_EXTRACTION_SIZE_GB`  | `10`    | Total uncompressed size of accepted ZIP entries             |
| `MAX_ZIP_ENTRIES`             | `1000`  | Number of entries in the archive                            |
| `MAX_COMPRESSION_RATIO`       | `100`   | Uncompressed size divided by compressed size for each entry |
| `MAX_ZIP_APPENDED_DATA_BYTES` | `65536` | Bytes after the end of the ZIP archive                      |

A higher `MAX_OBJECT_SIZE_MB` also allows the backend to load larger files into memory.

Upload filenames and ZIP entry names have at most 1024 characters and 32 path
components. The extractor reads at most 16 MiB of ZIP metadata at once and
32 MiB in total, and stops listing entries once `MAX_ZIP_ENTRIES` is exceeded.
A ZIP whose entries normalize to the same name is rejected as ambiguous.

Checkpoint cleanup selects at most 100 expired rows per run. Each object is
deleted before its row. Failed and unattempted deletions remain eligible for the
next run, and an already absent object permits row cleanup.

Clients cannot change the stored MIME type of a file. Download URLs open inline
only for PDF, PNG, and JPEG files; every other type downloads as an attachment.

## ZIP retries and source cleanup

The extraction activity retains the source ZIP so that Temporal can retry an
attempt whose result was not acknowledged. Retry safety does not depend on
cancelling an earlier attempt: extraction never deletes its input.

`FileProcessingWorkflow` deletes the source through a separate, retryable
`deleteZipSource` activity after processing has persisted its completed state.
For ZIPs that require approval, cleanup follows persistence of the diff and the
approval-required state. A source that is already absent counts as successful
cleanup. Other storage failures remain retryable.

Processing failures before completion retain the source ZIP. This change does
not restore ZIPs deleted by earlier worker versions.
