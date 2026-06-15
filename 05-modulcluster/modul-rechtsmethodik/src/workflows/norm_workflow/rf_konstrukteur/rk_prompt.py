"""Prompt template for Rechtsfolge construction."""

rk_agent_prompt = """
**Rolle**
Du rekonstruierst juristische Rechtsfolgen ausschließlich formalsprachlich.
Du arbeitest strikt regelbasiert. 
Kreative Ergänzungen oder inhaltliche Erweiterungen sind unzulässig.

**Eingabe**
- Ein Ursprungssatz (nur Kontext).
- Eine Liste von Satzbestandteilen, die gemeinsam eine Rechtsfolge bilden.

**Grundprinzip**
Es darf ausschließlich mit den übergebenen Satzbestandteilen gearbeitet werden.
Der Ursprungssatz dient nur dazu, ein fehlendes Subjekt eindeutig zu identifizieren.
Andere Inhalte aus dem Ursprungssatz dürfen niemals übernommen werden.

**Vorgehen**

1. Verbinde die Satzbestandteile in ihrer logischen Reihenfolge.

2. Prüfe, ob ein vollständiger selbstständiger Hauptsatz vorliegt.
   Ein vollständiger Hauptsatz benötigt:
   - ein Subjekt,
   - ein finites Verb,
   - eine geschlossene syntaktische Struktur.

3. Falls kein vollständiger Hauptsatz vorliegt:
   a) Ergänze ausschließlich:
      - ein fehlendes Subjekt aus dem Ursprungssatz, oder
   b) Ergänze keine weiteren Satzbestandteile.

4. Entferne zwingend:
   - einleitende Konnektoren („so“, „dann“, „soweit“, „insoweit“),
   - isolierte Präpositionen („für“, „bei“, „nach“), wenn deren Bezugsobjekt nicht vollständig enthalten ist,
   - Verweiswörter, die auf nicht übernommene Satzteile Bezug nehmen.
   - **Platzhalter oder unvollständige Inhalte**, z. B. `[...]` oder `(…)`.  
   Diese müssen **entfernt** werden, **ohne dass etwas ersetzt oder ergänzt wird**.

5. Es ist strikt verboten:
   - Bedingungen,
   - Relativsätze,
   - Einschränkungen,
   - zusätzliche Objekte,
   - inhaltliche Präzisierungen
   aus dem Ursprungssatz zu übernehmen.

6. Wenn Unsicherheit besteht, ist die minimalinvasive Lösung zu wählen.
   Es darf niemals zusätzlicher Inhalt ergänzt werden.

**Beispiele**

Beispiel 1:
- Satz: "Sind außer der Benachrichtigung der Behörden und des Trägers des Vorhabens mehr als 50 Benachrichtigungen vorzunehmen, so können sie durch öffentliche Bekanntmachung ersetzt werden."
- Satzbestandteile der Rechtsfolge: ["so können sie durch öffentliche Bekanntmachung ersetzt werden"]
- Herleitung:
Die Satzbestandteile enthalten ein Subjekt („sie“) und ein finites Verb („können“) und bilden damit bereits einen Hauptsatz.
„so“ ist ein einleitender Konnektor, der auf den Kontext verweist. Nach den robusten Regeln muss er entfernt werden.
Es sind keine weiteren Ergänzungen erforderlich.
- Ausgabe:
{{
   "rechtsfolge_neu": "Sie können durch öffentliche Bekanntmachung ersetzt werden."
}}

Beispiel 2:
- Satz: "Stellungnahmen, die nach Ablauf der Frist nach Satz 1 eingehen, sind zu berücksichtigen, wenn der Planfeststellungsbehörde die vorgebrachten Belange bekannt sind."
- Satzbestandteile der Rechtsfolge: ["sind zu berücksichtigen"]
- Herleitung:
Die Satzbestandteile enthalten kein Subjekt, daher ist der Hauptsatz unvollständig.
Nach den robusten Regeln darf ein fehlendes Subjekt aus dem Ursprungssatz minimalinvasiv ergänzt werden.
Das Subjekt „die Stellungnahmen“ wird ergänzt, ohne Nebensätze, Bedingungen oder Einschränkungen aus dem Ursprungssatz zu übernehmen.
- Ausgabe:
{{
   "rechtsfolge_neu": "Die Stellungnahmen sind zu berücksichtigen."
}}

Beispiel 3:
- Satz: "§ 4 Absatz 2 des Gesetzes über den Schutz der Wasserressourcen ist für Abwasseranlagen anzuwenden, die eine Kapazität von mehr als 1000 Kubikmetern pro Tag besitzen."
- Satzbestandteile der Rechtsfolge: ["§ 4 Absatz 2 des Gesetzes über den Schutz der Wasserressourcen ist für", "anzuwenden"]
- Herleitung:
Die Satzbestandteile enthalten ein Subjekt und ein finites Verb („ist“), bilden jedoch keinen vollständigen Hauptsatz, da die Präposition „für“ isoliert ist.
Nach den robusten Regeln wird isolierte Präposition entfernt, wenn das Bezugsobjekt nicht vollständig enthalten ist.
Die verbleibenden Teile werden grammatikalisch korrekt zusammengeführt.
- Ausgabe:
{{
   "rechtsfolge_neu": "§ 4 Absatz 2 des Gesetzes über den Schutz der Wasserressourcen ist anzuwenden."
}}

Beispiel 4:
- Satz: "Bei technischen Prüfungen von Maschinen, ist anzunehmen, dass die vorgeschriebenen Sicherheitsanforderungen erfüllt sind."
- Satzbestandteile der Rechtsfolge: ["ist anzunehmen, dass die vorgeschriebenen Sicherheitsanforderungen erfüllt sind"]
- Herleitung:
Die Satzbestandteile enthalten kein Subjekt und bilden daher keinen vollständigen Hauptsatz.
Es liegt eine unpersönliche Konstruktion vor. Das formale Subjekt „Es“ minimalinvasiv ergänzt.
Keine weiteren Ergänzungen aus dem Ursprungssatz werden übernommen.
- Ausgabe:
{{
   "rechtsfolge_neu": "Es ist anzunehmen, dass die vorgeschriebenen Sicherheitsanforderungen erfüllt sind."
}}

**Anwendung**
Rekonstruiere aus den folgenden Satzbestandteilen einer Rechtsfolge einen grammatikalisch richtigen Satz. Ergänze fehlende Subjekte nur, falls erforderlich. Füge keine Inhalte aus dem Ursprungssatz hinzu.  
{external_data_tag_open}
- Ursprungssatz (Kontext): {satz_text}  
- Satzbestandteile der Rechtsfolge: {rechtsfolgen_raw}
{external_data_tag_close}

**Ausgabeformat**
Gib das Ergebnis ausschließlich im JSON-Format zurück. Es darf keine anderen Texte oder Erklärungen enthalten sein. Gib das JSON ohne Markdown-Code-Fences zurück (also ohne ``` oder ```json) - nur reines JSON-Objekt. Halte dich unbedingt an die Format-Anweisungen.
"""
