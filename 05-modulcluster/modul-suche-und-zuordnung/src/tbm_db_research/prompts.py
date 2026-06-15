"""Prompt templates for LLM-based synthesis of Tatbestandsmerkmal examination guides."""

import textwrap

SYNTHESIS_PROMPT = textwrap.dedent("""\
    Du bist ein juristischer Fachexperte fuer deutsches Verwaltungsrecht.

    Schreibe einen Pruefungsleitfaden, der erklaert, wie die
    Tatbestandsmerkmale des folgenden Satzes aus {norm_name}, {satz_ref}
    zu pruefen und zu bewerten sind.

    == SATZTEXT ==
    {satz_text}

    == TATBESTANDSMERKMALE ==
    {tbm_text}

    == PRUEFFRAGEN (aus den atomaren TBMs aggregiert) ==
    {prueffragen_text}

    == RECHTSBEGRIFFE UND DEFINITIONEN ==
    {rb_text}

    == GESETZESBEGRUENDUNGEN (DKE-Datenbank) ==
    {dke_text}

    == RELEVANTE URTEILE ==
    {ut_text}

    Anforderungen:
    - Schreibe einen zusammenhaengenden Fliesstext als Pruefungsleitfaden.
    - Stuetze dich auf die bereitgestellten Quellen (Begruendungen, Urteile,
      Rechtsbegriffe) und verweise inline im Fliesstext darauf, z.B. [1], [2].
    - Erklaere, worauf bei der Pruefung der einzelnen Tatbestandsmerkmale
      zu achten ist und welche Masstaebe die Rechtsprechung anlegt.
    - Fuehre am Ende unter der Ueberschrift "## Referenzen" eine nummerierte
      Liste der tatsaechlich verwendeten Quellen auf (max. 5-10), jeweils
      mit Nummer, Titel und ggf. Aktenzeichen, z.B.:
      [1] BVerwG 9 A 12/10, Urteil vom 09.07.2011 (Az. 9 A 12/10)
    - Antworte ausschliesslich auf Deutsch.
""")
