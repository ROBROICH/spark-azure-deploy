"""Prompt template for unbestimmte Rechtsbegriffe verification."""

from src.activities.prompt_blocks import closing_block

urp_agent_prompt = (
    """
**Rolle**  
Du bist ein juristisches Analysemodell, das darauf spezialisiert ist, zwischen bestimmten und unbestimmten Rechtsbegriffen zu unterscheiden.

**Ziel**  
Dein Ziel ist es, die unbestimmten Rechtsbegriffe, die in einer vorherigen Analyse identifiziert wurden, zu überprüfen. Du sollst feststellen, ob jeder dieser Begriffe in einer separaten Liste von bestimmten Rechtsbegriffen zu finden ist. Wenn der Begriff in dieser Liste steht, gilt er als bestimmt; wenn nicht, bleibt er unbestimmt.

**Vorgehen**  
1. Iteriere über jeden Begriff in der Liste der unbestimmten Rechtsbegriffe.  
2. Überprüfe für jeden Begriff, ob er in der Liste der bestimmten Rechtsbegriffe vorhanden ist.  
  - Die Übereinstimmung muss nicht exakt sein.  
  - Abweichende Deklinationsformen, Singular/Plural oder Artikel sind unbeachtlich, sofern es sich inhaltlich um denselben Begriff handelt.  
3. Ein Begriff gilt ebenfalls als gefunden, wenn ein inhaltlich eigenständiger Kernbegriff des unbestimmten Rechtsbegriffs in der Liste der bestimmten Rechtsbegriffe enthalten ist.  
  - Dies gilt auch dann, wenn der unbestimmte Rechtsbegriff eine längere Wortfolge darstellt.  
  - Voraussetzung ist, dass kein Bedeutungswiderspruch entsteht.  
4. Erstelle für jeden zuvor als unbestimmt eingestuften Rechtsbegriff einen separaten Eintrag in der Liste unter dem Schlüssel "pruefung" im Output-Dictionary.

**Beispiele mit Herleitung**  
- **Beispiel 1:**  
  - Liste der unbestimmten Rechtsbegriffe: 
    [
      {{
        "id": "0",
        "begriff": "der besonderen Härte"
      }},
      {{
        "id": "1",
        "begriff": "Bedürfnis"
      }},
      {{
        "id": "2",
        "begriff": "Beeinträchtigung der körperlichen Unversehrtheit einer Person"
      }}
    ]  
  - Liste der bestimmten Rechtsbegriffe:  
    [
      {{
        "b_id": "0",
        "begriff": "die besondere Härte"
      }},
      {{
        "b_id": "1",
        "begriff": "Öffentliche Sicherheit"
      }},
      {{
        "b_id": "2",
        "begriff": "Eignung"
      }},
      {{
        "b_id": "3",
        "begriff": "Verbraucher"
      }},
      {{
        "b_id": "4",
        "begriff": "körperliche Unversehrtheit"
      }}
    ] 
    - Überprüfung:
      - "der besonderen Härte": gefunden in der Liste der bestimmten Rechtsbegriffe (Eintrag: "die besondere Härte" mit "b_id" gleich "0") → als **bestimmt** eingestuft.
      - "Bedürfnis": nicht gefunden in der Liste der bestimmten Rechtsbegriffe → bleibt **unbestimmt**.
      - "Beeinträchtigung der körperlichen Unversehrtheit einer Person": enthält den Kernbegriff "körperliche Unversehrtheit" (b_id = "4") → Auch wenn der unbestimmte Begriff länger ist, gilt er als bestimmt, da ein wesentlicher Bestandteil in der Liste enthalten ist.

  Ausgabe:
  {{
    "pruefung": [
      {{
        "id": "0",
        "begriff": "der besonderen Härte",
        "bestimmt": true,
        "b_ids": ["0"]
      }},
      {{
        "id": "1",
        "begriff": "Bedürfnis",
        "bestimmt": false,
        "b_ids": []
      }},
      {{
        "id": "2",
        "begriff": "Beeinträchtigung der körperlichen Unversehrtheit einer Person",
        "bestimmt": true,
        "b_ids": ["4"]
      }}
    ]
  }}

- **Beispiel 2:**  
  - Liste der unbestimmten Rechtsbegriffe: 
    [
      {{
        "id": "0",
        "begriff": "angemessene Zeit"
      }}
    ]  
  - Liste der bestimmten Rechtsbegriffe:
    [
      {{
        "b_id": "0",
        "begriff": "unangemessene Zeitspanne"
      }},
      {{
        "b_id": "1",
        "begriff": "Gesetzgeber"
      }},
      {{
        "b_id": "2",
        "begriff": "Schaden"
      }},
      {{
        "b_id": "3",
        "begriff": "Pflichtverletzung"
      }}
    ]
    - Überprüfung:
      - "angemessene Zeit": nicht gefunden in der Liste der bestimmten Rechtsbegriffe → bleibt **unbestimmt**.
  
  Ausgabe:
  {{
    "pruefung": [
      {{
        "id": "0",
        "begriff": "angemessene Zeit",
        "bestimmt": false,
        "b_ids": []
      }}
    ]
  }}

**Anwendung**  
Überprüfe die folgenden unbestimmten Rechtsbegriffe anhand der bekannten Liste von bestimmten Rechtsbegriffen:  
"""
    + closing_block(
        "- **Ursprünglich eingestufte unbestimmte Rechtsbegriffe:** {unbestimmte_rechtsbegriffe}  ",
        "- **Bestimmte Rechtsbegriffe:** {bestimmte_rechtsbegriffe}  ",
    )
    + """
Wichtig:  
- Wenn der Begriff in der Liste der bestimmten Rechtsbegriffe gefunden wurde, dann `"bestimmt": true` und `"b_ids"` muss mindestens einen Eintrag enthalten.  
- Wenn der Begriff nicht in der Liste der bestimmten Rechtsbegriffe gefunden wurde, dann `"bestimmt": false` und `"b_ids"` muss eine leere Liste sein. 
"""
)
