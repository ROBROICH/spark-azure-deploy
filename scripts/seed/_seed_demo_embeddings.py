"""Seed synthetic 'Drucksachen' demo embeddings into begruendungen-db.

For demo purposes only: builds one synthetic legislative-justification document per
seeded law (from gesetze-normen), with one chunk per paragraph (§), grounded in the
real norm text. Embeds each chunk with OpenAI text-embedding-3-small at dimensions=1024
(the SAME model+dim the query side uses), so the demo legal retrieval (query_top_k_dr)
returns relevant, non-empty results for the sample case.

Idempotent: clears prior DEMO/* rows before inserting. Run:
    .venv/Scripts/python.exe scripts/_seed_demo_embeddings.py
"""

import asyncio
import os
import sys
from collections import OrderedDict
from pathlib import Path

import asyncpg
from openai import AsyncOpenAI

ROOT = Path(__file__).resolve().parents[1]
DB_HOST = "localhost"
DB_PORT = 5432
EMBED_DIM = 1024
EMBED_BATCH = 128
MAX_CHARS = 4000  # cap per chunk for embedding/storage (token safety)

# Laws to seed. None = all seeded laws (most robust for the demo).
# Optional CLI arg: comma-separated jurabk list (e.g. "16. BImSchV,FStrG").
LAWS: list[str] | None = None
if len(sys.argv) > 1 and sys.argv[1].strip():
    LAWS = [s.strip() for s in sys.argv[1].split(",") if s.strip()]


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


ENV = load_env(ROOT / ".env")


def cfg(key: str, default: str | None = None) -> str:
    val = ENV.get(key) or os.environ.get(key) or default
    if val is None:
        raise RuntimeError(f"Missing required config: {key}")
    return val


BASE_URL = cfg("LITELLM_BASE_URL", "https://api.openai.com/v1")
API_KEY = cfg("LITELLM_MASTER_KEY")
EMBED_MODEL = cfg("LITELLM_EMBEDDING_MODEL", "text-embedding-3-small")
DB_PASSWORD = cfg("DB_PASSWORD", "postgres")


async def fetch_norms(conn: asyncpg.Connection) -> "OrderedDict[str, list]":
    rows = await conn.fetch(
        """
        SELECT jurabk,
               paragraph_nr,
               min(titel)                                                  AS titel,
               string_agg(paragraph_text, ' ' ORDER BY sub_paragraph_nr)   AS txt
        FROM norm
        GROUP BY jurabk, paragraph_nr
        ORDER BY jurabk, paragraph_nr
        """
    )
    laws: "OrderedDict[str, list]" = OrderedDict()
    for r in rows:
        if LAWS is not None and r["jurabk"] not in LAWS:
            continue
        laws.setdefault(r["jurabk"], []).append(r)
    return laws


def build_chunk_text(jurabk: str, paragraph_nr: int, titel: str, txt: str) -> str:
    titel = (titel or "").strip()
    txt = (txt or "").strip()
    body = (
        f"Begründung zu § {paragraph_nr} {titel} ({jurabk}). {txt} "
        "Die Regelung dient der rechtssicheren Umsetzung der genannten Anforderungen "
        "und der angemessenen Abwägung der berührten öffentlichen und privaten Belange."
    )
    return body[:MAX_CHARS]


async def embed_all(client: AsyncOpenAI, texts: list[str]) -> list[list[float]]:
    out: list[list[float]] = []
    for i in range(0, len(texts), EMBED_BATCH):
        batch = texts[i : i + EMBED_BATCH]
        resp = await client.embeddings.create(model=EMBED_MODEL, input=batch, dimensions=EMBED_DIM)
        out.extend(d.embedding for d in resp.data)
        print(f"  embedded {min(i + EMBED_BATCH, len(texts))}/{len(texts)}")
    return out


async def main() -> None:
    src = await asyncpg.connect(
        host=DB_HOST, port=DB_PORT, user="postgres", password=DB_PASSWORD, database="gesetze-normen"
    )
    try:
        laws = await fetch_norms(src)
    finally:
        await src.close()

    # Build chunk payloads (one per §), keep law grouping.
    per_law: "OrderedDict[str, list[tuple[int, str, str, str]]]" = OrderedDict()
    flat_texts: list[str] = []
    for jurabk, norms in laws.items():
        items = []
        for n in norms:
            titel = (n["titel"] or "").strip()
            sec_title = f"§ {n['paragraph_nr']}" + (f" {titel}" if titel else "")
            ctext = build_chunk_text(jurabk, n["paragraph_nr"], titel, n["txt"])
            items.append((n["paragraph_nr"], sec_title, titel or sec_title, ctext))
            flat_texts.append(ctext)
        per_law[jurabk] = items

    print(f"Laws: {len(per_law)} | chunks to embed: {len(flat_texts)}")
    client = AsyncOpenAI(base_url=BASE_URL, api_key=API_KEY)
    embeddings = await embed_all(client, flat_texts)

    # Re-attach embeddings in order.
    it = iter(embeddings)
    dst = await asyncpg.connect(
        host=DB_HOST, port=DB_PORT, user="postgres", password=DB_PASSWORD, database="begruendungen-db"
    )
    total = 0
    try:
        async with dst.transaction():
            await dst.execute("DELETE FROM chunks WHERE dokumentnummer LIKE 'DEMO/%'")
            await dst.execute("DELETE FROM documents WHERE dokumentnummer LIKE 'DEMO/%'")
            for jurabk, items in per_law.items():
                doknr = await dst.fetchval(
                    """
                    INSERT INTO documents
                        (jurabk, aktualisiert, autoren_anzahl, datum, dokumentart, dokumentnummer,
                         drucksachetyp, herausgeber, titel, typ, vorgangsbezug_anzahl, wahlperiode)
                    VALUES ($1, now(), 1, DATE '2024-01-01', 'Drucksache', $2,
                            'gesetzentwurf'::drucksachetyp, 'bundestag'::herausgeber, $3, 'Drucksache', 0, 20)
                    RETURNING doknr
                    """,
                    jurabk,
                    f"DEMO/{jurabk}",
                    f"Synthetische Demo-Gesetzesbegründung zum {jurabk} (Testdaten)",
                )
                recs = []
                for idx, (_pnr, sec_title, sec_text, ctext) in enumerate(items):
                    emb = next(it)
                    vec = "[" + ",".join(f"{x:.6f}" for x in emb) + "]"
                    recs.append(
                        (jurabk, doknr, f"DEMO/{jurabk}", sec_title[:480], sec_text[:480], idx, ctext, vec, 1, 1)
                    )
                await dst.executemany(
                    """
                    INSERT INTO chunks
                        (jurabk, doknr, dokumentnummer, section_title, section_text,
                         chunk_index, chunk_text, embedding, start_page, end_page)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9, $10)
                    """,
                    recs,
                )
                total += len(recs)
                print(f"{jurabk:>16}: {len(recs):4d} chunks (doknr={doknr})")
    finally:
        await dst.close()
    print(f"DONE. Inserted {total} chunks across {len(per_law)} laws.")


if __name__ == "__main__":
    asyncio.run(main())
