# SPARK Workflow Feature-Liste

## Verfahrensanlage
- **Unterlagen-Upload:** Hochladen von Verfahrensunterlagen über die Benutzeroberfläche (ZIP / PDF).
- **Inhaltsextraktion der Unterlagen:** Extraktion der Inhalte aus den hochgeladenen Unterlagen als Grundlage für die nachgelagerten Prüfschritte.
- **Integration externer Schnittstellen:** Anbindung externer Schnittstellen wie z. B. Fachplanungsportal (FPP) zur Übernahme von Daten.

## Formale Vollständigkeitsprüfung
- **KI-gestützte Unterlagenzuordnung:** Automatische Zuordnung jeder Unterlage zu Unterlagentyp und Themen.
- **Abgleich gegen Inhaltsverzeichnis:** Prüfung der hochgeladenen Unterlagen gegen das Inhaltsverzeichnis der Antragstellenden.
- **Abgleich gegen behördliche Anforderungen:** Prüfung gegen die behördlich erforderlichen Unterlagen.
- **Nachforderung fehlender Unterlagen:** Fehlende Unterlagen werden als Hinweis erkannt und können direkt nachgefordert werden.

## Plausibilitätsprüfung
- **Widerspruchserkennung innerhalb von Unterlagen:** KI-gestütztes Erkennen von Widersprüchen innerhalb einzelner Unterlagen.
- **Widerspruchserkennung zwischen Unterlagen:** KI-gestütztes Erkennen von Widersprüchen zwischen jeder Unterlage und dem Erläuterungsbericht.
- **Fundstellenbelegung und Nachforderung:** Jeder Befund wird mit Fundstelle belegt. Nachforderungen können einfach erstellt werden.

## Materielle Vollständigkeitsprüfung
- **Materielle Vollständigkeitsprüfung:** Themenbezogene Prüfung auf Anstoßwirkung durch normbezogene KI-Suche nach belegenden Fundstellen in den Planunterlagen mit Verweisen auf die jeweilige Rechtsnorm.
- **Rechtsänderung:** Berücksichtigung von Rechtsänderungen über die Anbindung an Gesetzesdatenbanken und Hinweis auf Änderungen in laufenden Verfahren.

## Behörden- und Öffentlichkeitsbeteiligung
- **Thematische Kategorisierung der Beteiligungseingänge:** Automatische Zerlegung der Beteiligungseingänge in Einzelargumente und Kategorisierung nach Themen und Unterthemen.
- **Export- und Importfunktion:** Export der zerschnittenen Beteiligungseingänge als CSV-Datei sowie Import von Erwiderungen der Vorhabenträgerin auf die Beteiligungseingänge.

## Rechtliche Prüfung und Bewertung
- **Themen- und normbezogene KI-Bewertung:** KI-Bewertung der relevanten Rechtsgrundlage (z. B. erfüllt / nicht erfüllt) mit ausführlichem Prüfergebnis mit Fundstellen als Begründungshilfe.
- **Digitale Rechtsdogmatik:** Dekonstruktion der Normen in ihre rechtsmethodischen Bestandteile wie z. B. Tatbestandsmerkmale oder unbestimmte Rechtsbegriffe sowie Erkennung von Verweisen.
  
## Beschlusserstellung
- **Beschlusserstellung im integrierten Editor:** Verfassen des Beschlusses im integrierten Editor entlang der behördenspezifischen Gliederung.
- **Beschluss-Export in PDF/DOCX:** Export des Beschlusses als Word- oder PDF-Datei in der hinterlegten Formatvorlage (Behördenbriefpapier).
- **KI-Risikohinweisgeber:** KI-Risikohinweisgeber zur Qualitätssicherung der Beschlusskapitel (Schweregrade niedrig / mittel / hoch).

## Sekundärfunktionen
- **Nachforderung von Antragsunterlagen:** Nachforderungen werden strukturiert und können konsolidiert exportiert werden.
- **Kommentierung:** Kommentare können je Prüfschritt gesetzt werden.
- **Fristen- und Terminmanagement:** Fristen können je Verfahren hinterlegt und überwacht werden.
- **Protokollierung:** Protokollierung aller relevanten Vorgänge im System.
- **Planänderung:** Funktion zur Versionierung geänderter Unterlagen.
- **Job-Status-Anzeige:** Anzeige des aktuellen Status laufender Verarbeitungsjobs.
- **Rollen- und Rechtekonzept:** Bearbeitungsrollen können behörden- und verfahrensspezifisch zugewiesen werden.
- **Schwärzungsagent:** Funktion zur automatisierten Schwärzung sensibler personenbezogener Daten.
- **Freigaben für Verfahren:** Steuerung von Freigaben innerhalb des Verfahrens durch berechtigte Rollen.
- **Feedbackmechanismen zu KI-Analysen:** Rückmeldungen zu KI-Ergebnissen zur Bewertung deren Qualität.
- **Mehrsprachigkeit:** Unterstützung deutscher und englischer Sprachen in der Benutzeroberfläche.