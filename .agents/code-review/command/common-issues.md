# Common issues

This file lists high-signal, recurring review comments.

## 1) Untyped data loading: validate early

**Problem:** Data loaded from untyped sources (downloads, JSON APIs, `json.loads`, etc.) defaults to `Any`/`dict`, which hides shape issues until runtime.

**Do (validate immediately):**

- Parse bytes/JSON.
- Validate into a typed model (`pydantic`, `attrs`, dataclasses + custom validation, `TypedDict` + explicit checks).
- Use typed access everywhere downstream.

**Don't:**

- Pass raw `dict`/`list` data through multiple layers.
- Mix parsing and business logic.

### Example

**DON'T**

```py
raw = json.loads(payload)
for item in raw:
    metadata = item.get("metadata", {})  # widens type; hides missing/invalid shape
```

**DO**

```py
raw = json.loads(payload)
items = [ItemModel.model_validate(x) for x in raw]
for item in items:
    metadata = item.metadata
```

## 2) Prefer strict field access once the type guarantees presence

**Problem:** Using `.get()` on a `TypedDict` (or validated model) for a required field widens the type to `T | None`, forcing extra `None` checks and making code noisier.

**DON'T (TypedDict / required field):**

```py
metadata = chunk_data.get("metadata")  # -> Metadata | None
if metadata is None:
    ...
```

**DO (TypedDict / required field):**

```py
metadata = chunk_data["metadata"]  # -> Metadata
```

**DO (validated model):**

```py
metadata = chunk_data.metadata
```

## 3) Keep validation and access consistent

- Validate at the boundary (I/O), not in the middle of core logic.
- After validation, avoid falling back to dict-style optional access patterns.

## 4) Keep docstrings and comments lean — no noise

**Problem:** Docstrings that enumerate `Args`, `Returns`, and `Raises` for every endpoint duplicate what the function signature and type hints already express. Inline comments that restate what the code does (`# Extract with MinerU` above `extract_with_mineru()`) or reference historical context the reader doesn't need (`# was done by parent before`) are bloat. With coding assistants generating code, this kind of noise compounds fast across a codebase — be strict about it.

**Rules:**

- Only add a docstring when the behavior isn't obvious from the name + signature (e.g. complex business logic, non-trivial side effects).
- Never restate parameter names/types that are already in the signature.
- NEVER add comments that just restate what the next line of code does — if the function is named well, the comment adds nothing.
- NEVER add historical comments (`# was done by X before`, `# moved from Y`, `# previously handled by Z`). The reader only cares about what the code does now, not what it used to do.
- For FastAPI endpoints, declare possible error responses via the `responses` parameter on the decorator instead of documenting them in docstrings — this way OpenAPI generators produce accurate SDKs.

**DON'T:**

```py
@router.get("/items/{item_id}", response_model=Item)
async def get_item(
    item_id: UUID = Path(...),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Get an item by ID.

    Args:
        item_id (UUID): The ID of the item.
        db (AsyncSession): Injected async database session.

    Raises:
        HTTPException: 404 if the item does not exist.

    Returns:
        Item: The requested item.
    """
    return await item_service.get(item_id, db=db)
```

**DO:**

```py
@router.get(
    "/items/{item_id}",
    response_model=Item,
    responses={404: {"description": "Item not found"}},
)
async def get_item(
    item_id: UUID = Path(...),
    db: AsyncSession = Depends(get_db_session),
):
    return await item_service.get(item_id, db=db)
```

## 5) NEVER pass `args=[...]` to `workflow.execute_activity` or `execute_child_workflow`

**Problem:** Using `args=[input]` (a list) widens the generic `ParamType` to `Sequence[Any]`, which defeats type-checking — the type-checker can no longer catch wrong inputs. It also makes Temporal workflow reset impossible.

**Rules:**

- NEVER use `args=[...]` with a list of inputs.
- Always use a single input object and pass it positionally or with `arg=input`.

**DON'T:**

```py
return await workflow.execute_activity(
    _extract_document_direct,
    args=[input],
    start_to_close_timeout=timedelta(minutes=45),
)
```

**DO:**

```py
return await workflow.execute_activity(
    _extract_document_direct,
    input,
    start_to_close_timeout=timedelta(minutes=45),
)
```

## 6) Don't use S3 refs to sling data between activities — use the codec

**Problem:** Manually uploading data to S3, passing a reference URL, then downloading and parsing it in the next activity loses type-safety (the downloaded blob is untyped and must be parsed/validated again) and adds cognitive overhead: every developer must know which fields are S3 refs, decide when to offload to S3, and handle the upload → download → parse → validate dance. Our Temporal codec already handles large payload serialization transparently.

**Acceptable uses of S3 refs:**

- Downloading external data at the start of a top-level workflow (e.g., fetching a file from DMS to kick things off) — but only if that workflow is not itself used as a child workflow within the same module. If it is, the parent should pass typed data via the codec instead.
- Storing intermediary files that are consumed outside Temporal (e.g., files served to the frontend).

**Flag it when:** data is uploaded to S3 in one activity only to be downloaded and parsed in the next activity within the same workflow. Trace the ref — if it's purely internal data passing between activities/workflows, it's unnecessary overhead and the codec should handle it instead.

**DON'T (internal data passing between activities):**

```py
# activity A: upload to S3, pass ref
cl_bytes = json.dumps(content_list).encode()
ref = await upload_ref(cl_bytes)
return PostprocessInput(content_list_ref=ref, ...)

# activity B: download, parse, hope for the best
cl_bytes = await download_ref(input.content_list_ref)
content_list = json.loads(cl_bytes)  # -> Any, type-safety gone
```

**DO:**

```py
# Just pass typed data — the codec handles large payloads
return PostprocessInput(content_list=content_list, ...)

# Receiving side: already typed, no parsing needed
content_list = input.content_list
```

## 7) NEVER use defaults for env-var-backed Pydantic Settings fields

**Problem:** Default values on fields that are populated from environment variables hide which env vars a service actually requires. This makes it hard to see at a glance what needs to be configured and leads to silent misconfiguration during deployment.

**Rules:**

- NEVER set a default on a `BaseSettings` field that maps to an env var.
- If the service needs a value, make it required — the app should fail to start if the env var is missing.

**DON'T:**

```py
class Settings(BaseSettings):
    database_url: str = "postgresql://localhost:5432/dev"
    api_key: str = ""
```

**DO:**

```py
class Settings(BaseSettings):
    database_url: str
    api_key: str
```

For derived values that are computed from env vars, use a `@property`:

```py
class Settings(BaseSettings):
    DB_USER: str
    DB_PASSWORD: str
    DB_HOST: str
    DB_PORT: int
    DB_NAME: str

    @property
    def DATABASE_URL(self) -> str:  # noqa: N802
        return (
            f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )
```

## 8) Internal tuning must NOT be in env vars

**Problem:** Putting stable internal tuning (timeouts, batch sizes, retry counts, thresholds) into `BaseSettings` / env vars makes it look deploy-dependent when it isn't, bloats env files, and creates unclear ownership.

**Rules:**

- **NEVER** put stable internal tuning into `BaseSettings` / env vars. Timeouts, batch sizes, retry policies, algorithm knobs — these are code decisions, not deploy config.
- `BaseSettings` is exclusively for deploy-varying values: endpoints, credentials, hostnames, resource handles.
- Internal tuning can live anywhere in code — inline constants, module-level constants, typed config models, whatever. It just must NOT be in env vars.
- **NEVER** store secrets or external service handles in code constants.

**Don't:**

- Put `TIMEOUT`, `MAX_RETRIES`, `BATCH_SIZE` in `BaseSettings` unless they truly vary by deployment.
- Put secrets/endpoints in code constants.

### Example

**DON'T**

```py
class LiteLLMConfig(BaseSettings):
    BASE_URL: str
    MASTER_KEY: str
    TIMEOUT: float = 240.0
    MAX_RETRIES: int = 3
```

**DO**

```py
class LiteLLMConfig(BaseSettings):
    BASE_URL: str
    MASTER_KEY: str

class LiteLLMClientConfig(BaseModel):
    TIMEOUT_SECONDS: float = 240.0
    MAX_RETRIES: int = 3

class DmsConfig(BaseModel):
    PAGE_SIZE: int = 500
    MAX_PAGES: int = 200
```

## 9) Don't drag config through call chains

**Problem:** Passing static config values through workflow/activity/function params bloats signatures, couples layers, and spreads config knowledge everywhere.

**Rules:**

- Pass only runtime/domain input across boundaries.
- Read static config at the point of use (inside the callee).
- Keep signatures minimal and semantic.
- **NEVER** thread static config (`threshold`, `batch_size`, `timeout`, `retries`) through multiple layers.
- **NEVER** add params that only forward global config from caller to callee.

**Do:**

- Pass `document_id`, `project_id`, payloads, user/runtime input.
- Resolve `config.CHECK_PLAUSIBILITY.*` inside the activity/service that uses it.
- Refactor signatures when a parameter is only forwarding global config.

**Don't:**

- Thread `threshold`, `batch_size`, `timeout`, `retries` through multiple layers if not runtime-specific.
- Mirror global config keys as params "just in case".
- Force callers to know callee internals.

### Example

**DON'T**

```py
await workflow.start_activity(
    screen_claim_batch,
    args=[
        document_id,
        claim_batch,
        config.CHECK_PLAUSIBILITY.N_REFERENCE_QUERIES,
        config.CHECK_PLAUSIBILITY.HIGH_RISK_THRESHOLD,
        project_id,
    ],
)
```

```py
async def screen_claim_batch(
    document_id,
    claim_batch,
    n_reference_queries,
    high_risk_threshold,
    project_id,
):
    ...
```

**DO**

```py
await workflow.start_activity(
    screen_claim_batch,
    args=[document_id, claim_batch, project_id],
)
```

```py
async def screen_claim_batch(document_id, claim_batch, project_id):
    n_reference_queries = config.CHECK_PLAUSIBILITY.N_REFERENCE_QUERIES
    high_risk_threshold = config.CHECK_PLAUSIBILITY.HIGH_RISK_THRESHOLD
    ...
```

## 10) Commented-out env placeholders with `<>` instructions are intentional

**Not an issue.** When an env var is commented out in `.env.example` or `.env.local` with angle-bracket instructions like `# SECRET_KEY=<set in .env>`, this is the intended pattern for secrets and per-developer overrides.

**Do NOT flag** commented-out env vars that:

- Have a `<...>` instruction explaining where to set them (e.g. `# API_KEY=<set in .env>`)
- Are secrets that should never have a real default checked into git

**Only flag** if:

- A **required** env var has no path to being set (not in any `.env`, not in k8s manifests)
- The `<...>` instruction is misleading or points to the wrong file

## 11) In Temporal modules, don't catch errors just to log and re-raise

**Problem:** Catching an exception only to call `logger.exception(...)` and `raise` duplicates error logs, since errors are already logged centrally. This adds noise and hides signal.

**Rules:**

- In Temporal modules, **NEVER** wrap code in `try/except` only for logging and immediate re-raise.
- Let exceptions bubble unless you are adding real handling (translation, fallback, cleanup, retry shaping, or richer context used by callers).
- If no behavior changes, remove the `try/except` block.

**DON'T:**

```py
try:
    result = await run_step(input)
    return result
except Exception:
    logger.exception("run_step failed")
    raise
```

**DO:**

```py
result = await run_step(input)
return result
```

## 12) DB schema-affecting code must live under the DB folder (non-negotiable)

**Problem:** If schema-affecting code lives outside `src/models/db/`, schema changes become invisible in DB-focused diffs and teams miss required migrations.

**MANDATORY rule (NO EXCEPTIONS):**

- NEVER keep DB schema-affecting code outside `src/models/db/`.
- NEVER define DB enums/types used by DB models outside `src/models/db/`.
- NEVER import schema-defining modules into DB models from non-DB folders.
- If DB models import a module for table/column/type definitions, that module is DB-related and MUST live in `src/models/db/`.
- Reviewers MUST flag this EVERY TIME, even when the violation is pre-existing and not introduced by the current PR.

**DON'T:**

```py
# src/services/files/file_enum.py
class FileTypeEnum(str, Enum):
    DOCUMENT = "document"

# src/models/db/db_models.py
from src.services.files.file_enum import FileTypeEnum
```

**DO:**

```py
# src/models/db/file_enum.py
class FileTypeEnum(str, Enum):
    DOCUMENT = "document"

# src/models/db/db_models.py
from src.models.db.file_enum import FileTypeEnum
```

## 13) Don't overmock — if you mock every dependency, the test is worthless

**Problem:** When a unit test mocks out every dependency a function touches (DB session, storage provider, service classes, etc.), the test verifies nothing except that Python's control flow and your mock wiring work. It gives false confidence, breaks the moment internals change, and is pure noise. If your test setup is longer than the function under test, you're testing the mocks, not the code.

**Rules:**

- NEVER write a unit test where every meaningful dependency is mocked/patched out. If nothing real executes, the test has no value.
- If a function orchestrates I/O (DB, storage, HTTP), test it via integration tests with real (or containerized) infrastructure.
- Unit test only pure functions with no I/O — input in, output out, no mocks needed.
- If you need more than 2 patches to call a function, it's not a unit test. Write an integration test instead.

**DON'T:**

```py
# 30 lines of fake classes and patch scaffolding to test a 20-line function
class _FakeStorage:
    async def download(self, name):
        yield self._data

class _FakeService:
    def __init__(self, db, storage):
        pass
    async def do_thing(self, **_kw):
        return SimpleNamespace(id=uuid4())

@asynccontextmanager
async def _fake_session():
    yield object()

with ExitStack() as s:
    s.enter_context(patch("mod.get_storage", new=AsyncMock(return_value=_FakeStorage(data))))
    s.enter_context(patch("mod.Service", new=_FakeService))
    s.enter_context(patch("mod.SessionLocal", side_effect=lambda: _fake_session()))
    result = await do_work(input)  # what are you even testing here?
```

**DO:**

```py
# Unit test pure helpers — no mocks needed
def test_normalize_name_filters_macosx():
    assert _normalize_zip_entry_name("__MACOSX/._doc.pdf") is None

# Integration test orchestration functions with real infra
async def test_process_file(storage_provider, db_session):
    # real storage, real DB — tests actual behavior
```
