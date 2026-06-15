"""Static test fixtures shared across the test suite.

The fixtures below describe a fictional ``Unittestabdeckungsverordnung`` (UTAV)
about maintaining a test-case register. None of the content refers to real law.
"""

_TEST_NORM = {
    "doc_id": "d29c2ea6ecda9afe7efc888007ba7c266f823b0757abadde99f299e8891f1f06",
    "jurabk": "UTAV",
    "name": "Unittestabdeckungsverordnung",
    "paragraph_nr": "7",
    "valid_from": "2026-05-01",
    "change_text": """
§ 7 Absatz 1 Satz 1 wird wie folgt geändert:
a) Nach Nummer 4 Buchstabe c wird folgender Buchstabe d angefügt:
„d) Testfall-Kennnummer nach § 5 der Testregisterordnung 2709,".
b) Nach Nummer 6 Buchstabe b wird folgender Buchstabe c angefügt:
„c) Testfall-Kennnummer nach § 5 der Testregisterordnung 2703, 2707,".
c) Nummer 8 wird wie folgt gefasst:
„8. die Testfall-Kennnummer nach § 5 der Testregisterordnung 2701,".
d) Nummer 9 wird wie folgt gefasst:
„9. das Vorläufige Prüfmerkmal nach § 5 Absatz 6 Satz 2 der Testregisterordnung
2702, 2705,".
     """,
    "current_text": """
Die Testportale können für die elektronische Erteilung einer Selbstauskunft aus dem Testfallregister durch die zuständige Teststelle nach § 4 der Unittestabdeckungsverordnung in Verbindung mit § 10 des Unittestgrundgesetzes beschränkt auf die zu dem Testfall im Testfallregister gespeicherten Daten auf Antrag der verantwortlichen Entwicklerin oder des verantwortlichen Entwicklers die folgenden Daten abrufen:

 1.	Testfallname	0101 bis 0106,
 2.	frühere Testfallnamen	0201 bis 0206,
 3.	Testmethodennamen unter Kennzeichnung der Hauptmethode	0301 bis 0305,
 4.	zur übergeordneten Testsuite:	0001, 0916,
 	a)	Suitename	0902 bis 0903,
 	b)	Speicherort	0907a,
 	c)	Erstellungsdatum	0906,
 5.	derzeitige Laufzeitumgebungen	1001 bis 1004,
 6.	zur gekoppelten Fixture:	0001,
 	a)	Fixturename	1501 bis 1502,
 	b)	Erstellungsdatum	1505,
 7.	Abhängigkeitsstatus, bei eingebundenen Fixtures zusätzlich Datum und Ort der Einbindung	1401 bis 1409,
 8.	die Testfall-Kennnummer nach § 5 der Testregisterordnung und bis zu deren Speicherung im Testfallregister das Vorläufige Prüfmerkmal nach § 5 Absatz 6 Satz 2 der Testregisterordnung	2701, 2702,
 9.	(weggefallen)


Zur Aufgabenerfüllung nach Satz 1 hält die Teststelle für die Testportale die dort genannten Daten zum Abruf im automatisierten Verfahren bereit.
        """,
    "new_text": """
Die Testportale können für die elektronische Erteilung einer Selbstauskunft aus dem Testfallregister durch die zuständige Teststelle nach § 4 der Unittestabdeckungsverordnung in Verbindung mit § 10 des Unittestgrundgesetzes beschränkt auf die zu dem Testfall im Testfallregister gespeicherten Daten auf Antrag der verantwortlichen Entwicklerin oder des verantwortlichen Entwicklers die folgenden Daten abrufen:

 1.	Testfallname	0101 bis 0106,
 2.	frühere Testfallnamen	0201 bis 0206,
 3.	Testmethodennamen unter Kennzeichnung der Hauptmethode	0301 bis 0305,
 4.	zur übergeordneten Testsuite:	0001, 0916,
 	a)	Suitename	0902 bis 0903,
 	b)	Speicherort	0907a,
 	c)	Erstellungsdatum	0906,
 	d)	Testfall-Kennnummer nach § 5 der Testregisterordnung	2709,
 5.	derzeitige Laufzeitumgebungen	1001 bis 1004,
 6.	zur gekoppelten Fixture:	0001,
 	a)	Fixturename	1501 bis 1502,
 	b)	Erstellungsdatum	1505,
 	c)	Testfall-Kennnummer nach § 5 der Testregisterordnung	2703, 2707,
 7.	Abhängigkeitsstatus, bei eingebundenen Fixtures zusätzlich Datum und Ort der Einbindung	1401 bis 1409,
 8.	die Testfall-Kennnummer nach § 5 der Testregisterordnung	2701,
 9.	das Vorläufige Prüfmerkmal nach § 5 Absatz 6 Satz 2 der Testregisterordnung	2702, 2705,


Zur Aufgabenerfüllung nach Satz 1 hält die Teststelle für die Testportale die dort genannten Daten zum Abruf im automatisierten Verfahren bereit.
        """,
    "transitional_note": "",
}

_TEST_DOCUMENT = {
    "doc_id": "d29c2ea6ecda9afe7efc888007ba7c266f823b0757abadde99f299e8891f1f06",
    "doc_type": "Verordnung",
    "title": "Verordnung zur Änderung der Unittestregisterverordnung und der "
    + "Unittestabdeckungsverordnung",
    "valid_from": "2026-05-01",
}
