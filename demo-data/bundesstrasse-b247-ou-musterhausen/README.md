# Testfall „Bundesstraße B 247 — Ortsumgehung Musterhausen"

Ein zusammenhängender, **fiktiver** Testfall für ein Planfeststellungsverfahren einer
Bundesstraße (Bundesfernstraße). Er liefert Eingabedaten für mehrere Module der Plattform in
einem konsistenten Vorhaben.

> **Hinweis:** Alle Orts-, Personen-, Flur-, Akten- und Fristangaben sind frei erfunden und folgen
> der im Repository üblichen Synthetik-Konvention (`Muster*` / `Beispiel*`, vgl.
> [`modul-bewertung/test-data/artificial_example_input.json`](../../../../05-modulcluster/modul-bewertung/test-data/artificial_example_input.json)).
> Struktur, Sprache und Rechtsbezüge sind realen Planfeststellungsbeschlüssen für
> Bundesfernstraßen nachgebildet. Die zitierten Normtexte (§ 41 BImSchG, § 2 der 16. BImSchV,
> § 1 Abs. 2 der 16. BImSchV) sind wortgetreu der amtlichen Fassung entnommen.

## Das Vorhaben in Kürze

| Merkmal | Angabe |
|---------|--------|
| Vorhaben | Neubau der B 247, Ortsumgehung Musterhausen, Bau-km 0+000–6+820 |
| Land / Kreis | Thüringen (fiktiv verortet), Landkreis Musterstadt |
| Vorhabenträgerin | Bundesrepublik Deutschland, vertreten durch die DEGES |
| Behörde | Landesverwaltungsamt — Referat Planfeststellung |
| Kenngrößen | ~6,8 km, RQ 11, V = 100 km/h, Prognose-DTV 2040 ~12.800 Kfz/24h |
| Hauptkonflikte | Verkehrslärm (16. BImSchV), Artenschutz (§ 44 BNatSchG), Gewässer (WHG), FFH-Vorprüfung, Landwirtschaft |

## Dateiübersicht

```
bundesstrasse-b247-ou-musterhausen/
├── README.md                              ← diese Datei
├── dokumente/                             ← Rohdokumente (zum Hochladen ins DMS)
│   ├── 00_Inhaltsverzeichnis.md           ← Unterlagenverzeichnis (für TOC-Finder/-Matching)
│   ├── 01_Erlaeuterungsbericht.md
│   ├── 02_Planfeststellungsbeschluss.md   ← Haupt-„Testdokument" (PFB, reverse-engineered)
│   ├── 03_Schalltechnische_Untersuchung.md
│   ├── 04_Artenschutzbeitrag_saP.md
│   ├── 05_Grunderwerbsverzeichnis.md
│   └── 06_UVP-Bericht_Zusammenfassung.md
├── dokumente-pdf/                         ← dieselben Dokumente als PDF (generiert)
├── B247-OU-Musterhausen_Planunterlagen.zip ← ZIP mit allen 7 PDFs (Frontend-Upload)
├── build_pdf_zip.py                       ← erzeugt PDFs + ZIP aus dokumente/*.md neu
├── document_types.json                    ← Soll-Dokumenttypen für die formale Prüfung
├── risikohinweiser/
│   └── pfb_chapters.json                  ← Liste von PFBChapter (Risikohinweiser-Input)
└── bewertung/
    └── bewertung_input_laermschutz.json   ← BewertungsWorkflowInput (16. BImSchV)
```

## Verwendung je Modul

### 1) Modul Formale Vollständigkeitsprüfung (`modul-formale-pruefung`)

- `document_types.json` enthält die straßenspezifischen Soll-Dokumenttypen (Teil A/B/C).
  Es ist kompatibel mit dem `LLMMatchingWorkflow` und dem Format aus
  [`data/document_types_sample.json`](../../../../05-modulcluster/modul-formale-pruefung/data/document_types_sample.json).
- `dokumente/00_Inhaltsverzeichnis.md` ist ein globales Unterlagenverzeichnis und eignet sich,
  um den **Inhaltsverzeichnis-Finder/-Matching** auszulösen.
- Über den Quick-Start-Lauf (siehe unten) lassen sich die Dokumente ins DMS laden und gegen die
  Soll-Typen klassifizieren.

### 2) Modul Risikohinweiser (`modul-risikohinweiser`)

- `risikohinweiser/pfb_chapters.json` ist ein Array von `PFBChapter` (`id`, `title`, `text`),
  exakt passend zum Eingabetyp des `RiskCheckerWorkflow`
  (siehe [`src/schemas/workflow.py`](../../../../05-modulcluster/modul-risikohinweiser/src/schemas/workflow.py)).
- Der Workflow verarbeitet **ein Kapitel pro Lauf**. Beispiel (Temporal Web UI):
  - Task Queue: `risikohinweiser`
  - Workflow Type: `RiskCheckerWorkflow`
  - Data: ein einzelnes Objekt aus dem Array, z. B.:
    ```json
    { "id": "30000000-0000-4000-e000-000000000009",
      "title": "B.6 Abwägung – Einwendungen zum Lärmschutz",
      "text": "Mehrere Anwohner des Wohngebiets ..." }
    ```
- Die Kapitel sind Auszüge aus `dokumente/02_Planfeststellungsbeschluss.md`.

### 3) Modul Bewertung (`modul-bewertung`)

- `bewertung/bewertung_input_laermschutz.json` ist ein vollständiger `BewertungsWorkflowInput`
  (siehe [`temporal/.../bewertung/types.py`](../../../../04-shared-services/temporal/src/temporal/workflows/bewertung/types.py)).
- Geprüfte Norm: **§ 2 Abs. 1 Nr. 2 der 16. BImSchV** (Immissionsgrenzwerte für allgemeine
  Wohngebiete, 59/49 dB(A)) mit vier atomaren Tatbestandsmerkmalen.
- Die `originaltexte` (SVM-Chunks) stammen aus der Schalltechnischen Untersuchung und dem
  Erläuterungsbericht und tragen das Ergebnis **„erfüllt"** (Grenzwerte durch aktiven Schallschutz
  eingehalten).

### 4) Frontend-Upload („Verfahren anlegen" → Dokumente)

Der Upload über die Oberfläche erwartet ein **ZIP mit PDF-Dateien**. Dafür liegt die fertige
Datei `B247-OU-Musterhausen_Planunterlagen.zip` (sieben Dokumente als PDF) bereit.

Stammdaten für den Dialog „Verfahren anlegen":

| Feld | Wert |
|------|------|
| Verfahrensname | B 247 – Ortsumgehung Musterhausen |
| Art | Fernstraße |
| Bundesland | Thüringen |
| Antragseingang | 02/05/2023 |
| Aktenzeichen | PF-B247-OU-Musterhausen/2023 |
| Antragsteller | Bundesrepublik Deutschland, vertreten durch die DEGES |

### 5) Quick-Start-Lauf (DMS-Upload per Skript)

```bash
# Dokumente in den Upload-Ordner kopieren
cp dokumente/* ../../uploads/          # Zielordner: scripts/quick_start/uploads/
cp document_types.json ../../document_types.json

# Danach gemäß scripts/quick_start/README.md fortfahren (Testrun / upload_testrun.sh)
```

> Die `.md`-Dateien sind die Quelle der Wahrheit und gut lesbare Stellvertreter. Die PDFs in
> `dokumente-pdf/` und das ZIP werden daraus mit `build_pdf_zip.py` erzeugt
> (`uv run --with markdown python build_pdf_zip.py`; einmalig ggf.
> `uv run playwright install chromium`). Für die textbasierte LLM-Klassifikation ist der reine
> Textinhalt maßgeblich — die PDFs enthalten auswählbaren Text.

## Eingebaute Qualitätsmängel (für das Modul Risikohinweiser)

Damit der Risiko-Pipeline echte Befunde gelingen, enthalten einzelne PFB-Kapitel bewusst
angreifbare Stellen:

| Kapitel | Eingebauter Mangel | Erwartetes Kriterium |
|---------|--------------------|----------------------|
| A.3.4 Nebenbestimmungen Artenschutz | unbestimmte Begriffe („zeitnah", „im erforderlichen Umfang"), fehlende konkrete Fristen/Normverankerung | BESTIMMTHEIT, NORM_VERANKERUNG |
| A.5 Entscheidung über Einwendungen | pauschale Zurückweisung ohne Einzelfallbezug | WUERDIGUNGSTIEFE |
| B.6 Abwägung Lärmschutz | Floskeln („zeitnah und soweit möglich"), pauschales Überwiegen | BESTIMMTHEIT, ABWAEGUNGSSORGFALT |
| B.7 Abwägung Artenschutz | „vertiefte Auseinandersetzung … entbehrlich", geringe Würdigungstiefe | WUERDIGUNGSTIEFE, ARG_SYSTEMATIK |

## Herkunft / öffentliche Quellen

Der Testfall wurde anhand öffentlich zugänglicher Quellen synthetisiert (keine Übernahme realer
Verfahrensinhalte):

- **Normtexte (wörtlich):** § 41 BImSchG sowie § 1 Abs. 2 und § 2 der 16. BImSchV
  (Verkehrslärmschutzverordnung), gesetze-im-internet.de.
- **Verfahrensstruktur:** Wikipedia „Planfeststellung" (§§ 72–78 VwVfG, § 17 FStrG,
  Konzentrationswirkung § 75 VwVfG, Rechtsbehelfe nach VwGO/UmwRG).
- **Realer Projektkontext (als Vorbild, nicht übernommen):** B 247 in Thüringen
  (Ortsumgehungen Großengottern/Mühlhausen, DEGES-ÖPP, Unstrut-Hainich-Kreis), Wikipedia
  „Bundesstraße 247".
- **Format der Soll-Dokumenttypen:** angelehnt an
  `modul-formale-pruefung/data/document_types_sample.json`.
- **Format des Bewertungs-Inputs:** angelehnt an
  `modul-bewertung/test-data/artificial_example_input.json`.
