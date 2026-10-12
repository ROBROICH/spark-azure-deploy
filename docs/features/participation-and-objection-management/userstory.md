# 3 EWMS | Behörden- und Öffentlichkeitsbeteiligung und Einwendungsmanagement

Als Bearbeiter oder Federführung eines Planfeststellungsverfahrens
möchte ich Einwendungen und Stellungnahmen aus der Behörden- und Öffentlichkeitsbeteiligung hochladen, in Argumente strukturieren, thematisch prüfen und mit Erwiderungen der Vorhabenträgerin zusammenführen können,
damit ich die Beteiligungseingänge nachvollziehbar bearbeite und die relevanten Inhalte in die rechtliche Prüfung und Bewertung sowie die Beschlusserstellung überführen kann.

## Beschreibung

Das EWMS unterstützt den dritten Prüfungsschritt der gezeigten Präsentation: die Behörden- und Öffentlichkeitsbeteiligung im Anschluss an die materielle Vollständigkeitsprüfung. In diesem Schritt gehen Einwendungen von Privatpersonen sowie Stellungnahmen von Trägern öffentlicher Belange und anerkannten Naturschutzvereinigungen ein. Diese Beteiligungseingänge können je nach Verfahren sehr umfangreich sein und über Monate bearbeitet werden.

Die Anwendung ermöglicht den Upload der Beteiligungseingänge, extrahiert Text aus den Dokumenten und zerschneidet die Eingänge KI-gestützt in einzelne Argumente. Die KI nimmt dabei keine inhaltliche Umformulierung vor, sondern trennt die eingereichten Texte in prüfbare Abschnitte und ordnet diese Themen und Unterthemen zu. Die Verantwortung für die fachliche Prüfung, Korrektur und Bestätigung bleibt beim Nutzenden im Human-in-the-Loop-Prozess.

Nach der Prüfung können Argumente exportiert werden, damit die Vorhabenträgerin thematisch gebündelt erwidern kann. Die Erwiderungen werden anschließend reimportiert und mit den ursprünglichen Argumenten verbunden. Auf dieser Grundlage kann der Nutzende jedes Argument und die jeweilige Erwiderung fachlich einordnen, Nachforderungen dokumentieren und die relevanten Inhalte für die rechtliche Prüfung und Bewertung im vierten Prüfungsschritt bereitstellen.

## Anforderungen

### Upload und Erfassung der Beteiligungseingänge

- Die Anwendung stellt im EWMS einen Upload für Beteiligungseingänge bereit.
- Der Nutzende kann Beteiligungseingänge als ZIP-Datei mit PDF-Dateien hochladen.
- Der Upload unterstützt Dateien per Drag-and-drop und per manueller Dateiauswahl.
- Nach dem Upload wird ein KI-Workflow zur Textextraktion, Zerschneidung und thematischen Zuordnung gestartet.
- Die Anwendung macht sichtbar, dass die Verarbeitung länger dauern kann und nicht unmittelbar abgeschlossen sein muss.
- Beteiligungseingänge werden anhand ihrer Beteiligungs-ID aus dem Dateinamen systematisiert.
- Die Beteiligungs-ID unterscheidet Einwendungen privater Personen, Stellungnahmen von Trägern öffentlicher Belange und Stellungnahmen anerkannter Naturschutzvereinigungen.

### Übersicht und Filterung

- Die Anwendung zeigt eine Übersicht der hochgeladenen Beteiligungseingänge.
- Der Nutzende kann alle Beteiligungseingänge gemeinsam anzeigen.
- Der Nutzende kann Beteiligungseingänge nach Einwendungen privater Personen filtern.
- Der Nutzende kann Beteiligungseingänge nach Stellungnahmen von Trägern öffentlicher Belange filtern.
- Der Nutzende kann Beteiligungseingänge nach Stellungnahmen anerkannter Naturschutzvereinigungen filtern.
- Zu jedem Beteiligungseingang ist sichtbar, wie viele zugehörige Argumente bereits geprüft wurden.
- Der Nutzende kann einen Beteiligungseingang auswählen und die zugehörigen Argumente einsehen.

### Extrahierter Text und Originaldatei

- Die Anwendung zeigt zum ausgewählten Beteiligungseingang den extrahierten Text an.
- Die Anwendung stellt zusätzlich die Original-PDF-Datei bereit.
- Der Nutzende kann zwischen extrahiertem Text und Originaldatei wechseln.
- Der Nutzende kann ein Argument im Kontext des ursprünglichen Schreibens nachvollziehen.
- Der Nutzende kann Abweichungen zwischen extrahiertem Text und Originaldatei fachlich prüfen.
- Der Nutzende kann fehlerhaft extrahierten Text manuell korrigieren.
- Nach der Prüfung kann der Nutzende den bearbeiteten Text beziehungsweise das Argument als geprüft bestätigen.

### Argumente und Themenzuordnung

- Die KI zerschneidet Beteiligungseingänge in einzelne Argumente.
- Die KI verändert den Inhalt der Argumente nicht und formuliert sie nicht um.
- Jedes Argument bleibt auf den Ursprungstext zurückführbar.
- Die KI ordnet Argumente einem Thema zu.
- Die KI ordnet Argumente bei Bedarf zusätzlich einem Unterthema zu.
- KI-generierte Zerschneidung und Themenzuordnung sind als KI-Unterstützung erkennbar.
- Der Nutzende kann die Zerschneidung und Themenzuordnung fachlich prüfen.
- Der Nutzende kann ein Argument bearbeiten oder ergänzen.
- Der Nutzende kann die Themen- oder Unterthemenzuordnung eines Arguments anpassen.
- Der Nutzende kann ein Argument als geprüft markieren.

### Export an die Vorhabenträgerin

- Der Nutzende kann geprüfte Argumente für die Erwiderung durch die Vorhabenträgerin exportieren.
- Der Export enthält die einzelnen Argumente.
- Der Export enthält die dem Argument zugeordnete Beteiligungs-ID.
- Der Export enthält das erkannte beziehungsweise bestätigte Thema.
- Der Export unterstützt eine CSV-Struktur, damit Argumente nach Thema sortiert und gesammelt erwidert werden können.
- Der Export kann perspektivisch als Synopse im Word- oder PDF-Format bereitgestellt werden.
- Der Export darf keine ungeprüften KI-Umformulierungen als verbindliche Außenkommunikation verwenden.

### Reimport und Einordnung der Erwiderungen

- Die Anwendung unterstützt den Reimport der Erwiderungen der Vorhabenträgerin.
- Reimportierte Erwiderungen werden dem jeweiligen Argument zugeordnet.
- Der Nutzende kann Argument, Erwiderung und eigene Einordnung zusammen betrachten.
- Der Nutzende kann eine fachliche Prüfanmerkung zur Erwiderung erfassen.
- Der Nutzende kann dokumentieren, dass eine Erwiderung hinreichend ist.
- Der Nutzende kann dokumentieren, dass weitere Informationen nachzufordern sind.
- Der Nutzende kann aus der Einordnung heraus interne Kommentare anlegen.
- Der Nutzende kann aus der Einordnung heraus Nachforderungen formulieren.
- Der EWMS-Schritt gilt erst als fachlich abgeschlossen, wenn alle relevanten Argumente und Erwiderungen geprüft und eingeordnet wurden.

### Integration in die rechtliche Prüfung und Bewertung

- Geprüfte Argumente und reimportierte Erwiderungen werden themenbezogen für die rechtliche Prüfung und Bewertung bereitgestellt.
- Im Beschlusskontext werden die Beteiligungseingänge angezeigt, die zum aktuell bearbeiteten Thema gehören.
- Wenn ein Argument mehreren Themenbezügen zugeordnet ist, wird es im passenden Themenkontext auffindbar.
- Beim Schreiben eines thematischen Beschlusskapitels kann der Nutzende die zugehörigen Argumente und Erwiderungen einsehen.
- Der Nutzende kann erkennen, welche Argumente im Beschluss bereits berücksichtigt wurden.
- Der Nutzende kann Argumente im Beschlusskontext als berücksichtigt markieren.
- Der Berücksichtigungsstatus aus der rechtlichen Prüfung und Bewertung wird im EWMS sichtbar reflektiert.
- Die Anwendung macht deutlich, dass nicht jedes Argument wörtlich in den Beschluss übernommen werden muss.
- Die Anwendung unterstützt die Auseinandersetzung mit allen relevanten Argumenten, ohne automatisch über rechtliche Relevanz, Präklusion oder Beschlusswürdigung zu entscheiden.
- Informationen aus dem Erörterungstermin können als nachgelagerter fachlicher Kontext für die rechtliche Prüfung und Beschlusserstellung relevant werden, werden aber nicht als eigener EWMS-Bearbeitungsschritt spezifiziert.

## Technische Anmerkungen

- Die Präsentation zeigte Teile des EWMS mit Mock-Daten und Teile der mittleren Darstellung noch im Figma-Zielbild.
- Die finale Ausgestaltung der mittleren Swimlane für extrahierten Text und Originaldatei ist noch mit dem Implementierungsstand abzugleichen.
- `EWMS` wird als projekttypische Kurzform für Einwendungsmanagement beziehungsweise Einwendungsmanagementsystem verwendet.
- `RPB` wird nur als interner Alias für die rechtliche Prüfung und Bewertung verstanden; nutzerseitig soll die ausgeschriebene Bezeichnung verwendet werden.
- KI-Ausgaben sind Hilfestellungen und müssen im Human-in-the-Loop-Prozess geprüft, korrigiert oder verworfen werden können.

## User Interface

- Die EWMS-Arbeitsfläche ist desktop-orientiert und lane-basiert aufgebaut.
- Links werden Beteiligungseingänge mit Filterung und Prüfstand angezeigt.
- In der Mitte werden extrahierter Text und Originaldatei des ausgewählten Beteiligungseingangs angezeigt.
- Rechts werden die aus dem Beteiligungseingang geschnittenen Argumente mit Thema, Unterthema, KI-Kennzeichnung und Prüfstatus angezeigt.
- Aktionsmenüs ermöglichen das Bearbeiten, Ergänzen und Prüfen einzelner Argumente.
- Export- und Importaktionen sind in der Arbeitsfläche sichtbar erreichbar.
- KI-generierte Zerschneidung und Themenzuordnung sind visuell klar gekennzeichnet.
- Der Beschlusskontext in der rechtlichen Prüfung und Bewertung zeigt thematisch passende Beteiligungseingänge als konsumierbaren Kontext, nicht als separate EWMS-Hauptansicht.

## Akzeptanzkriterien

### 1. Upload und Verarbeitung

- Der Nutzende kann im EWMS eine ZIP-Datei mit PDF-Beteiligungseingängen hochladen.
- Der Upload kann per Drag-and-drop ausgeführt werden.
- Der Upload kann per manueller Dateiauswahl ausgeführt werden.
- Nach dem Upload wird ein Verarbeitungsstatus für den KI-Workflow angezeigt.
- Nach erfolgreicher Verarbeitung sind die Beteiligungseingänge in der EWMS-Übersicht sichtbar.
- Beteiligungseingänge werden anhand der Beteiligungs-ID aus dem Dateinamen systematisiert.
- Einwendungen privater Personen, Stellungnahmen von Trägern öffentlicher Belange und Stellungnahmen anerkannter Naturschutzvereinigungen sind unterscheidbar.

### 2. Übersicht und Filter

- Die Übersicht zeigt alle verarbeiteten Beteiligungseingänge.
- Die Übersicht kann auf Einwendungen privater Personen gefiltert werden.
- Die Übersicht kann auf Stellungnahmen von Trägern öffentlicher Belange gefiltert werden.
- Die Übersicht kann auf Stellungnahmen anerkannter Naturschutzvereinigungen gefiltert werden.
- Zu jedem Beteiligungseingang wird der Prüfstand der zugehörigen Argumente im Format `X von Y geprüft` oder einer vergleichbaren eindeutigen Darstellung angezeigt.
- Die Auswahl eines Beteiligungseingangs zeigt dessen zugehörige Argumente.

### 3. Originaltext, Extraktion und Korrektur

- Zum ausgewählten Beteiligungseingang ist der extrahierte Text sichtbar.
- Zum ausgewählten Beteiligungseingang kann die Original-PDF-Datei geöffnet werden.
- Der Nutzende kann ein Argument aus der Argumentliste im Kontext des ursprünglichen Schreibens nachvollziehen.
- Der Nutzende kann fehlerhaft extrahierten Text korrigieren.
- Nach der Korrektur bleibt die Änderung beim erneuten Öffnen des Beteiligungseingangs erhalten.
- Der Nutzende kann ein geprüftes Argument als geprüft markieren.

### 4. Argumente und Themenzuordnung

- Die Anwendung zeigt die KI-geschnittenen Argumente eines Beteiligungseingangs an.
- Jedes Argument zeigt mindestens den Argumenttext, das Thema, optional ein Unterthema und den Prüfstatus.
- KI-generierte Zerschneidung und Themenzuordnung sind als KI-Unterstützung gekennzeichnet.
- Der Nutzende kann ein Argument bearbeiten oder ergänzen.
- Der Nutzende kann die Themenzuordnung eines Arguments ändern.
- Der Nutzende kann die Unterthemenzuordnung eines Arguments ändern, sofern Unterthemen fachlich vorhanden sind.
- Änderungen an Argumenttext, Thema oder Unterthema bleiben beim erneuten Öffnen erhalten.

### 5. Export und Erwiderung

- Der Nutzende kann geprüfte Argumente als CSV für die Vorhabenträgerin exportieren.
- Die CSV enthält pro Argument die Beteiligungs-ID, den Argumenttext und das zugeordnete Thema.
- Die exportierte CSV ermöglicht eine Sortierung oder Gruppierung nach Thema.
- Ungeprüfte KI-Umformulierungen werden nicht als verbindlicher Inhalt exportiert.
- Der Nutzende kann Erwiderungen der Vorhabenträgerin wieder importieren.
- Importierte Erwiderungen werden den passenden Argumenten zugeordnet.
- Bei einem Argument sind nach dem Import Argumenttext, Erwiderung und eigene Einordnung gemeinsam sichtbar.

### 6. Einordnung, Kommentare und Nachforderungen

- Der Nutzende kann zu einer Erwiderung eine fachliche Einordnung erfassen.
- Der Nutzende kann eine Erwiderung als hinreichend eingeordnet dokumentieren.
- Der Nutzende kann dokumentieren, dass zu einem Argument oder einer Erwiderung weitere Informationen erforderlich sind.
- Der Nutzende kann aus dem EWMS-Kontext eine Nachforderung formulieren.
- Der Nutzende kann interne Kommentare zu Argumenten oder Erwiderungen erfassen.
- Kommentare und Nachforderungen bleiben dem jeweiligen Argument beziehungsweise Beteiligungskontext nachvollziehbar zugeordnet.
- Der EWMS-Fortschritt aktualisiert sich, wenn Argumente geprüft und Erwiderungen eingeordnet werden.

### 7. Integration in die rechtliche Prüfung und Bewertung

- Geprüfte Argumente stehen in der rechtlichen Prüfung und Bewertung themenbezogen zur Verfügung.
- Reimportierte Erwiderungen stehen in der rechtlichen Prüfung und Bewertung themenbezogen zur Verfügung.
- Beim Bearbeiten eines Beschlusskapitels werden die zum Thema passenden Beteiligungseingänge beziehungsweise Argumente angezeigt.
- Der Nutzende kann im Beschlusskontext nachvollziehen, welche Argumente noch offen und welche bereits berücksichtigt sind.
- Der Nutzende kann ein Argument im Beschlusskontext als berücksichtigt markieren.
- Die Markierung als berücksichtigt wird im EWMS sichtbar.
- Die Anwendung trifft keine automatische Entscheidung darüber, ob ein Argument rechtlich im Beschluss zu würdigen ist.
- Der Nutzende kann auf Grundlage der angezeigten Argumente, Erwiderungen und Einordnungen selbst entscheiden, ob und wie ein Punkt im Beschluss aufgegriffen wird.

### 8. Human-in-the-Loop und Scope-Abgrenzung

- Die Anwendung kennzeichnet KI-generierte Zerschneidung, Themenzuordnung und weitere KI-Hinweise eindeutig.
- Der Nutzende kann KI-Ergebnisse prüfen, korrigieren, übernehmen oder verwerfen.
- Die Anwendung verändert Argumente nicht automatisch inhaltlich.
- Die Anwendung entscheidet nicht automatisch über Präklusion.
- Die Anwendung entscheidet nicht automatisch über die endgültige rechtliche Relevanz eines Beteiligungseingangs.
- Der Erörterungstermin wird nicht als eigener Bearbeitungsschritt im EWMS umgesetzt.

## Abhängigkeiten

- Die materielle Vollständigkeitsprüfung muss fachlich so weit abgeschlossen sein, dass die Behörden- und Öffentlichkeitsbeteiligung gestartet werden kann.
- Die eingegangenen Beteiligungseingänge müssen als verwertbare PDF-Dateien vorliegen.
- Die Dateinamen beziehungsweise Metadaten müssen eine Beteiligungs-ID enthalten, aus der die Art des Beteiligungseingangs ableitbar ist.
- Die KI-gestützte Textextraktion muss verfügbar sein.
- Die KI-gestützte Zerschneidung und Themenzuordnung muss verfügbar sein.
- Die Themenstruktur muss aus den vorgelagerten Prüfschritten verfügbar sein.
- Export und Reimport müssen ein stabiles Austauschformat für die Vorhabenträgerin verwenden.
- Die rechtliche Prüfung und Bewertung muss Beteiligungseingänge, Argumente und Erwiderungen themenbezogen konsumieren können.
- Kommentarfunktion und Nachforderungsliste müssen für den EWMS-Kontext verfügbar sein.

## Definition of Done

- Die Frontend-Implementierung ist abgeschlossen.
- Die Backend-Implementierung ist abgeschlossen.
- Die KI-Workflows für Textextraktion, Zerschneidung und Themenzuordnung sind angebunden.
- Export und Reimport der Erwiderungen sind umgesetzt.
- Die Integration der geprüften Argumente und Erwiderungen in die rechtliche Prüfung und Bewertung ist umgesetzt.
- Die Akzeptanzkriterien wurden erfüllt.
- Die User Story wurde vom Team ENTE getestet.
- Alle Sub-Tasks wurden geschlossen.
- Die API-Dokumentation ist vollständig.
- Das Feature wurde im Wiki dokumentiert.

## Offene Fragen

- Welche finale Dateinamen- und ID-Konvention gilt für private Einwendungen, Stellungnahmen von Trägern öffentlicher Belange und Stellungnahmen anerkannter Naturschutzvereinigungen?
- Welche Statuswerte sollen Argumente im EWMS final haben?
- Wird die Bearbeitung eines Arguments immer auf Argumentebene oder zusätzlich auf Beteiligungseingangsebene bestätigt?
- Welche Bearbeitungsrechte gelten für Korrekturen am extrahierten Text und an der Themenzuordnung?
- Ist der Word- beziehungsweise PDF-Export der Synopse Bestandteil des aktuellen Scopes oder eine Folgeausbaustufe?
- Welches konkrete Austauschformat wird für den Reimport der Erwiderungen verbindlich verwendet?
- Wie werden fehlerhafte oder nicht eindeutig zuordenbare Erwiderungen beim Reimport behandelt?
- Welche konkrete Statusbezeichnung soll der Berücksichtigungsstatus in der rechtlichen Prüfung und Bewertung erhalten?
- Muss ein Argument im EWMS abgeschlossen sein, bevor es in der rechtlichen Prüfung und Bewertung sichtbar wird, oder reicht eine vorläufige Themenzuordnung?
- Wie werden Informationen aus dem Erörterungstermin später in den Beschlusskontext eingebunden?
