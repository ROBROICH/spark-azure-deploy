# Error handling rules

These rules cover error-swallowing patterns that silently convert failures into empty/partial results.

## NEVER swallow errors — let failures fail

**Problem:** Wrapping I/O calls (HTTP, gRPC, database, embedding, LLM, queue operations) in `try/except` that catches the error, logs it, and then **continues execution without re-raising** silently converts failures into empty/partial results. This is one of the most dangerous patterns in pipeline code because the system appears to work — it completes without errors, returns a result, logs look clean — but the result is wrong. Data is silently dropped, and nobody notices until much later (or never).

**Why this is catastrophic in practice:**

- A **timeout** on an LLM extraction call gets caught → that chunk is silently skipped → claims are missing from the final result → the pipeline reports success with fewer claims than expected, and the caller has no way to know data was lost.
- A **connection error** to an embedding service gets caught → the batch is silently dropped → embeddings are never created → downstream upload has nothing to upload → the pipeline "succeeds" with zero results.
- A **Qdrant upload failure** gets caught → the batch is lost → the pipeline completes "successfully" but data never made it to the vector store.
- An **HTTP 503** from an external service gets caught → empty response treated as valid → downstream logic operates on nothing → garbage output presented as a real result.

The common thread: **the error is hidden from the caller, so no retry/abort/alert happens.** The system "succeeds" with wrong data, which is strictly worse than failing loudly.

**This is distinct from the catch-log-reraise rule in common-issues.md.** That rule is about noise — catching only to log and re-raise is redundant but harmless because the error still propagates. This rule is about **catch-and-continue**, which actively destroys data integrity. If you see `except` without `raise`, that is the red flag.

**Rules:**

- **NEVER** catch exceptions around I/O calls (HTTP, gRPC, LLM, embedding, DB, queue, file, S3) only to log and continue. If the call fails, the caller MUST know.
- **NEVER** use bare `except Exception` as a "resilience" pattern in pipeline/processing code. It is not resilience — it is silent data loss.
- **NEVER** design pipelines where a stage failure leads to the next stage receiving empty input and "succeeding". That is not graceful degradation — it is incorrect behavior masquerading as success.
- **ALWAYS** let errors propagate to the caller so they can retry, abort, or alert. The right place to decide how to handle a failure is the caller (or a retry policy), not the callee silently eating it.
- **ALWAYS** prefer `asyncio.TaskGroup` over `asyncio.gather` for concurrent tasks. `TaskGroup` cancels all sibling tasks and propagates the exception if any task fails. `asyncio.gather` by default does NOT propagate child exceptions reliably — if one task raises, the others may continue running with corrupted state, and the exception may be lost depending on how results are consumed.
- If a pipeline must tolerate partial failures (rare, and must be an explicit product decision, not a developer convenience), it must **track and report** what failed — e.g., return a result object with `succeeded: int`, `failed: int`, `errors: list[str]` — so the caller can decide whether the partial result is acceptable. Silent drops are NEVER acceptable.

**Sniff tests — if you see any of these, flag immediately:**

1. `except Exception` (or `except BaseException`) without `raise` inside it.
2. `except SomeError as e: logger.error(...); continue` in a loop — skipping items silently.
3. `asyncio.gather(*tasks)` without `return_exceptions=True` being explicitly handled (or better: replaced with `TaskGroup`).
4. A function that can return empty/partial results due to caught exceptions, where the caller has no way to distinguish "no results because the input was empty" from "no results because every call failed."
5. Pipeline stages connected by queues where a producer catches errors and never puts items into the queue — causing the consumer to receive fewer items (or none) without any indication of failure.

**DON'T (silent error swallowing — the pipeline "succeeds" with missing data):**

```py
async def __step_1_single_chunk(self, chunk, out_queue):
    try:
        result = await llm_fact_extraction(chunk.page_content)
        if result and result.key_claims:
            for claim in result.key_claims:
                await out_queue.put(claim)
    except Exception as e:
        self.logger.error(f"Extraction failed for chunk {chunk.chunk_id}: {e}")
        # ← No raise! Chunk is silently skipped. If the LLM timed out,
        #   this chunk's claims are just gone. Nobody knows.

async def __step_2_embed_batch(self, batch, out_queue):
    try:
        embedded = await embed_claims(batch)
        await out_queue.put(embedded)
    except Exception as e:
        self.logger.error(f"Embedding failed: {e}")
        # ← No raise! Entire batch of claims silently dropped.
        #   Consumer sees fewer items but has no way to know why.

async def _step_3_upload_qdrant(self, in_queue, doc_context):
    while True:
        batch = await in_queue.get()
        if batch is None:
            break
        try:
            await upload_to_qdrant(batch)
        except Exception as e:
            self.logger.error(f"Upload failed: {e}")
            # ← No raise! Data never made it to Qdrant but pipeline
            #   reports success. Silent data loss.
        finally:
            in_queue.task_done()
```

**DON'T (asyncio.gather — doesn't propagate task failures):**

```py
async def run(self, chunks, doc_context):
    fact_extract_task = asyncio.create_task(self._step_1(...))
    embed_task = asyncio.create_task(self._step_2(...))
    upload_task = asyncio.create_task(self._step_3(...))

    # If step_1 raises, step_2 and step_3 keep running on stale/empty queues.
    # gather() may or may not propagate the exception depending on timing.
    await asyncio.gather(fact_extract_task, embed_task, upload_task)
```

**DO (let errors propagate — fail loudly, fix correctly):**

```py
async def __step_1_single_chunk(self, chunk, out_queue):
    result = await llm_fact_extraction(chunk.page_content)
    # If this raises (timeout, connection error, bad response),
    # the exception propagates → TaskGroup cancels siblings → caller knows.
    if result and result.key_claims:
        for claim in result.key_claims:
            await out_queue.put(claim)

async def __step_2_embed_batch(self, batch, out_queue):
    embedded = await embed_claims(batch)
    # If embedding service is down, exception propagates. No silent drops.
    await out_queue.put(embedded)

async def _step_3_upload_qdrant(self, in_queue, doc_context):
    while True:
        batch = await in_queue.get()
        if batch is None:
            break
        try:
            await upload_to_qdrant(batch)
            self.uploaded_claim_count += len(batch)  # Track real work done
        finally:
            in_queue.task_done()
    # If upload fails, exception propagates. No silent data loss.
```

**DO (TaskGroup — proper concurrent error handling):**

```py
async def run(self, chunks, doc_context) -> int:
    # TaskGroup: if ANY task fails, all siblings are cancelled and the
    # exception propagates to the caller. No silent partial completion.
    async with asyncio.TaskGroup() as tg:
        tg.create_task(self._step_1(chunks, self.extraction_queue))
        tg.create_task(self._step_2(self.extraction_queue, self.embedding_queue))
        tg.create_task(self._step_3(self.embedding_queue, doc_context))
    return self.uploaded_claim_count  # Caller can verify real work was done
```

**The only acceptable uses of `try/except` without `raise`:**

1. **Cleanup/finally blocks** that release resources (file handles, connections, locks) before re-raising — but the `except` block must still `raise`.
2. **Explicit, documented partial-failure tolerance** where the function returns a result object that distinguishes success from failure (e.g., `BatchResult(succeeded=45, failed=3, errors=[...])`) and the caller explicitly handles the partial case.
3. **Top-level entry points** (CLI `main()`, HTTP request handlers) that catch for user-facing error responses — but these are boundaries, not internal pipeline code.

Anything else is a bug.
