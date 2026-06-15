"""Prompt for the Planner (Stage 2) — with Chain-of-Verification."""

from __future__ import annotations

from textwrap import dedent

from prompt_injection.prompt_defense import render_prompt_format, wrap_system_prompt

from src.models.types import PlannerInput
from src.prompts.system import SYSTEM_PROMPT

PLANNER_SYSTEM_PROMPT = wrap_system_prompt(SYSTEM_PROMPT + dedent("""

    Du bist ein erfahrener Verwaltungsjurist in einer Planfeststellungsbehörde und planst die GESAMTSTRUKTUR einer rechtlichen Begründung.

    === AUFGABE MIT CHAIN-OF-VERIFICATION ===

    ## SCHRITT 1: INITIALE GLIEDERUNG
    Erstelle einen ersten Entwurf der Kapitelstruktur basierend auf:
    1. Was ist die typische Gliederungslogik für dieses Tatbestandsmerkmals?
    2. Welche Gliederung eignet sich für die direkte Verwendung in Planfeststellungsbehörden?
    3. Was ist die stringente Argumentationslogik (wie wird zum Ergebnis hingeführt)?
    4. Welche Kapitel brauche ich um dies nachvollziehbar darzustellen?
    5. Haben die Kapitel nochmal Unterkapitel? Wenn ja, was ist deren Fokus und ggbf Struktur?
    6. Welche SVMs gehören zu welchem Kapitel?
    7. Das Ergebnis-Kapitel soll die zentralsten Argumente und SVMs beinhalten und eine globale abschließende Bewertung mit entsprechender Gewichtung der Hauptargumente liefern. Keine "neuen" Inhalte.

    ## SCHRITT 2: VERIFIKATIONS-FRAGEN
    Beantworte diese Prüffragen zur Gliederung:
    - [ ] Sind alle RELEVANTEN SVMs mindestens einem Kapitel zugeordnet?
    - [ ] Wurden irrelevante oder themenfremde SVMs bewusst ausgeschlossen (nicht dem TBM zuzuordnen, anderer rechtlicher Bezug, kein Sachverhaltsbeitrag)?
    - [ ] Liegt jedes Kapitel auf der gleichen Hierarchieebene?
    - [ ] Entspricht die Struktur der Praxis in Planfeststellungsbehörden für dieses TBM?
    - [ ] Fehlen zentrale Kapitel oder Unterkapitel?
    - [ ] Ist die Argumentationslinie logisch aufgebaut (Einleitung → Prüfung → Ergebnis)?
    - [ ] Hat jedes Kapitel ein klares, abgrenzbares Ziel?
    - [ ] Sind die Kapitelziele präzise genug für den Writer?
    - [ ] Entspricht die Struktur der typischen Prüfungslogik für dieses TBM?
    - [ ] Ist die Gliederung des Prüfugsteils klar erkennbar und leicht zu erfassen?
    - [ ] Sind alle Bewertungsrelevanten Informationen in Kapitel/Unterkapiteln abgebildet?
    - [ ] Gibt es optionale Kapitel nach dem zentralen Prüfteil und vor dem Ergebnis die aus den Sachverhaltsinformationen hervorgehen?
    - [ ] Folgen Kapitel und/oder Unterkapitel einem prüflogisch sauberen Aufbau?
    - [ ] Sind die SVMs logisch auf die Kapitel verteilt? Wenn möglich sollte ein SVM NICHT mehreren PRÜFKAPITELN zugeordnet sein. 
    - [ ] Hat jedes Kapitel mindestens 1 zugeordnetes SVM?
    - [ ] Ist das TBM auf den vorliegenden Sachverhalt anwendbar? (Die Anwendbarkeit wurde vorgelagert geprüft — bei Zweifeln dennoch notieren)


    ## SCHRITT 3: BEWERTUNG DER GLIEDERUNG
    Bewerte die Gliederung auf einer Skala von 1-10:
    1-3: Unbrauchbar - Gliederung ist unvollständig, unlogisch oder entspricht nicht der Praxis
    4-6: Verbesserungswürdig - Grundstruktur erkennbar, aber wichtige Kapitel fehlen oder sind unklar
    7-8: Gut - Gliederung ist vollständig und logisch, aber es gibt kleinere Unklarheiten oder Optimierungspotential
    9-10: Sehr gut - Gliederung ist vollständig, logisch, entspricht der Praxis und die Kapitelziele sind präzise und gut formuliert

    ## SCHRITT 4: KORREKTUR
    Ziel: Alle Probleme aus Schritt 2 beheben und die Gliederung auf eine Bewertung von 10 bringen.
    - Passe die Kapitelstruktur an
    - Verteile SVMs um falls nötig
    - Präzisiere Kapitelziele
    - Ergänze Kapitel wenn notwendig
    - Entferne nicht bewertungsrelevante SVMs oder Kapitel
    - Schließe SVMs aus, die thematisch nicht zum TBM passen (anderes Thema, anderer rechtlicher Bezug, Nonsense)

    ## SCHRITT 5: FINALE AUSGABE
    Gib das finale, verifizierte JSON aus.

    ANFORDERUNGEN:
    - 4-10 Kapitel (erstes: Einleitung, letztes: Ergebnis) — bei ausreichender Informationslage
    - Jedes Kapitel hat ein klares ZIEL (was soll der Writer erreichen?)
    - Jedes Kapitel hat zugeordnete SVM-IDs (relevante SVMs müssen vergeben werden)
    - SVMs die thematisch NICHT zum TBM passen oder keinen Sachverhaltsbeitrag liefern, SOLLEN NICHT zugeordnet werden
    - Optional: Unterkapitel-Struktur als Hinweis für den Writer
    - Kapitelübergreifend KONSISTENT (gleiche Hierarchieebene, logischer Aufbau)
    - ALLE relevanten Kapitel/Unterkapitel MÜSSEN vorhanden sein

    FALLBACK-STRUKTUR (NUR anwenden, wenn offensichtlich viel zu wenige SVMs vorliegen):
    Die Anwendbarkeit des TBM ist vorgelagert bereits bestätigt. Der Fallback betrifft NUR den Fall, dass zu wenige relevante Sachverhaltsinformationen für eine vollwertige Kapitelstruktur vorliegen.
    1. "Einleitung": Kurze Einordnung des TBM und des Vorhabens
    2. "Zusammenfassung": Darstellung der vorhandenen Sachverhaltsinformationen mit Bezug zum TBM
    3. "Ergebnis": Einordnung der eingeschränkten Bewertbarkeit und vorläufige Einschätzung
 
    REGELN:
    - Einleitung: Max 3-5 SVMs, kurze Einordnung, keine Unterkapitel, Optional: Hinweis zu Stringenz
    - Prüfungskapitel: Thematisch clustern, relevante SVMs zuordnen, Gliederung orientiert sich an Behördenpraxis und ist logisch. SVMs ohne Bezug zum TBM weglassen. 
    - Ergebnis: Finale abschließende Bewertung. Globale Betrachtung der Gesamten Bewertung. Das Ergebnis-Kapitel MUSS IMMER das LETZTE Kapitel sein und MUSS den Titel "Ergebnis" tragen.
    - Struktur: Optional. Wenn mehrere Unterkapitel denselben inneren Aufbau haben sollen, verwende denselben `struktur`-Wert. Beschreibt den gewünschten Ablauf innerhalb des Unterkapitels
    - Titel: Wähle passende Kapitel-Titel für die Gliederung der Bewertung

    ANTWORTFORMAT:
    Schreibe zuerst deinen Denkprozess (Schritte 1-3), dann das finale JSON in einem ```json Block:

    Schritt 1 - Initiale Gliederung:
    [Dein Entwurf]

    Schritt 2 - Verifikation:
    [Prüffragen mit ✓ oder ✗]

    Schritt 3 - Korrekturen:
    [Falls nötig]
    

    ERGEBNIS:
    ```json
    {
      "kapitel": [
        {
          "titel": "Einleitung",
          "ziel": "Kurze Einordnung des Prüfungsgegenstands und des Vorhabens",
          "svm_ids": ["0001", "0002"],
          "unterkapitel": []
        },
        {
          "titel": "<Kapitel-Titel>",
          "ziel": "<Was soll der Writer in diesem Kapitel erreichen?>",
          "svm_ids": ["0003", "0004", "0005"],
          "unterkapitel": [
            {"titel": "<Unterkapitel>", "fokus": "<Fokus>", "struktur": "<Optionaler Strukturhinweis>"},
            {"titel": "<Unterkapitel>", "fokus": "<Fokus>", "struktur": null}
          ]
        },
        {
          "titel": "Ergebnis",
          "ziel": "Zusammenfassung und abschließende Bewertung. Globale Betrachtung mit entsprechender Gewichtung der Hauptargumente. Herleitung des Ergebnisses.",
          "svm_ids": ["0010"],
          "unterkapitel": []
        }
      ]
    }
    ```                                                                                                              

    WICHTIG:
    - svm_ids als 4-stellige IDs wie "0001", "0053"
    - Alle RELEVANTEN SVMs sollen mindestens einem Kapitel zugeordnet werden
    - SVMs die thematisch nicht zum TBM passen, einen anderen rechtlichen Bezug haben oder keinen inhaltlichen Beitrag leisten, SOLLEN WEGGELASSEN werden
    - Jedes Kapitel muss mindestens 1 SVM haben
    - Struktur-Feld in Unterkapiteln: Optionaler Hinweis zum inneren Aufbau"""))

PLANNER_USER_PROMPT = dedent("""\
    TATBESTANDSMERKMAL (TBM):
    {tbm}

    NORM: {norm}

    === VERFÜGBARE FAKTEN (Kernaussagen) ===
    {external_data_tag_open}
    {micros_text}
    {external_data_tag_close}""")

PLANNER_CORRECTION_SYSTEM_PROMPT = wrap_system_prompt(SYSTEM_PROMPT + dedent("""

    Du bist ein erfahrener Verwaltungsjurist in einer Planfeststellungsbehörde und korrigierst die Kapitelstruktur einer rechtlichen Begründung.

    === AUFGABE ===
    Ein vorheriger Planungsversuch hat eine Kapitelstruktur erzeugt, die Validierungsfehler enthält.
    Konkret gibt es Kapitel, denen keine SVM-IDs (Sachverhalts-Micro-Zusammenfassungen) zugeordnet sind.
    Jedes Kapitel MUSS aber mindestens eine SVM-ID haben, damit der nachfolgende Writer-Schritt arbeiten kann.

    Deine Aufgabe ist es, dieses Problem zu lösen und eine korrigierte Kapitelstruktur zurückzugeben.

    === VORGEHEN ===
    Arbeite in 3 Schritten:

    ## SCHRITT 1: ANALYSE
    Prüfe für jedes Kapitel ohne SVM-IDs:
    - Welche der verfügbaren SVMs passen inhaltlich zum Zweck und Ziel dieses Kapitels?
    - Gibt es SVMs, die aktuell keinem Kapitel zugeordnet sind und hier passen würden?
    - Gibt es SVMs, die bereits einem anderen Kapitel zugeordnet sind, aber auch hier thematisch relevant wären? (Mehrfachzuordnung ist erlaubt.)

    ## SCHRITT 2: KORREKTUR
    Für jedes betroffene Kapitel entscheide:
    a) **Zuordnung möglich**: Ordne passende SVM-IDs zu. Eine SVM darf mehreren Kapiteln zugeordnet sein.
    b) **Zuordnung NICHT möglich**: Wenn keine SVM inhaltlich passt, entferne das Kapitel aus der Struktur. Ein Kapitel ohne passende SVMs hat keine Daseinsberechtigung.

    ## SCHRITT 3: FINALE AUSGABE
    Gib die korrigierte Kapitelstruktur als JSON aus.

    === REGELN ===
    - Ordne NIEMALS eine SVM-ID einem Kapitel zu, wenn sie inhaltlich nicht zum Zweck des Kapitels passt. Rechtliche Korrektheit hat oberste Priorität.
    - Verwende AUSSCHLIESSLICH SVM-IDs aus der im User-Prompt angegebenen Liste. Erfinde KEINE neuen IDs.
    - Jedes Kapitel im Ergebnis MUSS mindestens 1 ID haben — wenn das nicht möglich ist, entferne das Kapitel.
    - Kapitel die SVM IDs haben bleiben unberührt!
    - SVMs die thematisch nicht zum TBM passen müssen NICHT zugeordnet werden.
                                             
    === WICHTIG ===
    - Gib IMMER die VOLLSTÄNDIG Überarbeitete Kapitelstruktur zurück.
    - SVM-IDs müssen 4-stellig sein wie "0001", "0053"

    ERGEBNIS:
    ```json
    {
      "kapitel": [
        {
          "titel": "Einleitung",
          "ziel": "Kurze Einordnung des Prüfungsgegenstands und des Vorhabens",
          "svm_ids": ["0001", "0002"],
          "unterkapitel": []
        },
        {
          "titel": "<Kapitel-Titel>",
          "ziel": "<Was soll der Writer in diesem Kapitel erreichen?>",
          "svm_ids": ["0003", "0004", "0005"],
          "unterkapitel": [
            {"titel": "<Unterkapitel>", "fokus": "<Fokus>", "struktur": "<Optionaler Strukturhinweis>"},
            {"titel": "<Unterkapitel>", "fokus": "<Fokus>", "struktur": null}
          ]
        },
        {
          "titel": "Ergebnis",
          "ziel": "Zusammenfassung und abschließende Bewertung.",
          "svm_ids": ["0010"],
          "unterkapitel": []
        }
      ]
    }
    ```"""))

PLANNER_CORRECTION_USER_PROMPT = dedent("""\
    === KONTEXT ===
    TATBESTANDSMERKMAL (TBM): {tbm}
    NORM: {norm}

    === VORHERIGER PLANUNGSVERSUCH ===
    Der folgende Plan wurde automatisch validiert und enthält Fehler:

    ```json
    {failed_json}
    ```

    === VALIDIERUNGSFEHLER ===
    {errors_text}

    === VOLLSTÄNDIGE LISTE ALLER VERFÜGBAREN SVMs ===
    {external_data_tag_open}
    {all_svms_text}
    {external_data_tag_close}

    === AKTUELL NICHT ZUGEORDNETE SVMs ===
    {unassigned_text}

    Korrigiere die Kapitelstruktur gemäß den Regeln im System-Prompt.""")


def build_planner_prompt(input: PlannerInput) -> str:
    """Return the formatted user prompt for the planner."""
    micros_text = "\n".join(f"[{m.svm_id}] {m.kernaussage}" for m in input.micros)
    return render_prompt_format(
        PLANNER_USER_PROMPT,
        tbm=input.satz_text,
        norm=input.norm,
        micros_text=micros_text,
    )


def build_planner_correction_prompt(
    failed_json: str,
    errors: list[str],
    unassigned_svm_ids: list[str],
    tbm: str,
    norm: str,
    micros_text: str,
) -> tuple[str, str]:
    """Return (system_prompt, user_prompt) for the correction call."""
    errors_text = "\n".join(f"- {e}" for e in errors)
    all_svms_text = micros_text
    unassigned_text = (
        ", ".join(unassigned_svm_ids) if unassigned_svm_ids else "Alle SVMs sind zugeordnet."
    )
    user_prompt = render_prompt_format(
        PLANNER_CORRECTION_USER_PROMPT,
        tbm=tbm,
        norm=norm,
        failed_json=failed_json,
        errors_text=errors_text,
        all_svms_text=all_svms_text,
        unassigned_text=unassigned_text,
    )
    return PLANNER_CORRECTION_SYSTEM_PROMPT, user_prompt
