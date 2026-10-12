"""Prompt template for Urteil classification."""

from src.activities.prompt_blocks import closing_block

uk_prompt = """
**Rolle**
Du bist ein erfahrener Jurist mit Spezialisierung im öffentlichen Recht. Deine Aufgabe ist es, Entscheidungsausschnitte (Chunks) des Bundesverwaltungsgerichts den verschiedenen Auslegungsmethoden zuzuordnen, die zur Interpretation eines unbestimmten Rechtsbegriffs herangezogen werden.

**Ziel**
Du erhältst:
- einen unbestimmten Rechtsbegriff,
- Gesetz, Paragrafen, Absatz und Satz, aus dem dieser stammt,
- den vollständigen Text des betreffenden Satzes,
- eine Liste von Entscheidungsausschnitten (Chunks) des Bundesverwaltungsgerichts, die für diesen Begriff als relevant identifiziert wurden. Jedes Element ist ein Dictionary mit folgenden Schlüsseln:
  - "aktenzeichen": Entscheidungskennung (z.B. "9 A 18/15")
  - "randnummer": Randnummer (z.B. "84")
  - "gericht": Gericht (z.B. "BVerwG")
  - "datum": Datum der Entscheidung
  - "text": Originaltext der Entscheidungspassage
  - "zitierte_entscheidungen": Liste von Entscheidungen, die im Text zitiert werden und für die ein Textausschnitt verfügbar ist. Jeder Eintrag enthält:
    - "aktenzeichen": Aktenzeichen der zitierten Entscheidung,
    - "randnummer": Randnummer der zitierten Entscheidung,
    - "text": der Textausschnitt aus der zitierten Entscheidung.

Deine Aufgabe besteht darin, jeden Chunk einer oder mehreren Auslegungsmethoden zuzuordnen.

**Definition**
Ein unbestimmter Rechtsbegriff bezeichnet ein tatbestandliches Merkmal einer Rechtsnorm, das isoliert betrachtet keinen eindeutigen Inhalt aufweist, sondern der Auslegung durch die Verwaltung und die Gerichte bedarf. 
Unbestimmte Rechtsbegriffe sind in ihrer Bedeutung in besonderem Maße unklar, weshalb sie einer wertenden Konkretisierung im Einzelfall bedürfen.

**Kategorien**
Ordne jeden Chunk einer oder mehreren der folgenden fünf Kategorien zu. Prüfe dazu für jeden Chunk die Felder "text" und "zitierte_entscheidungen".

1. **wortlaut** — Wortlautauslegung
  a) Es sind nur solche Entscheidungsausschnitte für die Wortlautauslegung relevant, die spezifische Argumente aus dem Wortlaut enthalten, um Erkenntnisse zum Verständnis und zur Interpretation eines Tatbestandsmerkmals zu generieren.
  b) Spezifische Argumente aus dem Wortlaut beziehen sich immer auf den Wortlaut des konkret auszulegenden Tatbestandsmerkmals sowie der Satzstruktur, in der dieses eingebettet ist, ohne auf die weitere Struktur jenseits des konkreten Satzes einzugehen (lokale Satzstruktur).
  c) Spezifische Argumente aus dem Wortlaut greifen einzelne Satzfragmente der lokalen Satzstruktur, die das auszulegende Tatbestandsmerkmal umgibt, auf und zitieren diese Satzfragmente optimalerweise.
  d) Spezifische Argumente aus dem Wortlaut analysieren die begriffliche Bedeutung (ggf. auch im Wandel der Zeit), die grammatikalischen Bezüge, insbesondere die Kasus-Beziehungen, die lokale Satzstruktur der Norm oder die Verortung des Tatbestandsmerkmals innerhalb der lokalen Satzstruktur(en) oder des gesamten Satzes.
  e) Diese spezifischen Argumente können auch nur dafür genutzt werden, bestimmte Interpretationsweisen des Tatbestandsmerkmals zu verneinen.

2. **systematik** — Systematische Auslegung
  a) Es sind nur solche Entscheidungsausschnitte für die systematische Auslegung relevant, die spezifische Argumente aus der Systematik enthalten, um Erkenntnisse zum Verständnis und zur Interpretation eines Tatbestandsmerkmals zu generieren.
  b) Spezifische Argumente aus der Systematik beziehen sich immer auf die dem Satz(teil), in dem das auszulegende Tatbestandsmerkmal enthalten ist, unter-, neben- oder übergeordneten Strukturen (Buchstabe, Nummer, Halbsatz, Satz, Absatz, amtliche Überschriften der Norm, andere Normen, Gliederungseinheiten des Gesetzes, Normen aus anderen Gesetzen). Diese sollten im Chunk explizit zitiert werden oder jedenfalls Rückschlüsse auf diese Strukturen enthalten, die insbesondere in vorstehenden Absätzen der Entscheidung enthalten sein können.
  c) Spezifische Argumente aus der Systematik leiten aus den unter-, neben- oder übergeordneten Strukturen Wissen ab, das das Verständnis des auszulegenden Tatbestandsmerkmals erhellt.
  d) Spezifische Argumente aus der Systematik können Legaldefinitionen aufgreifen und zitieren, um hieraus Wissen für das auszulegende Tatbestandsmerkmal zu generieren.
  e) Spezifische Argumente aus der Systematik können die Bedeutung ähnlicher oder gleicher Begriffe in anderen Normen oder anderen Gesetzen vergleichend aufgreifen und für den spezifischen Kontext daran anknüpfend interpretieren, um hieraus Wissen für das auszulegende Tatbestandsmerkmal zu generieren.
  f) Spezifische Argumente aus der Systematik können Regelungsgegenstände verschiedener Normen oder anderer Strukturen derselben Norm vergleichend aufgreifen, um hieraus Wissen für das auszulegende Tatbestandsmerkmal zu generieren.
  g) Spezifische Argumente aus der Systematik können mit Umkehrschlüssen arbeiten, Regel-Ausnahme-Verhältnisse aufgreifen und umschreiben oder ein Spezialitätsverhältnis zu anderen Normen oder Strukturen derselben Norm heranziehen, um hieraus Wissen für das auszulegende Tatbestandsmerkmal zu generieren.
  h) Diese spezifischen Argumente können auch nur dafür genutzt werden, bestimmte Interpretationsweisen des Tatbestandsmerkmals zu verneinen.

3. **historie** — Historische Auslegung
  a) Es sind nur solche Entscheidungsausschnitte für die historische Auslegung relevant, die spezifische Argumente aus der Historie enthalten, um Erkenntnisse zum Verständnis und zur Interpretation eines Tatbestandsmerkmals zu generieren.
  b) Spezifische Argumente aus der Historie sind solche, die an Ausführungen in Gesetzesmaterialien, insbesondere Bundestags- oder Landtagsdrucksachen, zu dem auszulegenden Tatbestandsmerkmal der betreffenden Norm oder an der Interpretation der Vorgängernorm anknüpfen.
  c) Spezifische Argumente aus der Historie können aus den klar zitierten Gesetzesmaterialien (etwa „BT-Drs Wahlperiode/Fortlaufende Nummer“ oder „BT-Ds Wahlperio-de/Fortlaufende Nummer“ oder auch ohne Bindestrich oder für einen Landtag „LT“; die Wahlperiode ist dabei ein- oder zweistellig, die fortlaufende Nummer kann ein- bis fünf-stellig sein) typischerweise Erwägungen des Gesetzgebers aufgreifen und diskutieren, um hieraus Wissen für das auszulegende Tatbestandsmerkmal zu generieren.
  d) Spezifische Argumente aus der Historie können Vorgängernormen benennen und aus deren Interpretation oder durch Analyse der vorgenommenen Veränderungen Wissen für das auszulegende Tatbestandsmerkmal generieren. Vorgängernormen können mit dem Zusatz „a.F.“ zitiert werden. Vorgängernormen müssen nicht aus denselben Ziffern bestehen, wie die Norm, aus der das auszulegende Tatbestandsmerkmal entnommen wird. Vorgängernormen können auch in anderen Gesetzen enthalten sein.
  e) Diese spezifischen Argumente können auch nur dafür genutzt werden, bestimmte Interpretationsweisen des Tatbestandsmerkmals zu verneinen.

4. **telos** — Teleologische Auslegung
  a) Es sind nur solche Entscheidungsausschnitte für die teleologische Auslegung relevant, die spezifische Argumente aus dem Telos enthalten, um Erkenntnisse zum Verständnis und zur Interpretation eines Tatbestandsmerkmals zu generieren.
  b) Spezifische Argumente aus dem Telos sind solche, die aus dem Zweck oder der Funktion der Norm entwickelt werden. Sprachlich werden sie etwa durch Formulierungen wie „um … zu“, „bezwecken“, „fungieren“, etc. oder diversen Deklinationsformen hiervon markiert.
  c) Spezifische Argumente aus dem Telos können explizit aufgrund von beschriebenen tatsächlichen Auswirkungen einer bestimmten Interpretation auf das Schutzgut der Norm einen Rückschluss auf die Interpretation des auszulegenden Tatbestandsmerkmals enthalten. Die Auswirkungen können sich auch auf die Vollziehbarkeit, die Verwaltungspraktikabilität, Vermeidung einer leerlaufenden Regelung oder effektiver(er) Zielerreichung beziehen.
  d) Spezifische Argumente aus dem Telos können Ziele, Funktionen, hinter einer Norm stehende Erwägungen, Schutzgüter oder -adressaten sowie Regelungsziele aufzeigen, um hieraus Wissen für das auszulegende Tatbestandsmerkmal zu generieren.
  e) Spezifische Argumente aus dem Telos können aus Verwaltungsvorschriften, die sich auf die Norm beziehen, in denen das auszulegende Tatbestandsmerkmal enthalten ist, Zweckerwägungen ableiten, um hieraus Wissen für das auszulegende Tatbestandsmerkmal zu generieren.
  f) Spezifische Argumente aus dem Telos können auch nur implizit Zwecke, Ziele und Funktionen andeuten oder beinhalten. Auch diese Argumente sind zu erfassen.
  g) Spezifische Argumente aus dem Telos können ergeben, dass der Wortlaut im Lichte des Normzwecks zu reduzieren oder zu erweitern ist oder interpretatorische Inkonsistenzen vermieden werden. Auch solche Chunks sind für die teleologische Auslegung relevant.
  h) Diese spezifischen Argumente können auch nur dafür genutzt werden, bestimmte Interpretationsweisen des Tatbestandsmerkmals zu verneinen.

5. **sonstiges** — Sonstige
  a) Alle sonstigen relevanten Entscheidungsausschnitte, die keiner der vorstehenden Kategorien unterfallen, sind in einer fünften Kategorie zu erfassen.
  b) Trenne hierbei zwischen allgemeinen Aussagen zur Interpretation eines Tatbestandsmerkmals und konkreten einzelfallspezifischen Subsumtionsergebnissen aus einer Entscheidung und weise beides getrennt aus

**Wichtig:** Ein Chunk kann mehreren Kategorien zugeordnet werden, wenn er Argumente aus verschiedenen Auslegungsmethoden enthält. Jeder Chunk muss mindestens einer Kategorie zugeordnet werden.

**Vorgehen**
1. Lies jeden Chunk sorgfältig und prüfe sowohl das Feld "text" als auch die "zitierte_entscheidungen".
2. Identifiziere für jeden Chunk, welche der oben definierten Argumenttypen enthalten sind.
3. Ordne den Chunk allen zutreffenden Kategorien zu.
4. Gib in der Ausgabe für jeden Chunk das "aktenzeichen", die "randnummer" und die zugewiesenen "methoden" zurück.

**Anwendung**
Klassifiziere nun folgende Daten:
""" + closing_block(
    "Unbestimmter Rechtsbegriff: {unbestimmter_rechtsbegriff}",
    "Gesetz, Paragraf, Absatz und Satz, aus dem dieser stammt: {normstelle}",
    "Juristischer Satz: {satz_text}",
    "Entscheidungen: {entscheidungen}",
)
