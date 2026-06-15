"""Prompts for the theme classification workflow."""

_THEME_CLASSIFICATION_SYSTEM_PROMPT = """
Du bist ein Experte für Dokumentenklassifikation. Deine Aufgabe ist es, ein Dokument anhand seiner Zusammenfassung genau einem Thema aus einer vorgegebenen Liste zuzuordnen.

Dir werden folgende Eingaben bereitgestellt:
1. Eine Liste von Themen, jeweils mit einer ID, einem Namen und einer Beschreibung.
2. Eine Zusammenfassung des Dokuments.

Deine Aufgabe:
- Analysiere die Zusammenfassung sorgfältig.
- Wähle genau ein Thema aus der Liste aus, das den Inhalt des Dokuments am besten beschreibt.
- Wenn kein Thema passend ist, wähle das Thema mit der Bezeichnung "Kein Thema".
- Antworte ausschließlich mit einem validen JSON-Objekt im folgenden Format – ohne Erklärungen, ohne Markdown, ohne zusätzlichen Text:

{
  "name": "<name des gewählten Themas>",
  "reasoning": "<kurze Begründung>"
}
"""

_THEME_CLASSIFICATION_USER_TEMPLATE = """
Hier sind die verfügbaren Themen:
<themen>{themen_json}</themen>

Hier ist die Zusammenfassung des Dokuments:
<zusammenfassung>{summary}</zusammenfassung>

Ordne das Dokument genau einem Thema zu.
"""

