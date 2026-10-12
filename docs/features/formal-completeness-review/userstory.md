# FVP | Formale Vollständigkeitsprüfung und Plausibilitätsprüfung

Als Bearbeiter oder Federführung eines Planfeststellungsverfahrens
möchte ich die formale Vollständigkeit der Antragsunterlagen prüfen, KI-Hinweise fachlich bewerten und notwendige Nachforderungen vorbereiten können,
damit ich vor der materiellen Prüfung nachvollziehbar kläre, ob die Unterlagen vollständig, richtig zugeordnet und inhaltlich plausibel sind.

## Beschreibung

Die formale Vollständigkeitsprüfung (FVP) ist der erste fachliche Prüfschritt für die eingereichten Unterlagen. Sie verbindet den Inhaltsverzeichnis-Abgleich, die Prüfung benötigter Unterlagentypen und die Plausibilitätsprüfung.

Die KI analysiert die aktuellen Projektunterlagen. Sie schlägt Unterlagentypen und Themenzuordnungen vor, meldet fehlende Unterlagen und identifiziert mögliche Widersprüche. Die Ergebnisse sind Hinweise und ersetzen keine fachliche Entscheidung.

Der Nutzende prüft die Ergebnisse, korrigiert Zuordnungen, blendet nicht relevante Hinweise aus und bereitet Nachforderungen oder Kommentare vor. Änderungen werden erst gespeichert, wenn der Nutzende die jeweilige Aktion bestätigt.

## Anforderungen

### Einstieg, Berechtigung und Analyse

- Die FVP ist innerhalb des ausgewählten Verfahrens erreichbar.
- Nutzende mit Leseberechtigung können Ergebnisse ohne Änderungsfunktionen einsehen.
- Administratoren, Projekteigentümer und Projektmitglieder können die FVP bearbeiten.
- Der Nutzende kann die erste KI-Analyse starten, wenn Unterlagen vorhanden sind und keine Analyse läuft.
- Das System prüft vor dem Start die Berechtigung, den Projektstatus und die verfügbare Systemkapazität.
- Der Start erfolgt erst nach einer Bestätigung.
- Das System zeigt den Fortschritt der einzelnen Analysebereiche getrennt an.
- Schlägt ein Analysebereich fehl, kennzeichnet das System die zugehörige Ergebniskarte mit der Markierung „Fehlgeschlagen“.
- Die Markierung nennt den Analysebereich und die Ursache, ohne technische Fehlertexte anzuzeigen.
- Ein fehlgeschlagener Analysebereich wird nicht als leeres Ergebnis dargestellt.
- Ergebnisse eines früheren Laufs bleiben neben der Markierung sichtbar.
- Schlägt nur ein Teil der Analyse fehl, behalten erfolgreiche Bereiche ihre Ergebnisse und das System kennzeichnet die Analyse als unvollständig.
- Nach einem Fehlschlag bietet die Dokumentansicht den erneuten Start der Analyse an.
- Wenn Voraussetzungen fehlen, bleibt der Start gesperrt und das System zeigt den Grund.

### Inhaltsverzeichnis- und Unterlagenabgleich

- Das System gleicht erkannte Inhaltsverzeichnisse mit den vorhandenen Unterlagen ab.
- Nicht gefundene Einträge erscheinen als prüfbare KI-Hinweise.
- Der Nutzende sieht den Bearbeitungsfortschritt der Hinweise.
- Der Nutzende kann einen Hinweis ausblenden und wieder einblenden.
- Das System prüft, welche Unterlagentypen für den Verfahrenstyp benötigt werden.
- Benötigte Unterlagentypen werden als offen, vorhanden, nachgefordert oder irrelevant eingeordnet.
- Vorhandene Unterlagentypen erscheinen nicht in der Liste fehlender Unterlagen.
- Der Nutzende kann zusätzliche verfahrensspezifische Unterlagentypen anlegen, umbenennen und löschen.
- Benutzerdefinierte Unterlagentypen werden nicht automatisch durch die KI zugeordnet.
- Fehler beim Laden der Ergebnisse werden als Fehler angezeigt und nicht als leere Ergebnislisten dargestellt.

### Dokumentübersicht und fachliche Zuordnung

- Die Dokumentübersicht zeigt die aktuellen Projektunterlagen in ihrer Ordnerstruktur.
- Ordner erscheinen vor Dokumenten und können ein- oder ausgeklappt werden.
- Der Nutzende kann nach Dokumentnamen und zugeordneten Unterlagentypen suchen.
- Der Nutzende kann nach Status und Unterlagentyp filtern.
- Übergeordnete Ordner bleiben sichtbar, wenn sie passende Dokumente enthalten.
- Die Übersicht zeigt, ob ein Dokument zugeordnet, nicht zugeordnet oder auf der Nachforderungsliste ist.
- Der Nutzende kann ein Projektdokument in einer PDF-Vorschau öffnen.
- Die KI kann einen Unterlagentyp vorschlagen.
- Der Nutzende kann einen KI-Vorschlag bestätigen oder durch einen anderen Unterlagentyp ersetzen.
- Unsichere, noch unbestätigte KI-Zuordnungen werden mit „Zuordnung unsicher“ gekennzeichnet.
- Das System zeigt keinen numerischen Konfidenzwert für die Zuordnung.
- Der Nutzende kann ein Dokument mehreren Themen zuordnen.
- Änderungen an Themen ersetzen nur die Themenzuordnungen des betroffenen Dokuments.

### Plausibilitätsprüfung

- Die Plausibilitätsprüfung zeigt mögliche Widersprüche innerhalb und zwischen Projektunterlagen.
- Jeder Hinweis enthält einen Titel, eine Erläuterung und die zugehörigen Fundstellen.
- Die Übersicht zeigt offene, irrelevante und nachgeforderte Hinweise getrennt.
- Der Nutzende kann Hinweise durchsuchen und nach Status, Dokument und Sensibilität filtern.
- Die Sortierung priorisiert stärker bewertete Hinweise.
- Schwach belegte Hinweise werden mit „Schwach belegt – bitte am Original prüfen“ gekennzeichnet.
- Der Nutzende kann einen Hinweis aufklappen und zwei Fundstellen miteinander vergleichen.
- Die Gegenüberstellung zeigt Dokumentname, Seite und extrahierte Formulierung.
- Bei mehr als zwei Fundstellen kann der Nutzende unterschiedliche Fundstellen für beide Seiten auswählen.
- Der Nutzende kann das Quelldokument an der gespeicherten Seite öffnen.
- Der Nutzende kann einen Hinweis als irrelevant markieren und später wiederherstellen.
- Der fachliche Status eines Hinweises bleibt unabhängig von seiner Zuordnung zur Nachforderungsliste.
- Die fachliche Bewertung und die Entscheidung über das weitere Vorgehen bleiben beim Nutzenden.

### Nachforderungen und Kommentare

- Der Nutzende kann aus einem fehlenden Dokument oder Plausibilitätshinweis einen Nachforderungsentwurf öffnen.
- Der Entwurf enthält einen Bezug zum auslösenden Hinweis.
- Das System speichert eine Nachforderung erst, wenn der Nutzende den Entwurf vervollständigt und speichert.
- Der Nutzende kann alle offenen Vollständigkeitshinweise gesammelt als einzelne Entwürfe öffnen.
- Der Nutzende kann aus einem Hinweis einen vorausgefüllten Kommentarentwurf öffnen.
- Das System speichert einen Kommentar erst nach der Bestätigung durch den Nutzenden.
- Bei einem Speicherfehler bleibt der Entwurf erhalten.

### Versionierung und Fehlerbehandlung

- Ergebnisse und Änderungen beziehen sich auf die aktuelle Projektversion.
- Das System lehnt Änderungen an einer gesperrten oder veralteten Projektversion ab.
- Nach einer neuen Projektversion startet die FVP-Analyse automatisch für die aktuellen Unterlagen.
- Geänderte oder neue Unterlagen werden erneut verarbeitet.
- Die Plausibilitätsprüfung berücksichtigt alle aktuellen Unterlagen.
- Fehlgeschlagene Änderungen werden nicht als gespeichert dargestellt.
- Das System stellt den vorherigen Zustand wieder her oder erhält den ungespeicherten Entwurf.
- Während Unterlagen verarbeitet werden, sind betroffene Dokumentaktionen gesperrt.

## Technische Anmerkungen

- Der FVP-Workflow umfasst Inhaltsextraktion, Unterlagenklassifikation, Inhaltsverzeichnis-Abgleich und Plausibilitätsprüfung.
- Die automatische Klassifikation verwendet nur die konfigurierten Standard-Unterlagentypen.
- Eine unbestätigte KI-Unterlagenzuordnung gilt unter einer Konfidenz von `0.8` als unsicher.
- Ein Plausibilitätshinweis gilt unter einer normalisierten Bewertung von `0.6` als schwach belegt.
- Die Oberfläche zeigt für beide Bewertungen nur Warnungen und keine numerischen Werte.
- Fehlerursachen werden über einheitliche Fehlercodes in Formulierungen übersetzt. Unbekannte Codes erscheinen mit einer allgemeinen Fehlermeldung.
- Die Plausibilitätsprüfung analysiert textbasierte Inhalte. Bilder und Tabellen werden derzeit nicht systematisch ausgewertet.
- Dokumentvorschauen verwenden projektgebundene, freigegebene Downloadadressen.

## User Interface

- Die FVP besitzt eine Dokumentansicht und eine getrennte Plausibilitätsansicht.
- Die Dokumentansicht zeigt den Analysefortschritt, Ergebniskarten und die Dokumentübersicht.
- Ergebniskarten zeigen den Inhaltsverzeichnis-Abgleich, benötigte Unterlagen und die Plausibilitätsprüfung.
- Eine fehlgeschlagene Ergebniskarte zeigt die Markierung „Fehlgeschlagen“; eine unvollständige Analyse zeigt einen Hinweis in der Dokumentansicht.
- Die Dokumentübersicht enthält Suche, Filter, Ordnernavigation, Zuordnungen und eine PDF-Vorschau.
- Die Plausibilitätsansicht enthält Zusammenfassungen, Filter und eine Liste der Hinweise.
- Ein aufgeklappter Plausibilitätshinweis zeigt zwei Fundstellen und die zugehörigen Dokumente.
- Warnhinweise und ihre Erläuterungen sind per Tastatur und Maus erreichbar.

## Akzeptanzkriterien

### Einstieg, Berechtigung und Analyse

- Die FVP öffnet innerhalb des ausgewählten Verfahrens die Dokumentansicht.
- Ein leseberechtigter Nutzender sieht Ergebnisse, aber keine Änderungsfunktionen.
- Ein berechtigter Nutzender kann die KI-Analyse nach einer Bestätigung starten.
- Ohne Unterlagen, bei fehlenden Statusdaten oder bei zu hoher Systemlast bleibt der Start gesperrt.
- Die Oberfläche nennt den jeweiligen Sperrgrund.
- Laufende und abgeschlossene Analysebereiche sind getrennt erkennbar.
- Ein fehlgeschlagener Analysebereich zeigt die Markierung „Fehlgeschlagen“ statt eines leeren Ergebnisses.
- Die Markierung zeigt bei Mausberührung oder Tastaturauswahl den Analysebereich und eine verständliche Ursache, aber keinen technischen Fehlertext.
- Liegt ein Ergebnis aus einem früheren Lauf vor, bleibt es zusammen mit der Markierung sichtbar.
- Ein erfolgreich abgeschlossener Bereich ohne Hinweise zeigt sein leeres Ergebnis ohne Markierung.
- Schlägt ein Bereich fehl und ein anderer gelingt, zeigt die Dokumentansicht den Hinweis auf eine unvollständige KI-Analyse.
- Nach einem Fehlschlag bietet die Dokumentansicht den erneuten Start der KI-Analyse an.

### Inhaltsverzeichnis- und Unterlagenabgleich

- Nicht gefundene Einträge aus einem Inhaltsverzeichnis erscheinen als offene Hinweise.
- Ausgeblendete oder nachgeforderte Hinweise zählen als bearbeitet.
- Der Nutzende kann einen ausgeblendeten Hinweis wieder öffnen.
- Fehlende benötigte Unterlagentypen erscheinen als offene Hinweise.
- Vorhandene Unterlagentypen erscheinen nicht in der Liste fehlender Unterlagen.
- Der Nutzende kann eindeutige, nicht leere benutzerdefinierte Unterlagentypen verwalten.
- Bei einem Lesefehler zeigt die Ergebniskarte einen wiederholbaren Fehlerzustand statt falscher Zähler.

### Dokumentübersicht und fachliche Zuordnung

- Die Übersicht zeigt die aktuellen Projektdokumente in einer durchsuchbaren Ordnerstruktur.
- Eine Suche berücksichtigt Dokumentnamen und Unterlagentypen unabhängig von Groß- und Kleinschreibung.
- Status- und Unterlagentypfilter erhalten die Ordner der passenden Dokumente.
- Die Auswahl eines Projektdokuments öffnet eine PDF-Vorschau.
- Der Nutzende kann einen KI-Unterlagentyp bestätigen oder überschreiben.
- Eine unbestätigte Zuordnung unterhalb der festgelegten Konfidenzgrenze zeigt „Zuordnung unsicher“.
- Die Warnung verschwindet nach einer Bestätigung oder manuellen Überschreibung.
- Der Nutzende kann mehrere Themen auswählen, ohne andere Beziehungen des Dokuments zu verändern.

### Plausibilitätsprüfung

- Die Plausibilitätsansicht zeigt nur Hinweise mit mindestens einer Fundstelle.
- Suche und Filter schränken die Liste gemeinsam ein.
- Die Liste sortiert bewertete Hinweise absteigend und nicht bewertete Hinweise danach.
- Ein schwach belegter Hinweis zeigt die vorgesehene Warnung.
- Ein aufgeklappter Hinweis zeigt zwei unterschiedliche Fundstellen mit Dokument, Seite und Text.
- Bei weiteren Fundstellen kann der Nutzende beide Vergleichsseiten getrennt auswählen.
- Die Auswahl eines Dokuments öffnet es an der gespeicherten Seite.
- Ein berechtigter Nutzender kann einen offenen Hinweis als irrelevant markieren und wiederherstellen.
- Die Nachforderungszuordnung verändert den fachlichen Status nicht automatisch.

### Nachforderungen und Kommentare

- Eine Nachforderungsaktion öffnet einen vorausgefüllten Entwurf.
- Ohne Speichern entsteht keine Nachforderung.
- Die Sammelaktion öffnet für jeden offenen Vollständigkeitshinweis einen eigenen Entwurf.
- Eine bereits bestehende Nachforderungszuordnung verhindert eine doppelte Zuordnung.
- Eine Kommentaraktion öffnet einen vorausgefüllten Entwurf.
- Bei einem Speicherfehler bleibt das Formular geöffnet und zeigt den Fehler.

### Versionierung und Fehlerbehandlung

- Änderungen an einer gesperrten oder veralteten Projektversion werden abgelehnt.
- Nach einem fehlgeschlagenen Speichervorgang zeigt die Oberfläche den vorherigen Zustand oder den offenen Entwurf.
- Eine neue Projektversion startet automatisch eine neue FVP-Analyse.
- Die neue Analyse verarbeitet neue oder veraltete Unterlagen.
- Fehlgeschlagene Analysezweige ersetzen keine vorhandenen Ergebnisse durch unvollständige Daten.

## Abhängigkeiten

- Dem Verfahren müssen aktuelle Projektunterlagen zugeordnet sein.
- Die Inhaltsextraktion muss die unterstützten Dokumentinhalte bereitstellen.
- Standard-Unterlagentypen und Themen müssen für den Verfahrenstyp konfiguriert sein.
- Die Systemkapazität muss vor einem manuellen Analysebeginn ermittelt werden können.
- Nachforderungsliste und Kommentarfunktion müssen für die FVP verfügbar sein.
- Die Dokumentverwaltung muss projektgebundene PDF-Vorschauen bereitstellen.
- Die Projektversionierung muss aktuelle und gesperrte Versionen unterscheiden.

## Definition of Done

- Die Frontend-Implementierung ist abgeschlossen.
- Die Backend- und KI-Workflows sind angebunden.
- Die Akzeptanzkriterien wurden erfüllt.
- Die Userstory wurde vom Team ENTE getestet.
- Alle zugehörigen Sub-Tasks wurden geschlossen.
- Die API-Dokumentation ist vollständig.
- Das Feature wurde im Wiki dokumentiert.

## Offene Fragen

- Welche sichtbare Abschlussbedingung kennzeichnet die FVP als fachlich abgeschlossen und ermöglicht den Übergang zur MVP?
- Sollen die Begriffe „ausgeblendet“, „irrelevant“, „gelöst“ und „erledigt“ über alle FVP-Bereiche vereinheitlicht werden?
- Werden leere Ordner in der Dokumentübersicht angezeigt oder ausgeblendet?
