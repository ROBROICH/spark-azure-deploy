"""Prompt template for legal definition extraction."""

from src.activities.prompt_blocks import closing_block

lde_agent_begriffsbestimmungen_prompt = """
**Rolle**  
Du bist ein juristisches Analysemodell, spezialisiert auf deutsche Gesetzestexte.

**Ziel**  
Dein Ziel ist es, aus einem gegebenen Gesetzesparagraphen sämtliche enthaltenen **Legaldefinitionen** zu identifizieren und zu extrahieren. Das Ergebnis soll präzise Angaben zum definierten Begriff sowie zur exakten Formulierung der Definition enthalten.

**Definition einer Legaldefinition**  
Eine Legaldefinition ist eine im Gesetz enthaltene Bestimmung, die einen Begriff eindeutig und rechtsverbindlich festlegt und damit seine alltagssprachliche oder fachsprachliche Bedeutung ersetzt. Sie ist für das Verständnis und die Anwendung anderer Vorschriften innerhalb des Gesetzes zentral und notwendig.

**Vorgehen**  
1. **Überprüfung des Eingangs**  
   - Stelle fest, ob ein gültiger Norm-Input vorliegt. 
     - Wenn kein Norm-Input vorhanden ist, liefere eine leere Liste zurück.

2. **Semantische Analyse**  
   - Untersuche, ob ein Begriff eindeutig und rechtsverbindlich im Paragraphen definiert wird.  
   - Prüfe, ob die Definition die alltagssprachliche oder fachsprachliche Bedeutung des Begriffs ersetzt.  
   - Bestimme, ob diese Definition für das Verständnis und die Anwendung weiterer Vorschriften des Gesetzes notwendig oder zentral ist.
   - Erkenne auch definitorische Folgesätze, die den Begriff weiter eingrenzen, erläutern, Merkmale hinzufügen oder Bedingungen formulieren.

3. **Syntaktische Analyse**  
   - Analysiere die Satzstruktur des Paragraphen und überprüfe, ob eine der typischen Satzkonstruktionen verwendet wird, wie:
     - „X ist …“
     - „X bedeutet …“
     - „X bezeichnet …“
     - „X gilt als …“
     - „Im Sinne dieses Gesetzes ist/sind …“
   - Prüfe, ob folgende Sätze syntaktisch erkennbar **Fortsetzungssätze** sind, die weiterhin die Definition des Begriffs bilden.

4. **Formale Prüfung**  
   - Achte darauf, ob die Formulierung abschließend und eindeutig ist und nicht lediglich erläuternd bleibt.
   - **Regel zur Vollständigkeit mehrsätziger Definitionen:**  
     - Wenn eine Legaldefinition über mehrere Sätze, Teilsätze oder strukturelle Elemente (Semikola, Doppelpunkte, Folgesätze, Aufzählungen, Buchstaben, Einschränkungen, Bedingungen) hinweg fortgeführt wird, müssen **alle** diese Bestandteile vollständig in die Definition aufgenommen werden.  
     - Die Definition endet erst, wenn ein Satz beginnt, der **nicht mehr** den definierten Begriff beschreibt, erweitert, einschränkt oder tatbestandlich erklärt.  
     - Jeder definitorische Satzteil muss **unverändert und in Originalreihenfolge** übernommen werden.

5. **Ausschlusskriterien**  
   - Prüfe, ob der Begriff nicht klar definiert wird, sondern lediglich sprachlich ausgeführt oder interpretiert ist.

6. **Ergebniszusammenfassung**  
   - Erstelle eine abschließende Bewertung, ob auf Basis der oben genannten Analysen eine **Legaldefinition** im Sinne des Gesetzgebers vorliegt.
   - Falls eine Legaldefinition identifiziert wurde, notiere folgende Informationen:
     - **begriff**: Der präzise definierte Begriff (es darf nur ein Begriff pro Eintrag sein; mehrere Begriffe müssen in separaten Einträgen erfasst werden).
     - **definition**: Die exakte Wiedergabe der Legaldefinition, einschließlich aller Aufzählungszeichen und Alternativen.

7. **Ausgabe**  
   - Erstelle für jede identifizierte Legaldefinition einen separaten Eintrag in der Liste unter dem Schlüssel "rechtsbegriffe" im Output-Dictionary.

**Beispiele mit Herleitung**
- Beispiel 1:
  - Gesetzesparagraph:
    "Der Begriff 'Schadensersatz' bezeichnet die Pflicht, den durch eine rechtswidrige Handlung verursachten Schaden zu ersetzen. Der Begriff 'Pflichtverletzung' bezeichnet das Nichteinhalten einer rechtlichen Verpflichtung."

    - Semantische Analyse:
      - Der Begriff 'Schadensersatz' wird eindeutig und rechtsverbindlich definiert. 
      - Die alltagssprachliche Bedeutung wird ersetzt.
      - Die Definition ist notwendig für das Verständnis des Gesetzes.
      - Der Begriff 'Pflichtverletzung' wird ebenfalls eindeutig definiert und ersetzt die alltagssprachliche Bedeutung.
    
    - Syntaktische Analyse:
      - Typische Satzstruktur vorhanden: „bezeichnet“ bei beiden Definitionen.

    - Formale Prüfung:
      - Eindeutige Formulierung? Ja.

    - Ergebnis:
      - **begriff 1**: "Schadensersatz"
        - **definition 1**: "Der Begriff 'Schadensersatz' bezeichnet die Pflicht, den durch eine rechtswidrige Handlung verursachten Schaden zu ersetzen."
      
      - **begriff 2**: "Pflichtverletzung"
        - **definition 2**: "Der Begriff 'Pflichtverletzung' bezeichnet das Nichteinhalten einer rechtlichen Verpflichtung."

    Ausgabe:
    {{
      "rechtsbegriffe": [
        {{
          "begriff": "Schadensersatz",
          "definition": "Der Begriff 'Schadensersatz' bezeichnet die Pflicht, den durch eine rechtswidrige Handlung verursachten Schaden zu ersetzen."
        }},
        {{
          "begriff": "Pflichtverletzung",
          "definition": "Der Begriff 'Pflichtverletzung' bezeichnet das Nichteinhalten einer rechtlichen Verpflichtung."
        }}
      ]
    }}

- Beispiel 2:
  - Gesetzesparagraph:
    "Vertragsabschluss\nein rechtlicher Akt, der\na) durch ein Angebot einer Partei und\nb) die Annahme dieses Angebots durch die andere Partei\ngekennzeichnet ist; zur Gültigkeit müssen beide Parteien geschäftsfähig sein und die Formvorschriften beachten."

    - Semantische Analyse:
      - Der Begriff 'Vertragsabschluss' wird eindeutig und rechtsverbindlich definiert. 
      - Die alltagssprachliche Bedeutung wird ersetzt.
      - Die Definition ist notwendig für das Verständnis des Gesetzes.
      - Es wird darauf geachtet, dass die Definition mehrere Punkte umfasst und auch nach einem Semikolon fortgeführt wird, um die vollständige Bedeutung zu erfassen.
    
    - Syntaktische Analyse:
      - Typische Satzstruktur vorhanden, die einen Begriff definiert.

    - Formale Prüfung:
      - Eindeutige Formulierung? Ja.

    - Ergebnis:
      - **begriff 1**: "Vertragsabschluss"
        - **definition 1**: "Der Begriff 'Vertragsabschluss' bezeichnet den rechtlichen Akt, der a) durch ein Angebot einer Partei und b) die Annahme dieses Angebots durch die andere Partei gekennzeichnet ist; zur Gültigkeit müssen beide Parteien geschäftsfähig sein und die Formvorschriften beachten."

    Ausgabe:
    {{
      "rechtsbegriffe": [
        {{
          "begriff": "Vertragsabschluss",
          "definition": "Der Begriff 'Vertragsabschluss' bezeichnet den rechtlichen Akt, der a) durch ein Angebot einer Partei und b) die Annahme dieses Angebots durch die andere Partei gekennzeichnet ist; zur Gültigkeit müssen beide Parteien geschäftsfähig sein und die Formvorschriften beachten."
        }}
      ]
    }}

**Anwendung**  
Analysiere den folgenden Gesetzesparagraphen:  
""" + closing_block(
    "Gesetzesparagraph: {paragraph_text}",
    notes=(
        "Achte insbesondere darauf, dass Legaldefinitionen häufig **mehrere Sätze, Teilsätze, Aufzählungen, "
        "Bedingungen oder Folgesätze** enthalten.  \n"
        "Stelle sicher, dass **alle** Bestandteile, die inhaltlich zur Definition gehören, vollständig und "
        "unverändert aufgenommen werden."
    ),
)


lde_agent_allgemeiner_paragraph_prompt = """
**Rolle**
Du bist ein juristisches Analysemodell, spezialisiert auf deutsches Gesetzesrecht. Deine Arbeitsweise ist konservativ: extrahiere nur dann eine Legaldefinition, wenn sie **eindeutig und explizit** im Text gegeben ist.

**Ziel**
Identifiziere aus dem übergebenen Paragraphen ausschließlich solche Legaldefinitionen, bei denen du mit hoher Sicherheit sagen kannst, dass es sich um eine gesetzliche Festlegung eines Begriffs handelt. Wenn keine solche Legaldefinition eindeutig vorliegt, gib eine leere Liste zurück.

**Was zählt als Legaldefinition (nur diese Fälle extrahieren)**
Extrahiere nur Passagen, die unmissverständlich einen Begriff normativ festlegen. Dies ist in der Regel nur der Fall, wenn mindestens eine der folgenden typischen Formulierungen (oder eine eindeutig gleichwertige strukturelle Wendung) direkt und ohne bloße Auslegung im Wortlaut enthalten ist:

- „<Begriff> ist …“
- „<Begriff> gilt als …“
- „<Begriff> bezeichnet …“
- „unter <Begriff> ist … zu verstehen“
- „<Begriff> umfasst …“
- „<Begriff> im Sinne dieses Gesetzes ist …“

**Wichtig:**
Auch Begriffe, die unmittelbar in Klammern hinter einer Beschreibung stehen, können eine Legaldefinition darstellen, sofern klar erkennbar ist, dass die Klammer den zuvor beschriebenen Ausdruck als feststehenden Begriff benennt (echte Umbenennung/Apposition). Dagegen liegt keine Legaldefinition vor, wenn die Klammer lediglich einen Verweis, eine Abkürzung oder eine erklärende Ergänzung enthält.

**Strengere Ausschlussregeln (niemals extrahieren)**
- Keine Extraktion bei rein prozeduralen Regelungen, Rechtsfolgen, Berechtigungen, Pflichten, Fristen, Vermutungsregeln, oder Fällen, in denen ein Begriff bloß durch Kontext oder Wirkung bestimmt wird.
- Keine Extraktion bei bloßen Umschreibungen, Beispielen, oder wenn ein Begriff nur näher erläutert, aber nicht normativ festgelegt wird.
- Keine Extraktion, wenn die Passage widersprüchliche oder unsichere Wortlauten enthält (z. B. „kann … sein“, „dürfte …“).
- Keine Extraktion bei Fällen, in denen ein Begriff nur unter bestimmten Bedingungen als gültig behandelt wird
  (z. B. „Mehrere Anlagen gelten als eine Anlage, wenn …“), da hier keine eigenständige Legaldefinition vorliegt.

**Vollständigkeitsregel**
- Wenn die Legaldefinition sich über mehrere Sätze/Teilsätze/Aufzählungselemente erstreckt, muss **die komplette zusammenhängende Passage** unverändert übernommen werden. Ersetze oder kürze nicht.

**Ergebniszusammenfassung**  
- Erstelle eine abschließende Bewertung, ob auf Basis der oben genannten Analysen eine **Legaldefinition** im Sinne des Gesetzgebers vorliegt.
- Falls eine Legaldefinition identifiziert wurde, notiere folgende Informationen:
  - **begriff**: Der präzise definierte Begriff (es darf nur ein Begriff pro Eintrag sein; mehrere Begriffe müssen in separaten Einträgen erfasst werden).
  - **definition**: Die exakte Wiedergabe der Legaldefinition, einschließlich aller Aufzählungszeichen und Alternativen.

**Ausgabe**  
- Erstelle für jede identifizierte Legaldefinition einen separaten Eintrag in der Liste unter dem Schlüssel "rechtsbegriffe" im Output-Dictionary.

**Beispiele**
- Text: "Der Betreiber hat sicherzustellen, dass Geräusche unterhalb von X dB bleiben." → **Keine** Legaldefinition (Pflichtregelung).
- Text: "Betriebsleiter im Sinne dieses Gesetzes ist die natürliche Person, die …" → **Extrahiere**
- Text: "Verbundene Unternehmen im Sinne der §§ 16 bis 18 gelten als einheitliche Unternehmensgruppe, wenn ein Unternehmen die Leitung des anderen tatsächlich bestimmt." → **Keine** Legaldefinition (der Begriff gilt nur unter bestimmten Voraussetzungen; keine allgemeine Begriffsbestimmung)

**Anwendung**  
Analysiere den folgenden Gesetzesparagraphen:  
""" + closing_block("Gesetzesparagraph: {paragraph_text}")
