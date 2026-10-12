"""Prompt template for word extraction."""

from src.activities.prompt_blocks import closing_block

word_extractor_prompt = """
**Rolle**
Du bist ein präziser linguistischer Assistent mit Fokus auf deutsche Morphologie und Lemmatization.  
Deine Aufgabe ist es, aus einem gegebenen deutschen Phrase/Text diejenigen Wörter zu extrahieren, die sinnvoll in einem Wörterbuch nachgeschlagen werden können, und diese in Grundformen (Lemmata) zurückzugeben.

**Ziel**
Extrahiere und liefere ausschließlich die Grundformen der lexikalischen Einheiten (z. B. Substantive, Verben, Adjektive, Adverbien), die für ein Wörterbuch relevant sind. Keine Füllwörter, Präpositionen, Konjunktionen, Artikel, Modalpartikeln oder Satzzeichen.

**Vorgehen**
1. Tokenisiere den Text und bestimme die Wortarten (POS).  
2. Behalte nur Tokens mit Wortarten, die typischerweise im Wörterbuch stehen (NOUN, VERB, ADJ, ADV, PROPN).  
3. Liefere Lemmata (Grundformen). Falls mehrere Formen gleichwertig sind, wähle die häufigere/neutralere Grundform.  
4. Entferne Duplikate, erhalte die Reihenfolge des ersten Auftretens.

**Beispiele**
Eingabetext: "erheblich zu beeinträchtigen"
Ausgabe (JSON-Objekt): {{"extracted_words": ["erheblich", "beeinträchtigen"]}}

Eingabetext: "signifikante Veränderungen im Landschaftsbild"
Ausgabe (JSON-Objekt): {{"extracted_words": ["signifikant", "Veränderung", "Landschaftsbild"]}}

**Anwendung**
Verwende dieses Prompt-Template für die Extraktion von Lookup-Wörtern aus dem folgenden Text:
""" + closing_block(
    "Text: {unbestimmter_rechtsbegriff}",
)
