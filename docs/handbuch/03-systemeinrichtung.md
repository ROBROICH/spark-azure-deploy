## 3 Systemeinrichtung [#kapitel-3]

### 3.1 Systemanforderungen [#kapitel-3-1]

Um die KI-Lösung technisch zu betreiben und einen stabilen und sicheren Betrieb zu gewährleisten, sind allgemeine Systemanforderungen einzuhalten. Die Applikation ist webbasiert. Eine lokale Installation wird nicht benötigt. Die Oberfläche ist responsiv gestaltet und passt sich automatisch an verschiedene Bildschirmgrößen und Auflösungen an. Empfohlen wird jedoch die Nutzung eines ausreichend großen beziehungsweise hochauflösenden Bildschirms mit einer Auflösung ab 1440 Pixel, da insbesondere in den einzelnen Prüfschritten eine hohe Detailgenauigkeit erforderlich ist. Die Nutzung eines zweiten Bildschirms für die Sichtung und den Vergleich von Unterlagen wird empfohlen.

Die Nutzung auf mobilen Endgeräten (z. B. Tablet ab 1133 Pixel) ist technisch für die Systemseiten möglich, die zur Übersicht dienen (Dashboard, Verfahrensübersichtsseite, Einzelverfahrensseite). Die Bearbeitung der Prüfschritte erfordert jedoch eine detaillierte Sichtung umfangreicher PDF-Dokumente (Portable Document Format) sowie detaillierter Kartenmaterialien. Die Entwicklung stand daher unter der Prämisse einer Anwendung am Arbeitsplatzrechner mit großformatiger Ansicht (ab 1440 Pixel).

Die Software ist plattformunabhängig nutzbar. Sie unterstützt die gängigen Betriebssysteme Windows, macOS und Linux sowie die jeweils aktuellen Versionen der Browser Google Chrome, Microsoft Edge und Mozilla Firefox.

Für den Zugriff wird eine stabile Internetverbindung vorausgesetzt. Darüber hinaus gelten die Sicherheitsstandards der jeweiligen Behördeninfrastruktur, insbesondere im Hinblick auf Nutzendenverwaltung und Zugriffsschutz.

### 3.2 Registrierung / Anmeldung im System [#kapitel-3-2]

Die Anmeldung und Authentifizierung im System erfolgt über ein OpenID-fähiges Identitäts- und Zugriffsmanagement (IAM), beispielsweise einen Single-Sign-On-Dienst wie Keycloak. Dieses stellt sicher, dass nur berechtigte Nutzende Zugang zur KI-Lösung SPARK Workflow erhalten.

Perspektivisch ist die Einbettung der KI-Lösung in ein Plattformsystem bzw. eine digitale Behördenlösung vorgesehen. Die Authentifizierung dieser Plattform kann dabei genutzt werden. Nicht angemeldete Personen könnten zur übergeordneten Plattform weitergeleitet und nach erfolgreicher Authentifizierung zum konfigurierten Redirect-Endpunkt zurückgeführt werden. Die Tokenprüfung (Signatur, Aussteller, Laufzeit) erfolgt innerhalb der Plattform. Die Anwendung erhält verifizierte Identitäts- und Rolleninformationen und trifft auf dieser Grundlage Entscheidungen zur rollenbasierten Zugriffskontrolle.

