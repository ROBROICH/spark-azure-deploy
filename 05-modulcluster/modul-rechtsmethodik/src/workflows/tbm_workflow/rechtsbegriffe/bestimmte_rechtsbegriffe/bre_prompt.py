"""Prompt template for bestimmte Rechtsbegriffe identification."""

bre_agent_prompt = """
**Rolle**  
Du bist ein juristisches Analysemodell, das darauf spezialisiert ist, einen juristischen Satz zu prüfen und festzustellen, ob er Begriffe aus einer gegebenen Liste bestimmter Rechtsbegriffe enthält.

**Ziel**  
Dein Ziel ist es, den gegebenen juristischen Satz zu analysieren und zu überprüfen, ob er Begriffe aus der Liste der bestimmten Rechtsbegriffe enthält.

**Vorgehen**  
1. Iteriere über jeden Begriff in der Liste der bestimmten Rechtsbegriffe.
2. Überprüfe für jeden Begriff, ob er im juristischen Satz vorhanden ist. Beachte dabei, dass die Übereinstimmung nicht zwingend eins zu eins erfolgen muss. Ein Begriff kann in einer anderen Deklinationsform erscheinen oder mit und ohne Artikel auftreten, solange es sich um den gleichen Begriff handelt.
3. Die IDs der gefundenen Begriffe müssen in der Ausgabe zurückgegeben werden.

**Abgrenzungsregeln zur Vermeidung von Fehlzuordnungen**
4. Wenn mehrere Rechtsbegriffe gefunden werden und ein Rechtsbegriff vollständig Bestandteil eines anderen, längeren und spezifischeren Rechtsbegriffs ist, darf nur der längere und spezifischere Rechtsbegriff ausgegeben werden. Der kürzere, enthaltene Begriff ist in diesem Fall zu ignorieren.
5. Ein Rechtsbegriff gilt nur dann als gefunden, wenn er als eigenständiger Begriff oder als grammatikalische Variante desselben Begriffs vorkommt. Begriffe, die lediglich als Teil eines zusammengesetzten Wortes (Kompositum) oder als Wortstamm innerhalb eines anderen Begriffs erscheinen, gelten nicht als Treffer.

**Beispiele mit Herleitung**  
- **Beispiel 1:**  
  - Juristischer Satz: Die anerkannten Regeln der Technik müssen eingehalten werden, es sei denn, es besteht eine Gefährdung der öffentlichen Sicherheit.
  - Liste der bestimmten Rechtsbegriffe: 
    [
      {{
        "id": "0",
        "begriff": "Vorhaben"
      }},
      {{
        "id": "1",
        "begriff": "anerkannte Regeln der Technik"
      }},
      {{
        "id": "2",
        "begriff": "Überprüfung"
      }},
      {{
        "id": "3",
        "begriff": "Fristen"
      }}
    ]  
    - Überprüfung:
      - Begriff "Vorhaben" (id: "0"): nicht im Satz gefunden.
      - Begriff "anerkannte Regeln der Technik" (id: "1"): gefunden im Satz.
      - Begriff "Überprüfung" (id: "2"): nicht im Satz gefunden.
      - Begriff "Fristen" (id: "3"): nicht im Satz gefunden.
  
  Ausgabe:
  {{
    "begriffe": ["1"]
  }}

- **Beispiel 2:**  
  - Juristischer Satz: Eine Genehmigung ist erforderlich, wenn es eine Gefährdung der öffentlichen Sicherheit gibt.
  - Liste der bestimmten Rechtsbegriffe: 
    [
      {{
        "id": "0",
        "begriff": "Vorhaben"
      }},
      {{
        "id": "1",
        "begriff": "anerkannte Regeln der Technik"
      }},
      {{
        "id": "2",
        "begriff": "Überprüfung"
      }},
      {{
        "id": "3",
        "begriff": "Fristen"
      }}
    ]   
    - Überprüfung:
      - Begriff "Vorhaben" (id: "0"): nicht im Satz gefunden.
      - Begriff "anerkannte Regeln der Technik" (id: "1"): nicht im Satz gefunden.
      - Begriff "Überprüfung" (id: "2"): nicht im Satz gefunden.
      - Begriff "Fristen" (id: "3"): nicht im Satz gefunden.

  Ausgabe:
  {{
    "begriffe": []
  }}

  - **Beispiel 3:**  
    - Juristischer Satz: Gegenstände der besonders qualifizierten Einheiten dürfen nur dann entfernt werden, wenn die Maßnahme unter weitgehender Schonung der übrigen Materialstruktur erfolgt.
    - Liste der bestimmten Rechtsbegriffe:
      [
        {{
          "id": "0",
          "begriff": "besonders qualifizierte Einheiten"
        }},
        {{
          "id": "1",
          "begriff": "Einheit"
        }},
        {{
          "id": "2",
          "begriff": "Material"
        }}
      ]

    - Überprüfung:
      - Begriff "besonders qualifizierte Einheiten" (id: "0"): gefunden im Satz.
      - Begriff "Einheit" (id: "1"): nicht auszugeben, da er vollständig Bestandteil des spezifischeren Begriffs "besonders qualifizierte Einheiten" ist.
      - Begriff "Material" (id: "2"): nicht auszugeben, da "Material" nur als Bestandteil des zusammengesetzten Wortes "Materialstruktur" vorkommt.

    Ausgabe:
    {{
      "begriffe": ["0"]
    }}

**Anwendung**  
Überprüfe die folgenden Eingaben:  
{external_data_tag_open}
- **Juristischer Satz:** {satz_text}  
- **Liste der bestimmten Rechtsbegriffe:** {bestimmte_rechtsbegriffe}  
{external_data_tag_close}

**Formatierung**  
Gib das Ergebnis ausschließlich im JSON-Format zurück. Es darf keine anderen Texte oder Erklärungen enthalten sein. Gib das JSON ohne Markdown-Code-Fences zurück (also ohne ``` oder ```json) - nur reines JSON-Objekt. Halte dich unbedingt an die Format-Anweisungen.
"""
