"""Seed 1-2 synthetic court decisions (Urteile) into jura-db for the demo.

The Urteile retrieval (query_k_results) joins chunks -> normen (document_norm_link),
requires section_title in {gruende, entscheidungsgruende}, filters by cited norm
(name + paragraph_nr), then ranks by embedding distance (threshold 0.3). So each demo
'Entscheidungsgruende' chunk is linked to the norm it discusses and embedded with OpenAI
text-embedding-3-small @ dimensions=1024 (same as the query side).

Idempotent: clears prior DEMO-URT-* rows first. Run:
    .venv/Scripts/python.exe scripts/_seed_demo_urteile.py
"""

import asyncio
import os
from datetime import date
from pathlib import Path

import asyncpg
from openai import AsyncOpenAI

ROOT = Path(__file__).resolve().parents[1]
DB_HOST, DB_PORT, EMBED_DIM = "localhost", 5432, 1024


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


ENV = load_env(ROOT / ".env")


def cfg(key: str, default: str | None = None) -> str:
    val = ENV.get(key) or os.environ.get(key) or default
    if val is None:
        raise RuntimeError(f"Missing config: {key}")
    return val


BASE_URL = cfg("LITELLM_BASE_URL", "https://api.openai.com/v1")
API_KEY = cfg("LITELLM_MASTER_KEY")
EMBED_MODEL = cfg("LITELLM_EMBEDDING_MODEL", "text-embedding-3-small")
DB_PASSWORD = cfg("DB_PASSWORD", "postgres")

# (name, paragraph_nr, reasoning text). Each becomes one Entscheidungsgruende chunk
# linked to the cited norm.
DECISIONS: list[dict] = [
    {
        "doc_id": "DEMO-URT-0001",
        "gericht": "Bundesverwaltungsgericht",
        "spruchkoerper": "9. Senat",
        "aktenzeichen": "9 A 14.21",
        "entsch_datum": "2021-11-18",
        "doktyp": "Urteil",
        "titelzeile": "Planfeststellung Bundesfernstraße – Planrechtfertigung, Artenschutz, Eingriffsregelung, FFH-Verträglichkeit",
        "leitsatz": "Die artenschutzrechtlichen Zugriffsverbote des § 44 Abs. 1 BNatSchG sind bei der "
        "fernstraßenrechtlichen Planfeststellung als zwingendes Recht zu beachten; das Tötungsverbot "
        "ist individuenbezogen und setzt eine signifikante Erhöhung des Tötungsrisikos voraus.",
        "chunks": [
            (
                "FStrG", 17,
                "Die Zulassung des Vorhabens durch Planfeststellung nach § 17 Satz 1 FStrG setzt voraus, "
                "dass das Vorhaben dem Wohl der Allgemeinheit dient (Planrechtfertigung) und die von ihm "
                "berührten öffentlichen und privaten Belange im Rahmen der planerischen Abwägung mit dem "
                "ihnen zukommenden Gewicht eingestellt werden. Die gerichtliche Kontrolle der "
                "Abwägungsentscheidung ist darauf beschränkt, ob eine Abwägung stattgefunden hat, ob alle "
                "abwägungserheblichen Belange eingestellt und ihrem objektiven Gewicht entsprechend "
                "gewichtet wurden. Die mit der Ortsumgehung verfolgten Ziele der Entlastung der "
                "Ortsdurchfahrt und der Erhöhung der Verkehrssicherheit rechtfertigen den Eingriff in "
                "entgegenstehende Belange.",
            ),
            (
                "BNatSchG", 44,
                "Das Tötungs- und Verletzungsverbot des § 44 Abs. 1 Nr. 1 BNatSchG ist individuenbezogen; "
                "es ist erfüllt, wenn sich das Tötungsrisiko für Exemplare besonders geschützter Arten "
                "durch das Vorhaben in signifikanter Weise erhöht. Für die im Trassenbereich nachgewiesene "
                "Zauneidechse genügt die vorgesehene Vergrämung und Umsiedlung in vorab hergestellte "
                "Ersatzlebensräume (CEF-Maßnahmen), um die Verwirklichung des Verbotstatbestands zu "
                "vermeiden. Verbleibt gleichwohl eine Verwirklichung des Verbots, bedarf es einer Ausnahme "
                "nach § 45 Abs. 7 BNatSchG, deren Voraussetzungen hier nicht vorliegen müssen.",
            ),
            (
                "BNatSchG", 15,
                "Nach § 15 Abs. 1 BNatSchG hat der Verursacher eines Eingriffs vermeidbare Beeinträchtigungen "
                "von Natur und Landschaft zu unterlassen; nicht vermeidbare Beeinträchtigungen sind nach "
                "§ 15 Abs. 2 BNatSchG durch Maßnahmen des Naturschutzes und der Landschaftspflege "
                "auszugleichen oder zu ersetzen. Die Eingriffsregelung verlangt eine Bilanzierung von "
                "Eingriff und Kompensation; das vorgelegte landschaftspflegerische Begleitkonzept weist die "
                "erforderlichen Ausgleichs- und Ersatzmaßnahmen flächenscharf nach.",
            ),
            (
                "BNatSchG", 34,
                "Projekte sind nach § 34 Abs. 1 BNatSchG vor ihrer Zulassung auf ihre Verträglichkeit mit den "
                "Erhaltungszielen eines Natura-2000-Gebiets zu überprüfen. Ergibt die Prüfung, dass das "
                "Vorhaben zu erheblichen Beeinträchtigungen eines Gebiets in seinen für die Erhaltungsziele "
                "maßgeblichen Bestandteilen führen kann, ist es nach § 34 Abs. 2 BNatSchG grundsätzlich "
                "unzulässig. Die FFH-Vorprüfung schließt erhebliche Beeinträchtigungen des nächstgelegenen "
                "FFH-Gebiets aus, weil die vorhabenbedingten Wirkpfade die anerkannten Abschneidekriterien "
                "nicht überschreiten.",
            ),
        ],
    },
    {
        "doc_id": "DEMO-URT-0002",
        "gericht": "Bundesverwaltungsgericht",
        "spruchkoerper": "9. Senat",
        "aktenzeichen": "9 A 7.20",
        "entsch_datum": "2020-09-24",
        "doktyp": "Urteil",
        "titelzeile": "Planfeststellung Bundesfernstraße – Verkehrslärm, Lärmvorsorge, Gewässerbenutzung",
        "leitsatz": "Beim Neubau eines Verkehrsweges sind die Immissionsgrenzwerte des § 2 der 16. BImSchV "
        "einzuhalten; die Pflicht zur Lärmvorsorge nach § 41 BImSchG steht unter dem Vorbehalt der "
        "Verhältnismäßigkeit.",
        "chunks": [
            (
                "16. BImSchV", 2,
                "Die Immissionsgrenzwerte des § 2 Abs. 1 der 16. BImSchV sind beim Neubau eines Verkehrsweges "
                "einzuhalten. Maßgeblich sind die nach der Anlage 2 zur 16. BImSchV berechneten "
                "Beurteilungspegel an den schutzbedürftigen Räumen; für das allgemeine Wohngebiet gelten "
                "59 dB(A) tags und 49 dB(A) nachts. Soweit aktive Schallschutzmaßnahmen die Einhaltung nicht "
                "in vollem Umfang gewährleisten, besteht ein Anspruch auf angemessene Entschädigung für "
                "passiven Schallschutz.",
            ),
            (
                "BImSchG", 41,
                "Beim Bau öffentlicher Straßen ist nach § 41 Abs. 1 BImSchG sicherzustellen, dass keine "
                "schädlichen Umwelteinwirkungen durch Verkehrsgeräusche hervorgerufen werden, die nach dem "
                "Stand der Technik vermeidbar sind. Die Pflicht zur Lärmvorsorge steht nach § 41 Abs. 2 "
                "BImSchG unter dem Vorbehalt der Verhältnismäßigkeit von Kosten und Schutzzweck. Die "
                "vorgesehenen Lärmschutzwälle und hochabsorbierenden Lärmschutzwände stellen verhältnismäßige "
                "Maßnahmen des aktiven Schallschutzes dar.",
            ),
            (
                "WHG", 9,
                "Das Einleiten von gesammeltem Straßenoberflächenwasser in ein oberirdisches Gewässer ist eine "
                "Benutzung im Sinne des § 9 Abs. 1 Nr. 4 WHG und bedarf der wasserrechtlichen Erlaubnis. Die "
                "Erlaubnis ist zu versagen, wenn schädliche, auch durch Nebenbestimmungen nicht vermeidbare "
                "Gewässerveränderungen zu erwarten sind. Die gedrosselte Einleitung über ein "
                "Regenrückhaltebecken mit Vorreinigung begrenzt den Eintrag auf den natürlichen "
                "Gebietsabfluss und wahrt die Bewirtschaftungsziele.",
            ),
        ],
    },
]


async def get_or_create_norm(conn: asyncpg.Connection, name: str, paragraph_nr: int) -> int:
    row = await conn.fetchrow(
        "SELECT norm_id FROM normen WHERE name = $1 AND paragraph_nr = $2", name, paragraph_nr
    )
    if row:
        return row["norm_id"]
    return await conn.fetchval(
        "INSERT INTO normen (full_text, name, paragraph_nr) VALUES ($1, $2, $3) RETURNING norm_id",
        f"§ {paragraph_nr} {name}", name, paragraph_nr,
    )


async def main() -> None:
    texts = [c[2] for d in DECISIONS for c in d["chunks"]]
    client = AsyncOpenAI(base_url=BASE_URL, api_key=API_KEY)
    resp = await client.embeddings.create(model=EMBED_MODEL, input=texts, dimensions=EMBED_DIM)
    embeddings = [d.embedding for d in resp.data]
    print(f"Embedded {len(embeddings)} chunks.")

    conn = await asyncpg.connect(
        host=DB_HOST, port=DB_PORT, user="postgres", password=DB_PASSWORD, database="jura-db"
    )
    emb_iter = iter(embeddings)
    total_chunks = 0
    try:
        async with conn.transaction():
            doc_ids = [d["doc_id"] for d in DECISIONS]
            await conn.execute("DELETE FROM document_norm_link WHERE doc_id = ANY($1::text[])", doc_ids)
            await conn.execute("DELETE FROM chunks WHERE doc_id = ANY($1::text[])", doc_ids)
            await conn.execute("DELETE FROM documents WHERE doc_id = ANY($1::text[])", doc_ids)
            sec = 0
            for d in DECISIONS:
                await conn.execute(
                    """
                    INSERT INTO documents
                        (doc_id, gericht, spruchkoerper, aktenzeichen, entsch_datum, doktyp,
                         mitwirkung, titelzeile, leitsatz)
                    VALUES ($1, $2, $3, $4, $5, $6, '', $7, $8)
                    """,
                    d["doc_id"], d["gericht"], d["spruchkoerper"], d["aktenzeichen"],
                    date.fromisoformat(d["entsch_datum"]), d["doktyp"], d["titelzeile"], d["leitsatz"],
                )
                for name, paragraph_nr, text in d["chunks"]:
                    sec += 1
                    emb = next(emb_iter)
                    vec = "[" + ",".join(f"{x:.6f}" for x in emb) + "]"
                    chunk_id = await conn.fetchval(
                        """
                        INSERT INTO chunks
                            (doc_id, text, embedding, section_title, section_number, section_text,
                             chunk_index, start_char, end_char, section_length, is_complete_section, is_part_of)
                        VALUES ($1, $2, $3::vector, 'Entscheidungsgruende', $4, $2, 0, 0, $5, $5, true, NULL)
                        RETURNING chunk_id
                        """,
                        d["doc_id"], text, vec, str(sec), len(text),
                    )
                    norm_id = await get_or_create_norm(conn, name, paragraph_nr)
                    await conn.execute(
                        "INSERT INTO document_norm_link (doc_id, chunk_id, norm_id) VALUES ($1, $2, $3)",
                        d["doc_id"], chunk_id, norm_id,
                    )
                    total_chunks += 1
                print(f"  {d['doc_id']}: {len(d['chunks'])} chunks")
    finally:
        await conn.close()
    print(f"DONE. {len(DECISIONS)} decisions, {total_chunks} linked Entscheidungsgruende chunks.")


if __name__ == "__main__":
    asyncio.run(main())
