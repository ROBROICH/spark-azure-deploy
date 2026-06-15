# Temporal Guideline Compliance

Check that Temporal workflow and activity files follow the project's conventions.

## Auto-detection

First, search for files importing from `temporalio` or containing `@workflow.defn` / `@activity.defn`:

```bash
rg -l "from temporalio|@workflow\.defn|@activity\.defn" <target_directory> --type py
```

If no results, skip this entire check and report: "No Temporal code found — skipping."

## Workflow checks (`@workflow.defn` files)

1. **Workflow identifier** — Each workflow file needs a module-level `*_id = "..."` string constant.
   Temporal associates running executions with this ID; if it's missing or renamed, in-flight
   workflows break silently. Flag if missing or if the constant name and string value are inconsistent.

2. **Typed Input/Output** — Input and output should be Pydantic `BaseModel` subclasses so the
   contract is explicit and shape issues are caught at validation time. Flag bare `dict`, `list`,
   `Any`, or loosely typed `TypedDict` fields.

3. **Handler functions** — `execute_*` and `start_*` convenience functions hide the Temporal client
   boilerplate (task queue, identifier, retry policy) so callers don't need those details.
   Flag if the workflow has no handler functions.

## Activity checks (`@activity.defn` files)

4. **Underscore prefix** — Activity implementation functions start with `_` so the public wrapper
   (without underscore) handles `workflow.execute_activity` with sensible defaults. This separates
   Temporal invocation logic from implementation and makes testing easier.

5. **Single responsibility** — Each activity should do exactly one non-deterministic thing (one
   network call, one DB query, one LLM call). Combining multiple makes retry semantics unclear —
   if the second call fails, the first has already executed.

6. **No nested activities** — Temporal does not allow calling `workflow.execute_activity` from inside
   an activity. The orchestration layer (workflow or plain async function) composes activities.

7. **Serializable I/O** — Activity inputs/outputs are recorded in Temporal's event history and must
   serialize cleanly. Class instances, connections, and clients cannot be serialized. Use Pydantic
   models or TypedDicts.

8. **No `args=[...]`** — Passing input via `args=[input]` widens the type to `Sequence[Any]`,
   defeating type-checking and making workflow reset impossible. Pass input positionally.

9. **No catch-log-reraise** — Errors are already logged centrally by the logging interceptor in this
   project. A `try/except` that only logs and re-raises duplicates the log and adds noise without
   changing behavior.

10. **No config threading** — Static config values (thresholds, batch sizes, timeouts) should be
    read at the point of use, not threaded through parameters. Threading them bloats signatures,
    couples layers, and spreads config knowledge to code that shouldn't care about it.

## Report

List violations with file path, line number, the specific rule broken, and severity (all Major).
