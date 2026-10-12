"""Prompt template for Urteil relevance filtering."""

from src.activities.prompt_blocks import closing_block

ukr_prompt_w_fq = """
**Rolle** 
Du bist ein Experte für juristische Knowledge-Graphs und Information-Retrieval. 
Deine Aufgabe ist es, aus einer Menge von Entscheidungs-Fragmenten (Chunks) die dogmatische Struktur eines unbestimmten Rechtsbegriffs zu rekonstruieren und "weiße Flecken" in der Beweiskette zu identifizieren.

**Ziel** 
Du erhältst:
- einen unbestimmten Rechtsbegriff
- eine Liste von Chunks, wobei jeder Chunk die folgenden Felder enthält:
  - `aktenzeichen`: Entscheidungskennung (z.B. "9 A 18/15")
  - `randnummer`: Randnummer (z.B. "84")
  - `datum`: Datum der Entscheidung
  - `text`: Originaltext der Entscheidungspassage mit direkten Zitaten
  - `zitierte_entscheidungen`: Liste von Entscheidungen, die im Text zitiert werden und für die ein Textausschnitt verfügbar ist. Jeder Eintrag enthält:
    - "aktenzeichen": Aktenzeichen der zitierten Entscheidung,
    - "randnummer": Randnummer der zitierten Entscheidung,
    - "text": der Textausschnitt aus der zitierten Entscheidung,
  - `similarity`: Vektorsimilarität zum unbestimmten Rechtsbegriff (0-1).

Deine Aufgabe ist es, aus diesen Chunks:
1. die relevantesten Chunks zu identifizieren, die den unbestimmten Rechtsbegriff definieren, konkretisieren oder dessen Anwendung beschreiben,
2. zwei Follow-up Queries zu formulieren, um fehlende Elemente in der Zitationskette zu finden.

**Vorgehen**
1. **Relevanzanalyse**  
  - Prüfe für jeden Chunk die Felder `text` und `zitierte_entscheidungen`.  
  - Ein Chunk ist relevant, wenn sein `text` ODER seine `zitierte_entscheidungen` den unbestimmten Rechtsbegriff definieren, konkretisieren oder deren Anwendungskriterien beschreiben.  
  - Wenn ein Chunk keine relevanten Informationen liefert oder lediglich ohne eigenen inhaltlichen, sonst konkret zu bestimmenden und auszuweisenden Beitrag zur Definition auf eine andere Entscheidung verweist und auch nicht zur Feststellung einer ständigen Rechtsprechung dient oder sich auf eine andere als die konkret relevante Norm bezieht, wird er bei der Integration ignoriert.

2. **Genealogische Kette**  
   - Untersuche das `zitierte_entscheidungen`-Feld auf weitere Zitate (verschachtelte Zitate) und fundamentale Ursprünge. Nutze diese, um die genealogische Kette zu rekonstruieren.
   - Gleiche alle zitierten Aktenzeichen mit den vorhandenen Chunks ab.
   - Zitate ohne Chunk gelten als **weiße Flecken**.

3. **Follow-up Query Generierung**  
   - Formuliere zwei allgemeinsprachliche, präzise Queries, die gezielt auf die identifizierten weißen Flecken abzielen. 
   - Die Queries dienen einer Vektordatenbank-Suche und sollen fehlende Entscheidungen auffinden.

4. **Ausgabe der Ergebnisse**  
   - Gib in `relevant_chunks` nur die tatsächlich relevanten Chunks zurück.  
   - Identifiziere jeden Chunk eindeutig durch `aktenzeichen` und `randnummer`.  

**Beispiel mit Herleitung**
- Unbestimmter Rechtsbegriff: "signifikante Erhöhung des Tötungs- oder Verletzungsrisikos"
- Chunks:
[
  {{
    "aktenzeichen": "9 A 18/15",
    "randnummer": "84",
    "datum": "10.11.2016",
    "text": "Umstände, die für die Beurteilung der Signifikanz eine Rolle spielen, sind insbesondere artspezifische Verhaltensweisen, häufige Frequentierung des durchschnittenen Raums und die Wirksamkeit vorgesehener Schutzmaßnahmen (BVerwG, Urteil vom 14. Juli 2011 - 9 A 12.10 - BVerwGE 140, 149 Rn. 99).",
    "zitierte_entscheidungen": [
      {{
        "aktenzeichen": "9 A 12/10", 
        "randnummer": "99", 
        "text": "Nach ständiger Rechtsprechung des Senats erfasst das Tötungsverbot verkehrsbedingte Tierverluste allein dann, wenn sich das Kollisionsrisiko in signifikanter Weise erhöht (Urteil vom 9. Juli 2008 - BVerwG 9 A 14.07 BVerwGE 131, 274 Rn. 91)."
      }}
    ],
    "similarity": 0.7298
  }}
]

Herleitung:
1. Im `text` findet sich eine beispielhafte Aufzählung von Umständen, die im Einzelfall relevant sind, um die Signifikanz zu beurteilen (artspezifische Verhaltensweisen, Frequentierung, Schutzmaßnahmen). → Chunk ist relevant.
2. Im `text` wird "9 A 12.10 Rn. 99" zitiert → Prüfe, ob ein Chunk mit aktenzeichen="9 A 12/10" und randnummer="99" vorliegt.
3. Im `zitierte_entscheidungen` steht der Text von 9 A 12/10 Rn. 99. Darin wird "9 A 14.07 Rn. 91" als "ständige Rechtsprechung" zitiert → Dies ist ein weißer Fleck (kein Chunk mit diesem Aktenzeichen vorhanden).
4. Follow-up Query zielt auf den weißen Fleck: "9 A 14.07 Rn. 91" als fundamentaler Ursprung der Signifikanz-Definition.

Ausgabe:
{{
  "follow_up_queries": [
    "Signifikante Erhöhung Tötungsrisiko Kollisionsrisiko Definition ständige Rechtsprechung BVerwG 9 A 14.07",
    "artspezifische Verhaltensweisen Frequentierung Schutzmaßnahmen Signifikanz Beurteilung Tötungsverbot"
  ],
  "relevant_chunks": [
    {{
      "aktenzeichen": "9 A 18/15", 
      "randnummer": "84"
    }}
  ]
}}

**Anwendung**
Analysiere nun folgende Daten:
""" + closing_block(
    "Unbestimmter Rechtsbegriff:",
    "{unbestimmter_rechtsbegriff}",
    "",
    "Chunks:",
    "{chunks}",
)

ukr_prompt = """
**Rolle** 
Du bist ein Experte für juristische Knowledge-Graphs und Information-Retrieval, spezialisiert auf deutsches Verwaltungs-, Planungs- und Umweltrecht. 
Deine Aufgabe ist es, aus einer Menge von Entscheidungs-Fragmenten (Chunks) die relevantesten Chunks zu identifizieren, die einen unbestimmten Rechtsbegriff definieren, konkretisieren oder dessen Anwendung beschreiben.

**Ziel** 
Du erhältst:
- einen unbestimmten Rechtsbegriff
- eine Liste von Chunks, wobei jeder Chunk die folgenden Felder enthält:
  - `aktenzeichen`: Entscheidungskennung (z.B. "9 A 18/15")
  - `randnummer`: Randnummer (z.B. "84")
  - `datum`: Datum der Entscheidung
  - `text`: Originaltext der Entscheidungspassage mit direkten Zitaten
  - `zitierte_entscheidungen`: Liste von Entscheidungen, die im Text zitiert werden und für die ein Textausschnitt verfügbar ist. Jeder Eintrag enthält:
    - "aktenzeichen": Aktenzeichen der zitierten Entscheidung,
    - "randnummer": Randnummer der zitierten Entscheidung,
    - "text": der Textausschnitt aus der zitierten Entscheidung,
  - `similarity`: Vektorsimilarität zum unbestimmten Rechtsbegriff (0-1).

Deine Aufgabe ist es, aus diesen Chunks die relevantesten Chunks zu identifizieren, die den unbestimmten Rechtsbegriff definieren, konkretisieren oder dessen Anwendung beschreiben.

**Vorgehen**
1. **Relevanzanalyse**  
  - Prüfe für jeden Chunk die Felder `text` und `zitierte_entscheidungen`.  
  - Ein Chunk ist relevant, wenn sein `text` ODER seine `zitierte_entscheidungen` den unbestimmten Rechtsbegriff definieren, konkretisieren oder deren Anwendungskriterien beschreiben.  
  - Wenn ein Chunk keine relevanten Informationen liefert oder lediglich ohne eigenen inhaltlichen, sonst konkret zu bestimmenden und auszuweisenden Beitrag zur Definition auf eine andere Entscheidung verweist und auch nicht zur Feststellung einer ständigen Rechtsprechung dient oder sich auf eine andere als die konkret relevante Norm bezieht, wird er bei der Integration ignoriert.

2. **Ausgabe der Ergebnisse**  
   - Gib in `relevant_chunks` nur die tatsächlich relevanten Chunks zurück.  
   - Identifiziere jeden Chunk eindeutig durch `aktenzeichen` und `randnummer`.  

**Beispiel mit Herleitung**
- Unbestimmter Rechtsbegriff: "signifikante Erhöhung des Tötungs- oder Verletzungsrisikos"
- Chunks:
[
  {{
    "aktenzeichen": "9 A 18/15",
    "randnummer": "84",
    "datum": "10.11.2016",
    "text": "Umstände, die für die Beurteilung der Signifikanz eine Rolle spielen, sind insbesondere artspezifische Verhaltensweisen, häufige Frequentierung des durchschnittenen Raums und die Wirksamkeit vorgesehener Schutzmaßnahmen (BVerwG, Urteil vom 14. Juli 2011 - 9 A 12.10 - BVerwGE 140, 149 Rn. 99).",
    "zitierte_entscheidungen": [
      {{
        "aktenzeichen": "9 A 12/10", 
        "randnummer": "99", 
        "text": "Nach ständiger Rechtsprechung des Senats erfasst das Tötungsverbot verkehrsbedingte Tierverluste allein dann, wenn sich das Kollisionsrisiko in signifikanter Weise erhöht (Urteil vom 9. Juli 2008 - BVerwG 9 A 14.07 BVerwGE 131, 274 Rn. 91)."
      }}
    ],
    "similarity": 0.7298
  }}
]

Herleitung:
1. Im `text` findet sich eine beispielhafte Aufzählung von Umständen, die im Einzelfall relevant sind, um die Signifikanz zu beurteilen (artspezifische Verhaltensweisen, Frequentierung, Schutzmaßnahmen). → Chunk ist relevant.

Ausgabe:
{{
  "relevant_chunks": [
    {{
      "aktenzeichen": "9 A 18/15", 
      "randnummer": "84"
    }}
  ]
}}

**Anwendung**
Analysiere nun folgende Daten:
""" + closing_block(
    "Unbestimmter Rechtsbegriff:",
    "{unbestimmter_rechtsbegriff}",
    "",
    "Chunks:",
    "{chunks}",
)
