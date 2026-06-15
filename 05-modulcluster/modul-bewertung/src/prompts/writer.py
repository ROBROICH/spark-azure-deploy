"""Prompt for the Writer (Stage 3) — one prompt per chapter with Chain-of-Verification."""

from __future__ import annotations

from dataclasses import dataclass
from textwrap import dedent

from prompt_injection.prompt_defense import render_prompt_format, wrap_system_prompt

from src.prompts.system import SYSTEM_PROMPT

CHAPTER_WRITER_SYSTEM_PROMPT = wrap_system_prompt(SYSTEM_PROMPT + dedent("""

    Du schreibst ein Kapitel einer rechtlichen Begründung.

    === AUFGABE MIT CHAIN-OF-VERIFICATION ===

    Arbeite in 4 Schritten:

    ## SCHRITT 1: ENTWURF
    Schreibe einen ersten Entwurf des Kapitels als kompaktes Markdown mit:
    - Saubere und Nachvollziehbare Argumentation mit strukturierten Stichpunkte für schnelle Erfassung
    - Stringenz ist wichtig
    - Jeder Stichpunkt soll in sich geschlossen verständlich sein
    - Alle bewertungsrelevanten Infos aus den zugeordneten Quellen
    - JEDE faktische Sachverhaltsdarstellung muss mit [xxxx] belegt sein
    - Mehre SVM-IDs in einem Stichpunkt müssen einzeln referenziert werden e.g.[0024][0036]                                                                    
    - Setze die Zielsetzung sauber um unter Berücksichtigung der Gesamtgliederung
    - Saubere deutsche Sprache
    - NICHT erzählen oder narrativ
    - Verwende in der Praxis übliche Formulierungs-/Ergebnisformeln
    - Stelle sicher, dass die rechtliche Argumentation erkennbar, nachvollziehbar und präzise ist
    - Wenn die zugeordneten Quellen das Kapitelziel nicht vollständig abdecken, kannst du (wenn notwendig) auf diese Hinweisen. NIEMALS fehlende Informationen erfinden.

    ## SCHRITT 2: VERIFIKATIONS-FRAGEN
    Beantworte jede Schritt für Schritt diese Prüffragen zum Entwurf:
    - [ ] Ist die Argumentation vollständig, verständlich und schnell nachvollziehbar?
    - [ ] Wurden NUR SVM-IDs aus der Liste "Verfügbare IDs" verwendet?
    - [ ] Ist JEDE Sachaussage mit mindestens einer [xxxx] belegt?
    - [ ] Geht deine Aussage tatsächlich aus den zugeordneten Quellen hervor, oder könnte sie eine Halluzination/falsche Interpretation sein?
    - [ ] Hast du den Sachverhalt präzise wiedergegeben?
    - [ ] Sind alle relevanten Informationen aus den Quellen berücksichtigt?
    - [ ] Ist der Aufbau prüflogisch sauber und dem Kapitelziel entsprechend?
    - [ ] Gibt es nichtssagende Standardfloskeln, die entfernt werden sollten?
    - [ ] Sind die zugeordneten Sachverhaltsinformationen wirklich relevant für das Kapitel?
    - [ ] Ist die Argumentation rechtlich präzise, übersichtlich und verständlich?
    - [ ] Machst du dich mit deinem Ergebnis angreifbar? (zu starke Formulierung, Falsche interpretation, behauptung ohne SVM-Beleg, etc.)
    - [ ] Verwendest du in der Praxis von Behörden übliche Formulierungs-/Ergebnisformeln?
    - [ ] Verwendest du nichtssagende Sätze oder Teilsätze?

    ## SCHRITT 3: KORREKTUR
    Falls Probleme identifiziert wurden:
    - Überarbeite die Argumentation um sie verständlicher und nachvollziehbarer
    - Entferne nicht belegte Aussagen oder ergänze fehlende Belege
    - Korrigiere falsche Darstellungen und Fehler
    - Ersetze ungültige SVM-IDs durch korrekte aus der verfügbaren Liste
    - Formuliere absolute Aussagen konditional um, wenn nötig
    - Entferne Floskeln und narrative Elemente und stärke die inhaltliche Substanz und Prägnanz
    - Verwende Stringenzhinweise wenn nötig um die Argumentation zu schärfen

    ## SCHRITT 4: FINALE AUSGABE
    Gib das finale, verifizierte JSON aus.

    GUARDRAILS:
    - Rechtlich präzise, aber verständlich formulieren
    - Absolute Formulierungen nur wenn es direkt aus dem Sachverhalt hervorgeht, ansonsten konditional formulieren
    - Rechtliche Sorgfaltspflicht ausüben: Jede Info muss aus Sachverhalt belegt sein
    - Halluzinationen sind inakzeptabel
    - Vermeide nichtssagende Standardfloskeln

    ANTWORTFORMAT:
    Schreibe zuerst deinen Denkprozess (Schritte 1-3), dann das finale JSON.
    Das JSON MUSS in einem ```json Code-Block stehen!

    Schritt 1 - Entwurf:
    (Dein erster Entwurf des Kapitels)

    Schritt 2 - Verifikation:
    (Prüffragen mit ✓ oder ✗)

    Schritt 3 - Korrekturen:
    (Falls nötig)


    FORMAT Markdown (Beispiel):
    ## {kapitel_titel}

     **Aspekt 1**:
     Kurze Erläuterung [0001]
      - Detail-Stichpunkt [0002]
      - Detail-Stichpunkt [0003]
    **Aspekt 2**:
     Kurze Erläuterung [0004]

    ERGEBNIS JSON:
    ```json
    {
      "markdown": "## {kapitel_titel}\\n\\n**Aspekt 1**:\\nKurze Erläuterung [0001]\\n- Detail-Stichpunkt [0002]\\n- Detail-Stichpunkt [0003]\\n\\n**Aspekt 2**:\\nKurze Erläuterung [0004]",
      "used_svm_ids": ["0001", "0002", "0003", "0004"]
    }
    ```

    KRITISCH:
    - Inline Referenzen im markdown müssen einzeln in eigene Klammern gesetzt werden, z.B. Richtig: [0024][0036] statt Falsch: [0024, 0036]
    - used_svm_ids als 4-stellige IDs wie in exact this format "0001"
    - NUR IDs aus der Liste "Verfügbare IDs" verwenden!
    - Das markdown-Feld muss gültiges Markdown enthalten
    - Newlines im markdown als \\n escapen
    """))

CHAPTER_WRITER_USER_PROMPT = dedent("""\
    TBM (zu prüfendes Tatbestandsmerkmal):
    {tbm}

    NORM: {norm}

    === GESAMTGLIEDERUNG (Kontext) ===
    {gliederung_kontext}

    === DIESES KAPITEL ===
    Titel: {kapitel_titel}
    Ziel: {kapitel_ziel}
    {unterkapitel_info}

    === QUELLEN FÜR DIESES KAPITEL ===
    Verfügbare IDs: {available_ids}

    {external_data_tag_open}
    {chunks_text}
    {external_data_tag_close}""")


ERGEBNIS_WRITER_SYSTEM_PROMPT = wrap_system_prompt(SYSTEM_PROMPT + dedent("""

    Du schreibst das abschließende ERGEBNIS-Kapitel einer rechtlichen Begründung.
    Ziel: Kompakte, präzise abschließende Bewertung — KEIN ausführlicher Roman, KEINE Wiederholung der Kapitelinhalte.

    === AUFGABE MIT CHAIN-OF-VERIFICATION ===

    Du schreibst das ERGEBNIS-Kapitel — die abschließende Gesamtbewertung, wie sie in rechtlichen Prüfungen und Planfeststellungsverfahren üblich ist.

    Das Kapitel soll:
    1. Die zentralen Erkenntnisse und Kernargumente aus den vorherigen Kapiteln destillieren
    2. Das Prüfergebnis klar ableiten, benennen und nachvollziehbar begründen
    3. Eine in sich geschlossene, abschließende Würdigung darstellen
    4. Zusätzlich eine KURZFORM der Gesamtbewertung im Urteilsstil erstellen (separates JSON-Feld)
    5. Ein URTEIL ableiten — die abschließende Einschätzung, ob das TBM erfüllt ist

    URTEIL (Pflichtfeld im JSON):
    Du MUSST auf Basis der Sachverhaltsinformationen ein abschließendes Urteil bestimmen. Berücksichtige alle Informationen aus den Sachverhalten und die dargestellte Argumentation. Erlaubte Werte:
    - "erfuellt" — Aus den Sachverhaltsinformationen ergibt sich, dass das TBM erfüllt ist
    - "nicht_erfuellt" — Aus den Sachverhaltsinformationen ergibt sich, dass das TBM nicht erfüllt ist
    - "nicht_beurteilbar" — In den Sachverhaltsinformationen fehlt eine klare Aussage zur Erfüllung des TBM.

    KURZFORM (Urteilsstil):
    - 5-8 Sätze, die das Ergebnis eigenständig verständlich zusammenfassen
    - Urteilsstil: Das Ergebnis ZUERST nennen, dann die tragende Begründungslinie komprimiert darstellen
    - Stringenzhinweise einfügen, wenn sie für die Einordnung der Gesamtargumentation notwendig sind (z.B. Einschränkungen, Vorbehalte, Abhängigkeiten von Maßnahmen)
    - Sachaussagen mit [xxxx] belegen
    - Muss in sich geschlossen und ohne Verweis auf die Langform verständlich sein
    - Juristisch präzise und unangreifbar formulieren

    STILREGELN:
    - KOMPAKT: Eine abschließende Bewertung, kein ausführlicher Roman. Jeder Satz muss Substanz haben.
    - FREI IN DER FORM: Fließtext, Stichpunkte, oder gemischt — wähle die Form die für den Inhalt am besten passt. Orientiere dich an dem Stil der für rechtliche Gesamtbewertungen in Planfeststellungsverfahren typisch ist.
    - KEINE NACHERZÄHLUNG: Die vorherigen Kapitel nicht nochmal durchgehen — nur die Essenz destillieren und zum Ergebnis führen.
    - KEINE NEUEN ARGUMENTE: Nur was in den vorherigen Kapiteln steht, darf einfließen.
    - BELEGT: Sachaussagen mit [xxxx] belegen.

    Arbeite in 4 Schritten:

    ## SCHRITT 1: ENTWURF
    Schreibe eine abschließende Gesamtbewertung:
    - Bestimme das abschließende Urteil basierend auf allen Sachverhaltsinformationen
    - Destilliere die Kernargumente aus den vorherigen Kapiteln
    - Leite das Ergebnis nachvollziehbar her
    - Benenne das Prüfergebnis klar und eindeutig
    - Begründe das Ergebnis
    - Belege Sachaussagen mit [xxxx]
    - Verwende in der Praxis übliche und angemessene Formulierungs-/Ergebnisformeln, die nicht angreifbar sind
    - Sei stringent in deiner Argumentation
    - Berücksichtige Informationslücken aus den vorherigen Kapiteln: Wenn wesentliche Sachverhaltsaspekte nicht belegt werden konnten, kann dies bei Relevanz in die Ergebnis-Einordnung und ggf. in das Urteil einfließen

    ## SCHRITT 2: VERIFIKATIONS-FRAGEN
    - [ ] Ist das Prüfergebnis klar benannt und eindeutig?
    - [ ] Ist die Begründung nachvollziehbar aus den Kernargumenten hergeleitet?
    - [ ] Sind die Kernargumente tatsächlich die wichtigsten aus den vorherigen Kapiteln?
    - [ ] Ist das Kapitel kompakt und frei von Nacherzählungen?
    - [ ] Ist JEDE Sachaussage mit [xxxx] belegt?
    - [ ] Wurden NUR IDs aus "Verfügbare IDs" verwendet?
    - [ ] Gibt es Floskeln oder Füllsätze die gestrichen werden können?
    - [ ] Machst du dich angreifbar? (zu starke Formulierung, fehlender Beleg, falsche Interpretation)
    - [ ] Liest sich das Ergebnis wie eine professionelle rechtliche Gesamtbewertung?
    - [ ] Ist das Urteil konsistent mit dem Ergebnis-Text und der Kurzform?
    - [ ] Ist das Urteil exakt einer der erlaubten Werte: "erfuellt", "nicht_erfuellt", "nicht_beurteilbar"?

    ## SCHRITT 3: KORREKTUR
    - Verwende eine juristisch saubere Formulierung, die nicht angreifbar ist
    - Kürze überflüssige Passagen
    - Entferne Floskeln und Wiederholungen
    - Schärfe die Begründung des Ergebnisses
    - Korrigiere ungültige SVM-IDs
    - Ergebnis MUSS gültiges Markdown sein

    ## SCHRITT 4: FINALE AUSGABE
    Gib das finale JSON aus.

    ANTWORTFORMAT:
    Schreibe zuerst deinen Denkprozess (Schritte 1-3), dann das finale JSON.
    Das JSON MUSS in einem ```json Code-Block stehen!

    FORMAT Markdown (Beispiel):
    ## {kapitel_titel}

    ... finale Gesamtbewertung...

    ERGEBNIS JSON:
    ```json
    {
      "markdown": "## {kapitel_titel}\\n\\n... finale Bewertungstexte mit Belegen ...",
      "used_svm_ids": ["0001", "0002", "0003"],
      "kurzform": "Juristisch typische Ergebnisformel und eine komprimierte Kurzbegründung in 3-5 Sätzen +  (Optional Stringenzhinweis in eigenem Abschnitt zur Einordnung der Begründung)",
      "urteil": "erfuellt|nicht_erfuellt|nicht_beurteilbar"
    }
    ```

    KRITISCH:
    - Inline Referenzen im markdown müssen einzeln in eigene Klammern gesetzt werden, z.B. Richtig: [0024][0036] statt Falsch: [0024, 0036]     
    - used_svm_ids als 4-stellige IDs wie "0001", "0053"
    - NUR IDs aus der Liste "Verfügbare IDs" verwenden!
    - Das markdown-Feld muss gültiges Markdown enthalten
    - HALTE DICH KURZ. Qualität > Quantität.
    - Die kurzform MUSS 5-8 Sätze im Urteilsstil enthalten — Ergebnis zuerst, dann Begründungslinie
    - Das urteil-Feld ist PFLICHT und MUSS exakt einer der Werte "erfuellt", "nicht_erfuellt" oder "nicht_beurteilbar" sein
    """))

ERGEBNIS_WRITER_USER_PROMPT = dedent("""\
    TBM (zu prüfendes Tatbestandsmerkmal):
    {tbm}

    NORM: {norm}

    === GESAMTGLIEDERUNG (Kontext) ===
    {gliederung_kontext}

    === BISHERIGE KAPITEL (vollständiger Text) ===
    {external_data_tag_open}
    {previous_chapters_text}
    {external_data_tag_close}

    === DIESES KAPITEL ===
    Titel: {kapitel_titel}
    Ziel: {kapitel_ziel}
    {unterkapitel_info}

    === ZUSÄTZLICHE QUELLEN FÜR DIESES KAPITEL ===
    Verfügbare IDs: {available_ids}

    {external_data_tag_open}
    {chunks_text}
    {external_data_tag_close}""")


@dataclass(frozen=True)
class ChapterPromptContext:
    """Alle Daten, die für den Prompt eines Kapitels benötigt werden."""

    satz_text: str
    norm: str
    gliederung_kontext: str
    kapitel_titel: str
    kapitel_ziel: str
    unterkapitel_info: str
    available_ids: list[str]
    chunks_text: str
    previous_chapters_text: str | None = None


def build_chapter_writer_prompt(ctx: ChapterPromptContext) -> str:
    """Build the user prompt for a regular chapter."""
    return render_prompt_format(
        CHAPTER_WRITER_USER_PROMPT,
        tbm=ctx.satz_text,
        norm=ctx.norm,
        gliederung_kontext=ctx.gliederung_kontext,
        kapitel_titel=ctx.kapitel_titel,
        kapitel_ziel=ctx.kapitel_ziel,
        unterkapitel_info=ctx.unterkapitel_info,
        available_ids=", ".join(ctx.available_ids),
        chunks_text=ctx.chunks_text,
    )


def build_ergebnis_writer_prompt(ctx: ChapterPromptContext) -> str:
    """Build the user prompt for the result chapter."""
    return render_prompt_format(
        ERGEBNIS_WRITER_USER_PROMPT,
        tbm=ctx.satz_text,
        norm=ctx.norm,
        gliederung_kontext=ctx.gliederung_kontext,
        previous_chapters_text=ctx.previous_chapters_text or "",
        kapitel_titel=ctx.kapitel_titel,
        kapitel_ziel=ctx.kapitel_ziel,
        unterkapitel_info=ctx.unterkapitel_info,
        available_ids=", ".join(ctx.available_ids) if ctx.available_ids else "Keine",
        chunks_text=ctx.chunks_text,
    )
