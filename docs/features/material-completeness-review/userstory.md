# 1.5 MVP | Themenübersicht und themenbezogene materielle Vollständigkeitsprüfung

Als Bearbeiter oder Federführung eines Planfeststellungsverfahrens  
möchte ich Themen der materiellen Vollständigkeitsprüfung auswählen, Dokumente und Fundstellen im Themenkontext prüfen und die einschlägigen Normen je Thema bearbeiten können,  
damit ich nachvollziehbar feststellen kann, ob die Unterlagen die fachlich relevanten Rechtsgrundlagen in ausreichender Tiefe abdecken und wo Nachforderungen erforderlich sind.

## Beschreibung

Die materielle Vollständigkeitsprüfung (MVP) ist der fachliche Prüfschritt nach der formalen Vollständigkeitsprüfung. In diesem Schritt wird je Thema geprüft, ob die dem Verfahren zugeordneten Unterlagen die einschlägigen Normen in ausreichender Detailtiefe tragen, damit die Anstoßfähigkeit der Unterlagen im jeweiligen Themenbereich bewertet werden kann.

Der Einstieg in die MVP erfolgt über eine Themenübersicht. Themen bündeln Dokumente, Fundstellen und Rechtsgrundlagen. Zu jedem Thema werden Fortschritt, offene Nachforderungen und relevante Änderungen sichtbar gemacht. Die KI unterstützt diesen Schritt, indem sie Startnormen und Fundstellen als Hinweise vorschlägt. Diese Vorschläge sind Hilfestellungen und ersetzen keine fachliche oder rechtliche Entscheidung.

Innerhalb eines Themas arbeitet der Nutzende desktop-orientiert in einer mehrspaltigen Prüfansicht mit Dokumentenbaum, Fundstellen, Dokumentansicht und Rechtsgrundlage. Offene Abdeckungsfragen führen zu Nachforderungen. Nachgereichte Unterlagen werden über die formale Vollständigkeitsprüfung erneut dem Thema zugeordnet und können anschließend in der MVP weiter geprüft werden.

## Anforderungen

### Themenübersicht

- Die Anwendung zeigt eine Themenübersicht für die materielle Vollständigkeitsprüfung.
- Jede Themenkarte zeigt, wie viele dem Thema zugeordnete Dokumente bereits geprüft wurden.
- Jede Themenkarte zeigt, wie viele der dem Thema zugeordneten Normen bereits abgedeckt sind.
- Jede Themenkarte zeigt, wie viele Nachforderungen für das Thema offen sind.
- Die Themenübersicht zeigt einen aggregierten Fortschrittsindikator über alle Themen.
- Der Nutzende kann Themen über ein Stichwort suchen. Die Suche bezieht sich auf den Thementitel.
- Der Nutzende kann Themen filtern.
- Der Nutzende kann Themen auf- oder absteigend sortieren.
- Themen mit fachlich relevanten Änderungen werden in der Themenübersicht eindeutig markiert.
- Der Nutzende kann sich ein Thema zuweisen und eine bestehende Zuweisung wieder freigeben.

### Themenstatus und Fortschritt

- Ein Thema besitzt einen fachlichen Status.
- Ein Thema ist offen, solange noch kein fachlicher Bearbeitungsfortschritt vorliegt.
- Ein Thema ist in Prüfung, sobald die Bearbeitung der Normen oder offener Nachforderungen begonnen hat.
- Ein Thema ist abgeschlossen, sobald alle für das Thema relevanten Normen als abgedeckt bewertet wurden.
- Die Dokumentensichtung unterstützt die Bearbeitung, ist aber nicht selbst die fachliche Entscheidung über die Abdeckung einer Norm.
- Wenn alle Themen abgeschlossen sind, zeigt der Gesamtfortschritt 100 Prozent an.

### Themenbezogene Prüfansicht

- Beim Öffnen eines Themas wechselt die Anwendung in eine themenbezogene Prüfansicht.
- Die Prüfansicht zeigt die dem Thema zugeordneten Dokumente in einer Baum- beziehungsweise Ordnerstruktur.
- Zu jedem Dokument ist sichtbar, wie viele Fundstellen dafür vorliegen.
- Zu jedem Dokument ist ein Bearbeitungsstand sichtbar.
- Beim Auswählen eines Dokuments werden die zugehörigen Fundstellen angezeigt.
- Beim Auswählen eines Dokuments wird das Dokument gleichzeitig in einer Dokumentansicht geöffnet.
- Die Fundstellen werden in der Reihenfolge ihres Auftretens im Dokument dargestellt.
- Jede Fundstelle zeigt eine fachlich verständliche Überschrift, einen Seitenbezug und einen Textauszug.
- KI-generierte Fundstellen sind als KI-Vorschläge erkennbar.
- Beim Auswählen einer Fundstelle springt die Dokumentansicht auf die passende Seite der referenzierten Textstelle.
- Wenn sich eine Fundstelle über mehrere Seiten erstreckt, wird der Anfang der Textstelle angezeigt.
- Die Dokumentansicht muss für die parallele Arbeit auf einem zweiten Bildschirm nutzbar sein.

### Rechtsgrundlage und Normbearbeitung

- Zu jedem Thema wird die zugehörige Rechtsgrundlage angezeigt.
- Die Rechtsgrundlage umfasst die dem Thema zugeordneten Gesetze und Normen.
- Je Thema ist sichtbar, wie viele Normen bereits geprüft beziehungsweise abgedeckt wurden.
- Die durch die KI identifizierten Startnormen sind als Vorschläge erkennbar.
- Der Nutzende kann die themenspezifische Normauswahl fachlich anpassen.
- Der Nutzende kann Normen zu einem Thema hinzufügen.
- Der Nutzende kann Normen aus der themenspezifischen Rechtsgrundlage entfernen.
- Der Nutzende kann den Volltext einer Norm einsehen.
- Der Nutzende kann eine Norm als abgedeckt markieren.
- Der Nutzende kann die Markierung einer Norm wieder aufheben.
- Abgedeckte Normen sind visuell eindeutig von offenen Normen unterscheidbar.
- Die Rechtsgrundlage kann gefiltert werden, damit sich der Nutzende auf relevante Teilmengen konzentrieren kann.

### Kommentare und Nachforderungen

- Fundstellen dienen als Hilfestellung für die Navigation und Bewertung, nicht als automatische Entscheidung über die Abdeckung einer Norm.
- Der Nutzende kann Kommentare aus dem Prüfungskontext dokumentieren.
- Der Nutzende kann aus dem Prüfungskontext Nachforderungen auslösen, wenn Unterlagen oder Informationen für die Abdeckung einer Norm fehlen.
- Offene Nachforderungen werden auf Themenebene sichtbar aggregiert.
- Wenn nachgeforderte Unterlagen eingehen und in der formalen Vollständigkeitsprüfung dem Thema zugeordnet wurden, kann die Prüfung des betroffenen Themas fortgesetzt werden.

### Navigation und Abschluss

- Der Nutzende kann aus der themenbezogenen Prüfansicht jederzeit zur Themenübersicht zurückkehren.
- Der Gesamtfortschritt der MVP erhöht sich mit jedem fachlich abgeschlossenen Thema.
- Nach dem fachlichen Abschluss aller Themen erfolgt eine abschließende Prüfung durch die Federführung, bevor die Unterlagen in die Behörden- und Öffentlichkeitsbeteiligung überführt werden.

## Technische Anmerkungen

- Die aktuelle Frontend-Referenz bildet bereits eine Themenübersicht und eine themenbezogene Prüfansicht ab.
- Die aktuelle Frontend-Referenz nutzt eine lane-basierte Arbeitsfläche mit Dokumentenbaum, Fundstellen, Dokumentviewer und Rechtsgrundlage.
- Die aktuelle Frontend-Referenz unterstützt bereits die Auslagerung des Dokumentviewers auf eine Zweitanzeige.
- Abweichungen zwischen Transcript und aktuellem Implementierungsstand werden in `Offene Fragen` festgehalten.

## User Interface

- Die Themenübersicht besteht aus Suchfeld, Filter- und Sortierfunktionen, einer Fortschrittsanzeige und Themenkarten mit Status, Kennzahlen und Aktionen.
- Die Prüfansicht ist desktop-orientiert aufgebaut und zeigt Dokumente, Fundstellen, Dokumentansicht und Rechtsgrundlage nebeneinander.
- Geprüfte beziehungsweise abgedeckte Zustände sind visuell klar hervorgehoben.
- Die Dokumentansicht unterstützt die Nutzung auf einem zweiten Bildschirm.

## Akzeptanzkriterien

### Themenübersicht

- Die MVP zeigt eine Themenübersicht mit allen konfigurierten Themen als Karten.
- Jede Themenkarte zeigt die Anzahl geprüfter Dokumente im Verhältnis zu allen dem Thema zugeordneten Dokumenten.
- Jede Themenkarte zeigt die Anzahl abgedeckter Normen im Verhältnis zu allen dem Thema zugeordneten Normen.
- Jede Themenkarte zeigt die Anzahl offener Nachforderungen für das Thema.
- Die Themenübersicht zeigt einen aggregierten Fortschrittsindikator im Format `X von Y Themen geprüft`.
- Die Suche filtert Themen anhand des Thementitels.
- Die Themenübersicht unterstützt eine Filterung nach Status.
- Die Themenübersicht unterstützt mindestens eine auf- und absteigende Sortierung.
- Themen mit Rechtsänderungen oder geänderten zugeordneten Dokumenten sind in der Themenkarte eindeutig markiert.
- Der Nutzende kann ein Thema über ein Aktionsmenü sich selbst zuweisen und die Zuweisung wieder freigeben.

### Themenbezogene Prüfansicht

- Das Öffnen eines Themas führt in eine themenbezogene Prüfansicht mit Dokumentenbaum, Fundstellenbereich, Dokumentansicht und Rechtsgrundlage.
- In der Prüfansicht werden ausschließlich die dem ausgewählten Thema zugeordneten Dokumente angezeigt.
- Jedes Dokument zeigt die Anzahl seiner Fundstellen.
- Jedes Dokument zeigt einen nachvollziehbaren Bearbeitungsstand.
- Die Auswahl eines Dokuments zeigt dessen Fundstellen in der Reihenfolge ihres Auftretens und öffnet gleichzeitig das Dokument in der Dokumentansicht.
- Jede KI-generierte Fundstelle ist als KI-Vorschlag markiert und zeigt Überschrift, Seitenbezug und Textauszug.
- Die Auswahl einer Fundstelle springt in der Dokumentansicht auf die referenzierte Seite.
- Bei mehrseitigen Fundstellen wird die erste relevante Seite angezeigt.
- Die Dokumentansicht kann für die parallele Arbeit auf eine Zweitanzeige ausgelagert werden.

### Rechtsgrundlage und Normbearbeitung

- Die Prüfansicht zeigt die dem Thema zugeordneten Gesetze und Normen als Rechtsgrundlage an.
- Für das Thema ist der Fortschritt der geprüften beziehungsweise abgedeckten Normen sichtbar.
- KI-identifizierte Startnormen sind als Vorschläge erkennbar.
- Der Nutzende kann die themenspezifische Normauswahl fachlich anpassen.
- Der Nutzende kann Normen zum Thema hinzufügen oder aus der themenspezifischen Rechtsgrundlage entfernen.
- Der Nutzende kann den Volltext einer Norm einsehen.
- Der Nutzende kann eine Norm als abgedeckt markieren und diese Markierung wieder aufheben.
- Abgedeckte Normen sind visuell eindeutig von offenen Normen unterscheidbar.
- Die Rechtsgrundlage kann gefiltert werden, um die Bearbeitung auf relevante Teilmengen zu fokussieren.

### Kommentare, Nachforderungen und Human-in-the-Loop

- Fundstellen werden als Hilfsmittel dargestellt und führen nicht automatisch zu einer fachlichen Entscheidung über die Abdeckung einer Norm.
- Aus dem Prüfungskontext können Kommentare dokumentiert werden.
- Aus dem Prüfungskontext können Nachforderungen für fehlende oder unzureichende Unterlagen ausgelöst werden.
- Offene Nachforderungen werden auf Themenebene in der Themenübersicht sichtbar gezählt.

### Status und Abschluss

- Ein Thema ist offen, solange noch kein fachlicher Bearbeitungsfortschritt vorliegt.
- Ein Thema ist in Prüfung, sobald die Bearbeitung der Normen oder offener Nachforderungen begonnen hat.
- Ein Thema ist abgeschlossen, sobald alle relevanten Normen als abgedeckt bewertet wurden.
- Die Dokumentensichtung allein führt nicht zum Abschluss eines Themas.
- Der Nutzende kann jederzeit aus der themenbezogenen Prüfansicht zur Themenübersicht zurückkehren.
- Wenn alle Themen abgeschlossen sind, zeigt der Gesamtfortschritt 100 Prozent an.
- Nach dem fachlichen Abschluss aller Themen kann die MVP in die abschließende Prüfung durch die Federführung übergehen.

## Abhängigkeiten

- Die formale Vollständigkeitsprüfung muss so weit abgeschlossen sein, dass Dokumente einem Thema zugeordnet werden können.
- Die dem Thema zugeordneten Dokumente müssen im Verfahren vorhanden sein.
- Die KI-gestützte Inhaltsextraktion muss Startnormen und Fundstellen bereitgestellt haben.
- Die Nachforderungsliste und die Kommentarfunktion müssen für den Prozessschritt MVP verfügbar sein.
- Neue oder nachgereichte Unterlagen müssen über die formale Vollständigkeitsprüfung erneut dem richtigen Thema zugeordnet werden können.

## Definition of Done

- Die Frontend-Implementierung ist abgeschlossen.
- Die Backend-Implementierung ist abgeschlossen.
- Die Akzeptanzkriterien wurden erfüllt.
- Die User Story wurde vom Team ENTE getestet.
- Alle Sub-Tasks wurden geschlossen.
- Die API-Dokumentation ist vollständig.
- Das Feature wurde im Wiki dokumentiert.

## Offene Fragen

- Soll ein Thema genau einer Person oder mehreren Personen gleichzeitig zugewiesen werden?
- Gilt ein Thema als abgeschlossen, sobald alle Normen abgedeckt sind, oder zusätzlich erst dann, wenn auch alle Dokumente als geprüft markiert wurden?
- Bleibt die finale Darstellung der Rechtsgrundlage bei Normkarten, oder ist die bestehende Baumdarstellung mit Normen, Sätzen und TBMs das Zielbild?
- Soll die Kommentarfunktion direkt auf Normebene verfügbar sein, oder bleibt sie zunächst auf Fundstellen beschränkt?
- Soll nur die Dokumentansicht oder perspektivisch die gesamte themenbezogene Arbeitsfläche auf einen zweiten Bildschirm ausgelagert werden können?
- Wie wird die Überschrift einer Fundstelle final fachlich gebildet?
- Soll die MVP langfristig auf Normebene bleiben, oder soll die Dekonstruktion in Sätze und TBMs in der Prüfansicht stärker sichtbar werden?
- Welche Filtervarianten sind für die Rechtsgrundlage final erforderlich, insbesondere Statusfilter und die Unterscheidung materiellrechtlicher und verfahrensrechtlicher Normen?
