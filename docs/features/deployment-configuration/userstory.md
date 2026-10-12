# Administration | Deployment-spezifische Verfahrenskonfiguration

Als Systemadministrator  
möchte ich Verfahrensarten und ihre fachliche Konfiguration zentral verwalten,  
damit neue Verfahren ohne Codeänderung mit den richtigen Unterlagen, Themen, Rechtsgrundlagen und Beschlussstrukturen starten.

## Beschreibung

Eine SPARK Workflow-Installation unterstützt die Verfahrensarten und fachlichen Vorgaben ihrer Behörde. Die Administration bündelt diese Vorgaben in einer zentralen Konfiguration.

Der Systemadministrator verwaltet Verfahrensarten, erforderliche Unterlagen, Themen, Rechtsgrundlagen und Beschlussvorlagen. Die Anwendung übernimmt die freigegebene Konfiguration in neue Verfahren.

Die fachliche Auswahl der Inhalte bleibt beim Systemadministrator. Änderungen wirken nicht rückwirkend auf bestehende Verfahren.

## Anforderungen

### Zugang und Verfahrensarten

- Nur Personen mit der Rolle `admin` können die Administration öffnen.
- Die Navigation zeigt die Administration nur Personen mit der Rolle `admin`.
- Die Anwendung verweigert anderen Personen den direkten Zugriff und zeigt keine Konfigurationsdaten.
- Die Administration zeigt aktive und inaktive Verfahrensarten.
- Der Systemadministrator kann eine Verfahrensart anlegen, umbenennen, duplizieren, deaktivieren und reaktivieren.
- Der Systemadministrator kann eine ungenutzte Verfahrensart nach Bestätigung löschen.
- Die Anwendung verweigert das Löschen einer verwendeten Verfahrensart und bietet deren Deaktivierung an.
- Eine deaktivierte Verfahrensart bleibt in bestehenden Verfahren erhalten.
- Neue Verfahren können nur aktive und vollständig konfigurierte Verfahrensarten verwenden.

### Themenkatalog und Rechtsgrundlagen

- Der Systemadministrator kann Themen mit Name, Beschreibung und fachlicher Sichtbarkeit verwalten.
- Die Sichtbarkeit wird getrennt für materielle Prüfung, Einwendungskategorien und Beschluss festgelegt.
- Der Systemadministrator kann Unterthemen innerhalb eines Themas verwalten.
- Die Anwendung verhindert doppelte Themennamen innerhalb einer Verfahrensart.
- Die Anwendung verhindert doppelte Unterthemennamen innerhalb eines Themas.
- Der Systemadministrator kann Bundesnormen für ein Thema oder Unterthema auswählen.
- Der Systemadministrator kann Landesnormen getrennt nach Bundesland für ein Thema auswählen.
- Die Anwendung übernimmt Rechtsgrundlagen aus dem angebundenen Normbestand.
- Nicht mehr verfügbare, bereits gespeicherte Rechtsgrundlagen bleiben bis zu ihrer ausdrücklichen Entfernung sichtbar.
- Eine Norm enthält Rechtsgrundlage, Paragraf und weitere verfügbare Gliederungsangaben.
- Eine Norm besitzt den Typ `PRUEFUNG` oder `VERFAHREN`.
- Die Anwendung verhindert doppelte Normen innerhalb derselben Normliste.
- Die Anwendung verhindert das Entfernen eines Themas, das ein Beschlussknoten referenziert.

### Erforderliche Unterlagen

- Der Systemadministrator kann Kategorien erforderlicher Unterlagen anlegen, umbenennen und entfernen.
- Der Systemadministrator kann Dokumenttypen innerhalb einer Kategorie anlegen, bearbeiten und entfernen.
- Ein Dokumenttyp enthält einen Namen und eine optionale Beschreibung.
- Der Systemadministrator kann eine erwartete Anzahl festlegen oder das Feld leer lassen.
- Die Anwendung verhindert doppelte Dokumenttypnamen innerhalb derselben Kategorie.
- Die Anwendung verweigert Dokumenttypen ohne Namen.
- Die erwartete Anzahl muss eine positive ganze Zahl sein.

### Beschlussvorlage

- Der Systemadministrator kann eine hierarchische Beschlussvorlage für jede Verfahrensart verwalten.
- Ein Beschlussknoten enthält Titel, Text, Reihenfolge, Sichtbarkeit und eine optionale Themenzuordnung.
- Ein Beschlussknoten legt fest, ob unter ihm weitere Knoten angelegt werden dürfen.
- Der Systemadministrator kann Wurzelknoten und erlaubte Unterknoten anlegen.
- Der Systemadministrator kann Geschwisterknoten nach oben oder unten verschieben.
- Das Entfernen eines Knotens entfernt nach Bestätigung auch seine Unterknoten.
- Die Anwendung verhindert zyklische Strukturen.
- Die Anwendung verhindert Verweise auf unbekannte Themen.
- Die Anwendung verhindert neue Unterknoten, wenn der Elternknoten diese nicht erlaubt.

### Speichern, Export und Konflikte

- Die Anwendung speichert die Konfiguration einer Verfahrensart als zusammengehörige Einheit.
- Die Anwendung prüft vor dem Speichern, ob eine neuere Version vorliegt.
- Bei einem Versionskonflikt überschreibt die Anwendung keine neueren Daten.
- Die Anwendung lädt nach einem Konflikt den aktuellen Stand und erhält den lokalen Entwurf zur Prüfung.
- Ungespeicherte Änderungen bleiben beim Wechsel zwischen Bereichen geschützt.
- Der Systemadministrator kann Änderungen speichern, verwerfen oder den Wechsel abbrechen.
- Die Anwendung zeigt Ladezustände, leere Zustände und Fehler mit einer erneuten Ladeoption.
- Der Systemadministrator kann die vollständige Konfiguration als YAML-Datei exportieren.
- Der Export enthält Verfahrensart, Unterlagen, Themen, Rechtsgrundlagen und Beschlussvorlage.
- Der Import einer exportierten Konfiguration gehört nicht zu dieser Userstory.

### Anwendung auf neue Verfahren

- Die Anwendung übernimmt Themen, Unterthemen und Normen beim Anlegen eines neuen Verfahrens.
- Die Anwendung ergänzt die Landesnormen für das Bundesland des Verfahrens.
- Ohne Bundesland übernimmt die Anwendung keine Landesnormen.
- Die Anwendung legt identische Normen innerhalb eines Themas nur einmal an.
- Die Initialisierung übernimmt die erforderlichen Dokumenttypen der ausgewählten Verfahrensart.
- Die Initialisierung übernimmt die zugehörige Beschlussvorlage.
- Nach erfolgreicher Initialisierung erhält das Verfahren den Status `UPLOAD_DOCUMENTS`.
- Eine fehlende Verfahrenskonfiguration verhindert die Erstellung eines neuen Verfahrens.
- Spätere Konfigurationsänderungen verändern keine bestehenden Verfahren.

### Automatische Initialisierung

- Eine neue Installation kann ihre Verfahrenskonfiguration ohne vorherige Eingabe in der Administration laden.
- Die Installation liest Behördenverzeichnisse unter `/seed/catalog`.
- Jedes Behördenverzeichnis enthält `projekttyp.yaml`, `gesetzesgrundlage.yaml`, `dokumente.yaml` und `beschluss.yaml`.
- Fehlt das Verzeichnis, verwendet die Installation die ausgelieferte Standardkonfiguration.
- Die Initialisierung schreibt nur in einen leeren Konfigurationsbestand.
- Ein erneuter Start erhält Änderungen aus der Administration.
- Ungültige oder unvollständige Konfigurationen führen zu keiner teilweisen Speicherung.
- Widersprüchliche Behörden- oder Verfahrenskennungen führen zu einem Fehler.

## Technische Anmerkungen

- Das Core-Usecases-Paket verwaltet die zentrale Konfiguration.
- Formal Completeness und Administrative File Draft beziehen ihre Konfiguration über die lokale Usecases Resource.
- Die Konfiguration besteht aus vier zusammengehörigen Dokumenten.
- Schreibzugriffe sind auf die Rollen `admin` und `service` beschränkt.
- Alle authentifizierten Rollen dürfen die Konfiguration lesen.
- Die Konfiguration enthält öffentliche Rechtsgrundlagen und Konfigurationstexte, aber keine personenbezogenen Daten.
- Bestehende Verfahren speichern ihre instanziierten Inhalte unabhängig von späteren Konfigurationsänderungen.

## User Interface

- Die Administration beginnt mit einer Übersicht aller Verfahrensarten.
- Inaktive Verfahrensarten sind eindeutig gekennzeichnet.
- Jede Verfahrensart besitzt Bereiche für Themenkatalog, erforderliche Unterlagen und Beschlussvorlage.
- Der Export steht in der Detailansicht einer Verfahrensart bereit.
- Dialoge verlangen eine ausdrückliche Bestätigung vor Löschvorgängen.
- Eingabefehler und Speicherkonflikte werden im jeweiligen Arbeitskontext angezeigt.
- Die Bereiche unterstützen Tastaturbedienung, nachvollziehbare Fokusreihenfolge und beschriftete Eingabeelemente.

## Akzeptanzkriterien

### Zugang und Verfahrensarten

- Eine Person mit der Rolle `admin` sieht die Administration in der Navigation und kann sie öffnen.
- Eine andere Person sieht keinen Administrationseintrag.
- Ein direkter Aufruf durch eine andere Person zeigt keine Konfigurationsdaten.
- Die Übersicht zeigt aktive und inaktive Verfahrensarten mit ihrem jeweiligen Status.
- Der Systemadministrator kann eine Verfahrensart anlegen, umbenennen, duplizieren, deaktivieren und reaktivieren.
- Eine ungenutzte Verfahrensart kann nach Bestätigung gelöscht werden.
- Bei einer verwendeten Verfahrensart verweigert die Anwendung das Löschen und bietet die Deaktivierung an.
- Eine deaktivierte Verfahrensart steht bei der Erstellung neuer Verfahren nicht zur Auswahl.

### Themenkatalog und Rechtsgrundlagen

- Der Systemadministrator kann Themen und Unterthemen mit den vorgesehenen Angaben verwalten.
- Die Anwendung speichert die drei Sichtbarkeitswerte eines Themas unabhängig voneinander.
- Doppelte Themen- und Unterthemennamen führen zu einer verständlichen Fehlermeldung.
- Der Systemadministrator kann Bundesnormen für Themen und Unterthemen auswählen.
- Der Systemadministrator kann für jedes Bundesland Landesnormen eines Themas auswählen.
- Bereits gespeicherte, aktuell nicht verfügbare Rechtsgrundlagen bleiben erkennbar.
- Doppelte Normen werden nicht gespeichert.
- Ein von der Beschlussvorlage referenziertes Thema kann nicht entfernt werden.

### Erforderliche Unterlagen

- Der Systemadministrator kann Kategorien anlegen, umbenennen und entfernen.
- Der Systemadministrator kann Dokumenttypen anlegen, bearbeiten und entfernen.
- Ein leerer Dokumenttypname verhindert das Speichern.
- Ein doppelter Dokumenttypname innerhalb einer Kategorie verhindert das Speichern.
- Eine leere erwartete Anzahl wird ohne Zahlenvorgabe gespeichert.
- Eine ungültige erwartete Anzahl führt zu einer verständlichen Fehlermeldung.

### Beschlussvorlage

- Der Systemadministrator kann Wurzelknoten und erlaubte Unterknoten anlegen.
- Der Systemadministrator kann Knoten innerhalb derselben Ebene neu anordnen.
- Das Entfernen eines Knotens entfernt nach Bestätigung seinen vollständigen Unterbaum.
- Ein Knoten ohne Berechtigung für Unterknoten bietet keine entsprechende Aktion.
- Ein unbekannter Themenverweis verhindert das Speichern.
- Ein fehlender Knotentitel verhindert das Speichern.
- Die Anwendung speichert keine zyklische Beschlussstruktur.

### Speichern, Export und Konflikte

- Ein gültiger Entwurf wird gespeichert und anschließend als aktueller Stand angezeigt.
- Während des Speicherns ist keine zweite Speicherung möglich.
- Ein Speicherkonflikt überschreibt keine neueren Daten.
- Nach einem Konflikt kann der Systemadministrator seinen Entwurf mit dem aktuellen Stand vergleichen.
- Beim Verlassen eines geänderten Bereichs kann der Systemadministrator speichern, verwerfen oder abbrechen.
- Der Export lädt eine YAML-Datei mit allen vier Konfigurationsdokumenten herunter.
- Fehlende Konfigurationen, Ladefehler und leere Zustände werden verständlich dargestellt.

### Anwendung auf neue Verfahren

- Ein neues Verfahren erhält die Themen, Unterthemen und Normen seiner Verfahrensart.
- Bei vorhandenem Bundesland erhält das Verfahren die zugehörigen Landesnormen.
- Ohne Bundesland werden keine Landesnormen ergänzt.
- Identische Normen werden innerhalb eines Themas nur einmal angelegt.
- Die Initialisierung übernimmt erforderliche Dokumenttypen und Beschlussvorlage.
- Bestehende Verfahren bleiben nach einer Änderung der zentralen Konfiguration unverändert.
- Eine inaktive oder nicht konfigurierte Verfahrensart kann nicht für ein neues Verfahren verwendet werden.

### Automatische Initialisierung

- Eine leere Installation lädt eine vollständige gültige Behördenkonfiguration.
- Ohne gemountetes Katalogverzeichnis lädt die Installation die ausgelieferte Standardkonfiguration.
- Ein erneuter Initialisierungslauf erzeugt keine Duplikate.
- Änderungen aus der Administration bleiben nach einem Neustart erhalten.
- Eine fehlende, ungültige oder widersprüchliche YAML-Datei verhindert jede teilweise Speicherung.

## Abhängigkeiten

- Die Benutzerverwaltung muss die Rolle `admin` bereitstellen.
- Core Usecases muss die zentrale Konfiguration speichern und geschützt bereitstellen.
- Der Normbestand muss die auswählbaren Bundes- und Landesnormen liefern.
- Formal Completeness muss die konfigurierten erforderlichen Unterlagen übernehmen.
- Administrative File Draft muss die konfigurierte Beschlussvorlage übernehmen.
- Die Laufzeitumgebung kann Behördenkonfigurationen unter `/seed/catalog` bereitstellen.

## Definition of Done

- Frontend und Backend erfüllen die Akzeptanzkriterien.
- Automatisierte Tests decken Zugriffsschutz, Editoren, Validierung, Konflikte und Initialisierung ab.
- Ein berechtigter Systemadministrator kann eine vollständige Verfahrenskonfiguration pflegen und exportieren.
- Ein neues Verfahren übernimmt die konfigurierte fachliche Struktur.
- Bestehende Verfahren bleiben nach Konfigurationsänderungen unverändert.
- Die Administration ist im Handbuch unter Systemeinrichtung dokumentiert.
- Die bekannten Folgefragen sind entschieden oder ausdrücklich aus dem Umfang abgegrenzt.

## Offene Fragen

- Soll eine Verfahrensart ohne Katalog ein leeres Verfahren erzeugen oder die Verfahrenserstellung verhindern?
- Soll die Administration benannte Landesnormgruppen direkt anzeigen oder diese ausschließlich über Themen und Bundesländer verwalten?
- Welche zusätzlichen Prüfungen benötigt eine Verfahrensart, bevor sie aktiviert werden darf?
- Welche strengeren Prüfungen sind für doppelte Normen und Bundeslandkennungen erforderlich?
- Wann ersetzt der konfigurierbare Themenkatalog vollständig die bestehenden Kompatibilitätswerte der Beschlussvorlage?
