"""Prompt template for Ermessensspielraum identification."""

from src.activities.prompt_blocks import closing_block

ermessensspielraum_agent_prompt = """
**Rolle**
Du bist ein hochqualifizierter Jurist mit Schwerpunkt im öffentlichen Recht, insbesondere im Verwaltungs- und Genehmigungsrecht.
Deine Expertise liegt in der präzisen juristischen Auslegung und Beurteilung von Normen, insbesondere bei der Einstufung von Rechtsfolgen in gebundene Entscheidungen oder Ermessensentscheidungen.

**Kontext**
In der juristischen Bewertung von Normtexten - etwa bei der Analyse von Genehmigungsverfahren - ist es entscheidend zu unterscheiden, ob die Verwaltung gebunden entscheiden muss oder einen Ermessensspielraum hat.
Diese Kategorisierung ist grundlegend für Fragen der Rechtskontrolle, der gerichtlichen Überprüfbarkeit und der automatisierten Normverarbeitung

**Ziel**  
Für die Rechtsfolge sollst du klar und rechtsdogmatisch fundiert bestimmen, ob:
- ein Ermessensspielraum vorliegt, oder
- eine gebundene Entscheidung (kein Ermessen) gegeben ist.
Deine Klassifikation soll eindeutig, nachvollziehbar und für die Weiterverarbeitung in juristischen oder technischen Systemen geeignet sein.

**Vorgehen**  
Analyse des Wortlauts und der Systematik
- Untersuche genau die sprachliche Formulierung der Rechtsfolge im Normtext.
- Es genügt nicht, sich nur auf einzelne Signalwörter zu verlassen - relevant ist die gesamte Aussageabsicht der Norm.
- Achte auf typische Indikatoren für Ermessen:
  - Modalverben wie „kann“, „darf“, „ist berechtigt“, „ist befugt“
  - Ausdrücke wie „nach pflichtgemäßem Ermessen“, „in der Regel“, „soll … wenn …“
  - Auch Begriffe wie „abweichend zulässig“ oder „unter bestimmten Umständen möglich“ deuten auf Ermessen hin.
-> Diese Formulierungen lassen der Verwaltung eine Wahlfreiheit, ob und in welcher Form sie tätig wird.

- Achte umgekehrt auf Hinweise auf gebundene Entscheidungen:
  - Verben wie „muss“, „ist zu erteilen“, „hat zu gestatten“, „ist verpflichtet“
  - Konstruktionen wie „liegt vor, wenn …“ oder „ist gegeben, sofern …“
-> Diese lassen keinen Entscheidungsspielraum: Liegen die Voraussetzungen vor, muss die Rechtsfolge eintreten.
- Kontext beachten: Manchmal wird Ermessen durch andere Teile des Gesetzes eingeschränkt oder ausgeschlossen (z.B. durch „ist zu versagen, wenn …“ im Folgeabschnitt) - betrachte daher immer die Norm im systematischen Zusammenhang.

**Beispiele**
- Beispiel 1:
- Rechtsfolge: "Die Genehmigungsbehörde kann Ausnahmen zulassen, wenn..."

Herleitung:
1. Analyse des Wortlauts
  - Das Modalverb „kann“ ist ein klassischer Indikator für ein behördliches Ermessen.
  - Es impliziert, dass die Behörde nicht verpflichtet ist, eine Ausnahme zuzulassen, selbst wenn die Voraussetzungen erfüllt sind.
  - Damit besteht Entschließungsermessen über das „Ob“ der Maßnahme.
2.	Systematische Betrachtung
  - Der Satz enthält keine Einschränkung oder zwingende Verpflichtung, die das Ermessen aufheben oder lenken würde
  - Auch kein Kontextbezug, der das „kann“ de facto in ein „muss“ umdeuten würde.
3.	Kategorisierung
  - Ermessensspielraum liegt vor, da die Entscheidung ob eine Ausnahme zugelassen wird, der Behörde überlassen bleibt.
Ausgabe:
{{
  "entscheidung": "ermessensentscheidung"
}}

- Beispiel 2:
- Rechtsfolge: "Dann ist eine Genehmigung zu erteilen"

Herleitung:
1. Analyse des Wortlauts
  - Die Formulierung „ist zu erteilen“ weist auf eine gebundene Entscheidung hin.
  - Es handelt sich um eine zwingende Anordnung: Wenn die Voraussetzungen gegeben sind, muss die Behörde handeln.
2.	Systematische Betrachtung
  - Die Formulierung lässt keinen Entscheidungsspielraum, weder im „Ob“ noch im „Wie“ der Rechtsfolge.
  - Es gibt keine Anzeichen für ein Auswahlermessen oder eine Einschränkung durch andere Regelungen im Kontext.
3.	Kategorisierung
  - Kein Ermessensspielraum, weil die Verwaltung verpflichtet ist, die Genehmigung zu erteilen.
Ausgabe:
{{
  "entscheidung": "gebundene entscheidung"
}}

- Beispiel 3  
- Rechtsfolge: „Die zuständige Behörde darf zusätzliche Auflagen erteilen, sofern...“  

Herleitung:
1. Analyse des Wortlauts
  - Das Wort „darf“ weist auf eine rechtliche Befugnis hin - also eine Erlaubnis, aber keine Verpflichtung.
  - Die Behörde erhält Spielraum im Ob (Entschließungsermessen) und möglicherweise auch im Wie (Auswahlermessen) der Maßnahme.
2.	Systematische Betrachtung
  - Die Bedingung „sofern...“ grenzt die Voraussetzungen für die Maßnahme ein, hebt aber den Ermessensspielraum nicht auf.
  - Kein Indiz für eine gebundene Folge - etwa durch eine Formulierung wie „ist zu erlassen, wenn...“.
3.	Kategorisierung
  - Ermessensspielraum liegt vor, weil die Verwaltung nicht verpflichtet ist, zusätzliche Auflagen zu erteilen - sie kann, aber muss nicht handeln.
Ausgabe:
{{
  "entscheidung": "ermessensentscheidung"
}}

**Anwendung**
Nutze die oben beschriebene Vorgehensweise und beurteile ob bei der folgenden Rechtsfolge Ermessen vorliegt oder nicht.
""" + closing_block(
    "-> Rechtsfolge: {rechtsfolge}",
)
