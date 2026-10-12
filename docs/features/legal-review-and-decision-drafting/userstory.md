# 1.6 RPB | Rechtliche Prüfung und Bewertung mit Beschlusserstellung

Als Bearbeiter oder Federführung eines Planfeststellungsverfahrens
möchte ich je Thema die zugeordneten Normen rechtlich prüfen, relevante Unterlagen und Beteiligungseingänge im Kontext sehen und parallel das passende Kapitel des Planfeststellungsbeschlusses bearbeiten können,
damit ich einen nachvollziehbaren Verwaltungsaktentwurf auf Grundlage der relevanten Rechtsgrundlagen, Fundstellen und Beteiligungseingänge erstellen kann.

## Beschreibung

Die rechtliche Prüfung und Bewertung ist der beschlussnahe Prüfschritt nach der materiellen Vollständigkeitsprüfung und nach der Bearbeitung der Beteiligungseingänge. In diesem Schritt werden die Ergebnisse aus Dokumentenprüfung, Normbearbeitung, Fundstellen, Einwendungen und Stellungnahmen in die Erstellung des Planfeststellungsbeschlusses überführt. Der Planfeststellungsbeschluss wird dabei als Verwaltungsaktentwurf bearbeitet.

Die Bearbeitung erfolgt themenbasiert. Ein Thema verbindet Beschlusskapitel, Rechtsgrundlagen, Dokumente, Fundstellen und Beteiligungseingänge. Die Person, die ein Thema in den vorgelagerten Schritten bearbeitet hat, schreibt fachlich auch den zugehörigen Beschlussteil. Für den Release-Stand BZAB gilt jedoch die Arbeitsannahme, dass jede nutzende Person den gesamten Beschluss einsehen und bearbeiten kann. Kapitelbezogene Rollen- und Bearbeitungsrechte sind nicht Bestandteil dieser Story.

Der Beschluss-Editor ist die zentrale Arbeitsfläche. Links steht die Gliederung des Beschlusses, in der Mitte wird der Beschlusstext bearbeitet, rechts werden die thematisch passenden Rechtsgrundlagen, KI-Bewertungen, Beteiligungseingänge und Dokumente im Kontext angezeigt. Die bisherige separate Beschlussansicht entfällt; rechtliche Prüfung, Bewertung und Beschlusserstellung werden in einem Prüfscreen zusammengeführt.

KI unterstützt die Normen- und Satzprüfung durch kontextbezogene Bewertungen, Prüfergebnisse, Fundstellen und perspektivisch Risikohinweise. Diese Ausgaben sind Hinweise im Human-in-the-Loop-Prozess. Sie ersetzen keine rechtliche Entscheidung, keine eigene Bewertung und keine redaktionelle Verantwortung der Nutzenden.

## Anforderungen

### Einstieg und Beschlussgliederung

- Die Anwendung stellt einen Prüfscreen für die rechtliche Prüfung und Bewertung mit Beschlusserstellung bereit.
- Der Prüfscreen kann aus dem themenbezogenen Arbeitskontext geöffnet werden.
- Der Prüfscreen zeigt den Planfeststellungsbeschluss beziehungsweise Verwaltungsaktentwurf als zentrale Arbeitsfläche.
- Die Anwendung zeigt links eine navigierbare Gliederung des Beschlusses.
- Die Gliederung kommt aus dem Backend und orientiert sich an der Mustergliederung des Fernstraßen-Bundesamts.
- Der Nutzende kann ein Beschlusskapitel in der Gliederung auswählen.
- Das ausgewählte Kapitel ist in der Gliederung eindeutig markiert.
- Beim Auswählen eines Kapitels wird der zugehörige Beschlusstext im Beschluss-Editor angezeigt.
- Die bisherige separate Beschlussansicht entfällt zugunsten des integrierten Prüfscreens.

### Themen- und Kapitelkontext

- Jedes fachlich relevante Beschlusskapitel korrespondiert mit einem Thema.
- Die Anwendung bestimmt für das ausgewählte Beschlusskapitel den zugehörigen Themenkontext.
- Zum ausgewählten Themenkontext werden die passende Rechtsgrundlage, Beteiligungseingänge und Dokumente angezeigt.
- Beteiligungseingänge umfassen die dem Thema zugeordneten Einwendungen und Stellungnahmen.
- Dokumente stammen aus der formalen Vollständigkeitsprüfung und ihrer Themenzuordnung.
- Fundstellen, Dokumente, Normen und Beteiligungseingänge werden so bereitgestellt, dass sie die Bearbeitung des Beschlusstextes unterstützen.
- Im Release-Stand BZAB kann der Nutzende den gesamten Beschluss einsehen und bearbeiten.
- Rollen- und Rechtebeschränkungen für einzelne Beschlusskapitel sind nicht Bestandteil dieser Story.

### Beschluss-Editor

- Der Beschluss-Editor bildet den zentralen Schreibbereich für den ausgewählten Beschlussteil.
- Der Nutzende kann den Beschlusstext des ausgewählten Kapitels bearbeiten.
- Änderungen werden kapitelbezogen gespeichert.
- Beim Wechsel zwischen Kapiteln bleiben gespeicherte Änderungen erhalten.
- Der Schreibfluss bleibt auch dann möglich, wenn KI-Kontextinformationen nicht genutzt werden.
- KI-Hinweise führen nicht automatisch zu Änderungen am Beschlusstext.

### Rechtsgrundlage und Prüffortschritt

- Die Anwendung zeigt zum ausgewählten Themenkontext die zugehörige Rechtsgrundlage.
- Die Rechtsgrundlage umfasst die dem Thema zugeordneten Gesetze und Normen.
- Die Rechtsgrundlage wird aus Backend-Daten bereitgestellt.
- Der Nutzende kann die Rechtsgrundlage fachlich bearbeiten, indem Normen hinzugefügt oder entfernt werden.
- Die Anwendung zeigt auf Gesetzesebene, wie viele Normen bereits geprüft wurden.
- Die Anwendung zeigt auf Gesetzesebene, wie viele Sätze bereits geprüft wurden.
- Die Anwendung zeigt auf Normebene, wie viele Sätze der Norm bereits geprüft wurden.
- Der Nutzende kann aus der Übersicht in eine einzelne Norm wechseln.
- Der Nutzende kann aus der Normansicht über einen eindeutigen Rücksprung zur Übersicht zurückkehren.

### Normen- und Satzprüfung

- Die Normansicht zeigt die ausgewählte Norm gegliedert nach Sätzen.
- Der Nutzende kann eine Norm gesamthaft als geprüft markieren.
- Der Nutzende kann alle Sätze einer Norm gesammelt als geprüft markieren.
- Der Nutzende kann die geprüfte Markierung einer Norm oder ihrer Sätze wieder aufheben.
- Der Nutzende kann einzelne Sätze nacheinander prüfen.
- Zu einem Satz kann der Nutzende einen Kommentar hinzufügen.
- Zu einem Satz kann der Nutzende eine Nachforderung anlegen.
- Nachforderungen aus dem Prüfscreen werden konsistent in der Nachforderungsliste des Verfahrens geführt.
- Für Normen und Sätze sind mindestens die Zustände `geprüft und im Beschluss` sowie `nicht geprüft und nicht im Beschluss` unterscheidbar.
- Statusänderungen aktualisieren den angezeigten Prüffortschritt.

### KI-Bewertung und Prüfergebnis

- Der Nutzende kann einen Satz aufklappen, um die KI-Bewertung einzusehen.
- Die KI-Bewertung zeigt eine Kurzbewertung zur Erfüllung der relevanten Tatbestandsmerkmale des Satzes.
- Der Nutzende kann ein ausführliches Prüfergebnis zum Satz öffnen.
- Das ausführliche Prüfergebnis enthält die Langbewertung der KI zum ausgewählten Satz.
- KI-Bewertungen und Prüfergebnisse sind als KI-generierte Hinweise erkennbar.
- Die Anwendung macht deutlich, dass die rechtliche Bewertung beim Nutzenden verbleibt.
- Perspektivisch können aus dem ausführlichen Prüfergebnis heraus passende Dokumentstellen in der Dokumenten-Swimlane geöffnet werden.

### Dokumenten-Swimlane

- Der Prüfscreen enthält eine Dokumenten-Swimlane für die dem Thema zugeordneten Dokumente.
- Die Dokumenten-Swimlane startet nicht leer.
- Beim Öffnen des Prüfscreens ist ein relevantes Dokument vorausgewählt.
- Ist der Erläuterungsbericht dem Thema zugeordnet, kann er als initiales Dokument vorausgewählt werden.
- Bei Auswahl eines dokumentbezogenen Kontexts wird das passende Dokument in der Dokumenten-Swimlane angezeigt.
- Das Verhalten der Dokumenten-Swimlane folgt der übergreifenden Definition der Dokumenten-Swimlane im BMDS.

### Kommentare, Nachforderungen und Risikohinweise

- Der Nutzende kann Kommentare aus dem rechtlichen Prüfungskontext dokumentieren.
- Kommentare bleiben dem jeweiligen Satz, der Norm oder dem fachlichen Kontext nachvollziehbar zugeordnet.
- Der Nutzende kann Nachforderungen aus dem Prüfungskontext anlegen, wenn Informationen für die Bewertung fehlen.
- Nachforderungen bleiben in der Nachforderungsliste des Verfahrens nachvollziehbar.
- Nach Abschluss einer Prüfungseinheit kann der Nutzende Risikohinweise generieren lassen.
- Risikohinweise werden im Prüfungskontext angezeigt.
- Risikohinweise sind als KI-generierte Hinweise erkennbar.
- Risikohinweise führen nicht automatisch zu einer Änderung des Beschlusstextes.

### Scope und Folgeausbaustufen

- Rechtsänderungen werden in diesem Kontext nur berücksichtigt, soweit sie im aktuellen Funktionsumfang sichtbar sind.
- Planänderungen werden in diesem Kontext nur berücksichtigt, soweit sie im aktuellen Funktionsumfang sichtbar sind.
- Jobstatusanzeigen werden nur berücksichtigt, soweit sie für den aktuellen Prüfscreen erforderlich sind.
- Vertreterregelungen und differenzierte Rollenrechte sind nicht Bestandteil dieser Story.
- Die detaillierte Rechtsmethodik-Sicht mit Tatbestandsmerkmalen, Begriffen und vertiefter Dekonstruktion ist nicht Bestandteil dieser Story und wird als Folgeausbaustufe behandelt.

## Technische Anmerkungen

- `RPB` wird in dieser Story als interner Arbeits- und Dateiname verwendet; nutzerseitig ist `rechtliche Prüfung und Bewertung` die bevorzugte Bezeichnung.
- Die fachliche Benennung des zusammengeführten Arbeitsschritts ist noch offen, zum Beispiel `Prüfung und Beschluss`.
- Die Beschlussgliederung und die themenbezogene Rechtsgrundlage werden aus dem Backend erwartet.
- Für BZAB gilt die Arbeitsannahme, dass alle Nutzenden alle Rechte im Beschlusskontext haben.
- Die bisherige separate Beschlussansicht entfällt in BZAB.
- Die genaue globale Beschreibung der Dokumenten-Swimlane ist noch mit dem zuständigen Team abzugleichen.
- Die Rechtsmethodik-Sicht ist für BZAC vorgesehen und wird in dieser Story nicht spezifiziert.

## User Interface

- Der Prüfscreen ist desktop-orientiert und für parallele Prüfung und Textbearbeitung ausgelegt.
- Die Arbeitsfläche besteht aus Beschlussgliederung, Beschluss-Editor, KI- beziehungsweise Rechtsgrundlagen-Übersicht und Dokumenten-Swimlane.
- Die Beschlussgliederung befindet sich links.
- Der Beschluss-Editor bildet den zentralen Schreibbereich.
- Die KI- beziehungsweise Rechtsgrundlagen-Übersicht zeigt Rechtsgrundlagen, Prüffortschritt, Normen, Sätze und KI-Bewertungen.
- Die Dokumenten-Swimlane zeigt relevante Dokumente im Kontext der aktuellen Auswahl.
- Geprüfte Zustände sind visuell eindeutig von offenen Zuständen unterscheidbar.
- KI-Ausgaben sind klar als KI-generierte Hinweise gekennzeichnet.

## Akzeptanzkriterien

### 1. Einstieg und Gliederung

- Der Nutzende kann den Prüfscreen für die rechtliche Prüfung und Bewertung mit Beschlusserstellung öffnen.
- Im Prüfscreen ist die Gliederung des Beschlusses links sichtbar.
- Die Gliederung basiert auf Backend-Daten.
- Die Gliederung orientiert sich an der Mustergliederung des Fernstraßen-Bundesamts.
- Der Nutzende kann ein Beschlusskapitel auswählen.
- Das aktuell ausgewählte Kapitel ist in der Gliederung eindeutig hervorgehoben.
- Die Auswahl eines Kapitels öffnet den zugehörigen Beschlusstext im Beschluss-Editor.
- Die Arbeitsfläche zeigt keine zusätzliche separate Beschlussansicht.

### 2. Themen- und Kapitelkontext

- Beim Öffnen eines Beschlusskapitels wird der zugehörige Themenkontext bestimmt.
- Zum ausgewählten Themenkontext wird die zugehörige Rechtsgrundlage angezeigt.
- Zum ausgewählten Themenkontext werden die zugehörigen Dokumente angezeigt.
- Zum ausgewählten Themenkontext werden die zugehörigen Beteiligungseingänge angezeigt.
- Einwendungen und Stellungnahmen sind im Kontext des zugeordneten Themas sichtbar.
- Dokumente aus der formalen Vollständigkeitsprüfung werden über ihre Themenzuordnung in den Beschlusskontext eingebunden.
- Im Release-Stand BZAB ist der gesamte Beschluss für alle Nutzenden lesbar und bearbeitbar.

### 3. Beschluss-Editor

- Der Nutzende kann den Beschlusstext des ausgewählten Kapitels bearbeiten.
- Änderungen am Kapiteltext werden kapitelbezogen gespeichert.
- Gespeicherte Änderungen bleiben beim Wechsel zwischen Kapiteln erhalten.
- KI-Hinweise ändern den Beschlusstext nicht automatisch.

### 4. Rechtsgrundlage und Prüffortschritt

- Die Rechtsgrundlage zeigt je Gesetz die Anzahl geprüfter Normen im Verhältnis zur Gesamtzahl der Normen.
- Die Rechtsgrundlage zeigt je Gesetz die Anzahl geprüfter Sätze im Verhältnis zur Gesamtzahl der Sätze.
- Die Normansicht zeigt je Norm die Anzahl geprüfter Sätze im Verhältnis zur Gesamtzahl der Sätze.
- Der Nutzende kann Normen zur Rechtsgrundlage eines Kapitels hinzufügen.
- Der Nutzende kann Normen aus der Rechtsgrundlage eines Kapitels entfernen.
- Der Nutzende kann eine Norm öffnen.
- Der Nutzende kann aus der Normansicht über einen eindeutigen Rücksprung zur Übersicht zurückkehren.

### 5. Normen- und Satzprüfung

- Die Normansicht zeigt die ausgewählte Norm in Sätzen.
- Der Nutzende kann eine Norm gesamthaft als geprüft markieren.
- Der Nutzende kann alle Sätze einer Norm gesammelt als geprüft markieren.
- Der Nutzende kann einzelne Sätze als geprüft markieren.
- Der Nutzende kann geprüfte Markierungen wieder aufheben.
- Die Zustände `geprüft und im Beschluss` und `nicht geprüft und nicht im Beschluss` sind unterscheidbar.
- Statusänderungen aktualisieren den angezeigten Prüffortschritt.
- Geprüfte Normen und Sätze sind visuell eindeutig von offenen Zuständen unterscheidbar.

### 6. Kommentare und Nachforderungen

- Der Nutzende kann zu einem Satz einen Kommentar erfassen.
- Kommentare bleiben beim erneuten Öffnen des Satzes erhalten.
- Der Nutzende kann zu einem Satz eine Nachforderung anlegen.
- Angelegte Nachforderungen erscheinen nachvollziehbar in der Nachforderungsliste des Verfahrens.

### 7. KI-Bewertung und Human-in-the-Loop

- Das Aufklappen eines Satzes zeigt eine KI-Kurzbewertung zur Erfüllung der relevanten Tatbestandsmerkmale.
- Die KI-Kurzbewertung ist sichtbar als KI-generierter Hinweis gekennzeichnet.
- Der Nutzende kann das ausführliche Prüfergebnis zu einem Satz öffnen.
- Das ausführliche Prüfergebnis wird getrennt von der Kurzbewertung dargestellt.
- KI-Bewertungen und Prüfergebnisse treffen keine verbindliche rechtliche Entscheidung.
- Der Nutzende kann die rechtliche Bewertung selbst prüfen, übernehmen, anpassen oder verwerfen.

### 8. Dokumenten-Swimlane

- Beim Öffnen des Prüfscreens ist in der Dokumenten-Swimlane ein Dokument vorausgewählt.
- Die Dokumenten-Swimlane erscheint beim initialen Öffnen nicht leer.
- Ist der Erläuterungsbericht dem Thema zugeordnet und kein spezifischerer Dokumentkontext ausgewählt, kann er initial angezeigt werden.
- Bei Auswahl eines dokumentbezogenen Kontexts wird das passende Dokument in der Dokumenten-Swimlane angezeigt.

### 9. Risikohinweise

- Nach Abschluss einer Prüfungseinheit kann der Nutzende Risikohinweise generieren lassen.
- Generierte Risikohinweise werden im Prüfungskontext angezeigt.
- Risikohinweise sind als KI-generierte Hinweise gekennzeichnet.
- Risikohinweise ändern den Beschlusstext nicht automatisch.
- Der Nutzende entscheidet, ob und wie ein Risikohinweis in der weiteren Bearbeitung berücksichtigt wird.

### 10. Scope-Abgrenzung

- Rollen- und Rechtebeschränkungen für einzelne Kapitel sind nicht Bestandteil dieser Story.
- Vertreterregelungen sind nicht Bestandteil dieser Story.
- Die detaillierte Rechtsmethodik-Sicht zu Tatbestandsmerkmalen, Begriffen und vertiefter Dekonstruktion ist nicht Bestandteil dieser Story.
- Rechtsänderungen, Planänderungen und Jobstatusanzeigen werden nur sichtbar gemacht, soweit sie im aktuellen Funktionsumfang vorgesehen sind.

## Abhängigkeiten

- Die formale Vollständigkeitsprüfung muss so weit abgeschlossen sein, dass Dokumente Themen zugeordnet sind.
- Die materielle Vollständigkeitsprüfung muss die themenbezogene Normauswahl und Rechtsgrundlage bereitstellen.
- Beteiligungseingänge aus dem Einwendungsmanagement müssen pro Thema verfügbar sein.
- Die Beschlussgliederung muss im Backend verfügbar sein.
- Die themenbezogene Rechtsgrundlage muss im Backend verfügbar und bearbeitbar sein.
- KI-Bewertungen und Prüfergebnisse müssen für die relevanten Normen beziehungsweise Sätze bereitgestellt sein.
- Die Kommentarfunktion und die Nachforderungsliste müssen für den Prozessschritt der rechtlichen Prüfung und Bewertung verfügbar sein.
- Die zentrale Definition der Dokumenten-Swimlane muss vorliegen, damit sie konsistent im Prüfscreen genutzt werden kann.

## Definition of Done

- Die Frontend-Implementierung ist abgeschlossen.
- Die Backend-Implementierung ist abgeschlossen.
- Die Akzeptanzkriterien wurden erfüllt.
- Die User Story wurde vom Team ENTE getestet.
- Alle Sub-Tasks wurden geschlossen.
- Die API-Dokumentation ist vollständig.
- Das Feature wurde im Wiki dokumentiert.

## Offene Fragen

- Wie soll der zusammengeführte Arbeitsschritt final nutzerseitig heißen, zum Beispiel `rechtliche Prüfung und Bewertung`, `Prüfung und Beschluss` oder eine andere Bezeichnung?
- Auf welcher Ebene werden Risikohinweise ausgelöst: Satz, Norm, Kapitel, Thema oder eine andere Prüfungseinheit?
- Genügen die zwei Status `geprüft und im Beschluss` sowie `nicht geprüft und nicht im Beschluss`, oder wird ein Zwischenstatus für geprüfte, aber noch nicht übernommene Inhalte benötigt?
- Wie wird die Dokumenten-Swimlane final beschrieben, insbesondere bei mehreren gleich relevanten Dokumenten?
- Werden Links aus ausführlichen KI-Prüfergebnissen in Dokumentstellen im aktuellen Scope umgesetzt oder erst später?
- Wie detailliert werden Beteiligungseingänge im Prüfscreen angezeigt, und welche Aktionen sind dort zulässig?
- Sollen Kommentare zusätzlich auf Norm- oder Kapitelebene möglich sein?
- Wie werden Rechtsänderungen im Beschlusskontext konkret markiert?
- Wie werden Planänderungen im Beschlusskontext konkret markiert, wenn sie später in den Scope kommen?
- Sind Vertreter- und Rollenregelungen weiterhin Ziel für BZAC, oder entfällt dieses Thema?
