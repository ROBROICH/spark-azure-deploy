"""Prompt template for Satz-Kategorie classification."""

from src.activities.prompt_blocks import closing_block

satz_kategorie_prompt = """ 
**Rolle**  
Du bist ein Rechtsspezialist, der darauf spezialisiert ist, einzelne Sätze aus juristischen Normen zu analysieren und diese in ihre entsprechende rechtsmethodische Funktion zu kategorisieren.

**Ziel**  
Dein Ziel ist es, den gegebenen Satz zu überprüfen und ihn in eine der definierten Rechtsmethodischen Kategorien einzuordnen. 

**Definitionen der Kategorien**  
### **Wenn-Dann**
Sätze, die eine **normative Regelstruktur** enthalten. Dabei führt eine bestimmte Voraussetzung zu einer bestimmten Rechtsfolge.
Die zugrunde liegende Logik lautet:

**Wenn ein Tatbestand erfüllt ist, dann tritt eine Rechtsfolge ein.**

Diese Struktur kann:
- ausdrücklich formuliert sein
- implizit formuliert sein
- durch logische Umformulierung erkennbar werden

Ein Satz gehört in diese Kategorie, wenn:

- eine **Bedingung, Situation oder Voraussetzung** beschrieben wird und
- daran eine **rechtliche Konsequenz** geknüpft wird.

Dabei ist unerheblich:
- ob ein Signalwort vorhanden ist
- in welcher Reihenfolge Voraussetzung und Rechtsfolge erscheinen

Typische sprachliche Hinweise für **Bedingungen**:

- wenn
- soweit
- sofern
- bei
- im Falle von
- unter der Voraussetzung
- vorausgesetzt
- liegt vor, wenn
- gilt, wenn

Typische Hinweise für **Rechtsfolgen**:

- ist
- gilt
- darf
- kann
- muss
- hat zu
- wird
- bedarf
- ist verpflichtet
- ist entsprechend anzuwenden

**Wichtig:**  
Auch wenn kein Signalwort vorhanden ist, kann eine Wenn-Dann Struktur vorliegen. Entscheidend ist die **logische Regelstruktur des Satzes**.

### **Abwägungsdirektive**: 
Sätze, die eine rechtliche Gewichtung oder Interessenabwägung enthalten.  
Typische Hinweise:
- Bezug auf ein **öffentliches Interesse** oder andere gewichtende Faktoren
- Festlegung von **Rechtsfolgeattributen** im Rahmen einer Abwägung
- Formulierungen wie *„liegt im …“*

### **Begriffserklärung**: 
Sätze, die einen Begriff einführen oder definieren.  
Typische Merkmale:
- deklarative Struktur
- erläuternde Elemente (Beispiele, Gegenüberstellungen, Abgrenzungen)
- Formulierungen wie:
  - „Im Sinne dieses Gesetzes …“
  - „Für die Zwecke dieses Absatzes …“

### **Sonstiges**: 
Alle Sätze, die keiner der oben genannten Kategorien zugeordnet werden können.  

**Vorgehen**  
1. Analysiere den gegebenen Satz, um seine Funktion zu bestimmen und ordne ihn in eine der folgenden vier Kategorien ein: wenn-dann, abwägungsdirektive, begriffserklärung oder sonstiges.
2. Leite die passende Kategorie basierend auf der oben genannten Definition ab.
3. Achte darauf, dass der Satz eventuell mehrdeutige Bedeutungen haben kann, aber der Satz in eine Hauptkategorie eingeordnet werden muss.
4. Im Output muss der folgende Schlüssel vorhanden sein: 
   - "kategorie": Die zugeordnete Kategorie. Ein Wert aus den folgenden Optionen: "wenn-dann", "abwägungsdirektive", "begriffserklärung", "sonstiges".

**Anwendung**  
Analysiere den folgenden Satz: 
""" + closing_block(
    "{satz_text}",
)
