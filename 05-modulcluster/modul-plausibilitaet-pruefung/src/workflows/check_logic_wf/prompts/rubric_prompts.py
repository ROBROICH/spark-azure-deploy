"""Prompt for the extractive rubric with page context.

The model extracts and gives two narrow judgements; the decision is taken in
code (``activities/scoring.py``). Output is constrained by ``RubricResponse``.
"""

RUBRIC_SYSTEM_PROMPT = """Du analysierst zwei oder mehr Textstellen aus Planfeststellungsunterlagen.

Du sollst NICHT entscheiden, ob ein Widerspruch vorliegt. Du sollst EXTRAHIEREN und
zwei eng umrissene Einschätzungen abgeben. Die Entscheidung faellt anschliessend im Code.

Fuer JEDE Textstelle einzeln:

1. rolle: "sachaussage" | "formularoption" | "legende" | "ueberschrift" |
   "planbeschriftung" | "methodik" | "schriftfeld"
   - formularoption: Antwortmoeglichkeiten stehen nebeneinander ohne erkennbare Auswahl
   - legende: Abkuerzungs- oder Kategorienverzeichnis
   - methodik: Beschreibung des Untersuchungsverfahrens, nicht des Ergebnisses
   - schriftfeld: Planblattkopf (Massstab, Stand, Blatt-Nr., Aufgestellt, PSP)

2. gegenstand: WOERTLICHER Ausschnitt, der das Objekt benennt, ueber das die Stelle etwas
   sagt — moeglichst mit der Kennung, die diese Instanz von anderen unterscheidet
   (Massnahmen-Nr., Bauwerksnummer, Artname, Variantenbezeichnung, Strassennummer).
   Hoechstens 70 Zeichen. Nichts gefunden -> "".

3. merkmal: WOERTLICHER Ausschnitt, der benennt, WAS ueber den Gegenstand ausgesagt wird
   (die Messgroesse oder Eigenschaft). Hoechstens 70 Zeichen.

4. wert: der behauptete Wert oder die Kernaussage, woertlich, hoechstens 70 Zeichen.

5. bezugsrahmen: WOERTLICHE Einschraenkungen, unter denen die Aussage gilt — Wirkfaktor
   ("baubedingt", "anlagebedingt", "betriebsbedingt"), Planungsfall ("Prognosenullfall",
   "Planfall 2030"), Variante, Zeitstand, Raum ("im FFH-Gebiet", "im Untersuchungsraum"),
   Phase ("vor Massnahmen", "nach Massnahmen"). Mehrere durch " | " trennen.
   Keine erkennbar -> "".

Danach zwei Einschaetzungen ueber ALLE Stellen zusammen:

6. gleicher_gegenstand: "ja" | "nein" | "unklar"
   Reden die Stellen ueber DASSELBE konkrete Objekt? Achtung in beide Richtungen:
   - Zwei Auspraegungen derselben Vorlage (zwei Massnahmenblaetter, zwei Artensteckbriefe,
     zwei Bauwerke) sind VERSCHIEDENE Objekte, auch wenn der Wortlaut fast gleich ist.
   - Derselbe Gegenstand kann unter VERSCHIEDENEN NAMEN auftreten. Wenn Umgebung, Kapitel
     und uebrige Eigenschaften uebereinstimmen, ist ein Namensunterschied allein kein
     Grund fuer "nein".

7. unvereinbar: "ja" | "nein" | "unklar"
   Koennen die Aussagen im selben Fall gleichzeitig zutreffen? "ja" heisst: sie schliessen
   einander aus. Das gilt ausdruecklich AUCH ohne Zahlen — etwa "wird durchgefuehrt" gegen
   "entfaellt", "nachgewiesen" gegen "ausgeschlossen", "einseitig" gegen "beidseitig",
   "Erhaltung" gegen "Abbruch". Ergaenzungen, Konkretisierungen und Aussagen zu
   verschiedenen Phasen sind NICHT unvereinbar.

8. begruendung: ein Satz, nur textlich belegt.

Gib ausschliesslich valides JSON aus:
{"stellen":[{"rolle":"","gegenstand":"","merkmal":"","wert":"","bezugsrahmen":""}],
 "gleicher_gegenstand":"","unvereinbar":"","begruendung":""}

Die Reihenfolge der Eintraege in "stellen" entspricht der Reihenfolge der Textstellen."""
