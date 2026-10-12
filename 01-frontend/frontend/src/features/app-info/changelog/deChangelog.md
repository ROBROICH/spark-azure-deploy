## Version 0.3.0 (12.10.2026)

- Ein Administrationsbereich für Verfahrensarten steht zur Verfügung, einschließlich Themenkatalogen mit Rechtsgrundlagen, erforderlichen Unterlagen und Beschlussvorlagen.
- KI-Vorschläge mit Prüfbedarf werden gekennzeichnet: unsichere Zuordnungen von Unterlagen in der formalen Vollständigkeitsprüfung („Zuordnung unsicher“) und unsichere Einordnungen von Einwendungen. Die materielle Vollständigkeitsprüfung markiert die Hinweise, die zuerst geprüft werden sollten.
- Fehlgeschlagene Verarbeitungen werden mit ihrer Ursache im betroffenen Bereich eines Verfahrens angezeigt.
- Plan- und Kartenblätter aus CAD- und GIS-Programmen werden bei der Inhaltsextraktion als Bild aufbereitet, bevor sie umgewandelt werden.
- Das Benutzerhandbuch steht als durchsuchbare Website zur Verfügung.
- Hinweise der Plausibilitätsprüfung werden nach einer neuen Relevanzbewertung sortiert, doppelte Hinweise werden zusammengeführt. Wiederholte Textpassagen, übernommene Sätze und Querverweise werden zusätzlich als Hinweise auf mögliche Widersprüche genutzt.
- In der rechtlichen Prüfung zeigen die Satzdetails je Rechtsfolge die Reichweite und Art des Ermessens statt des Adressaten.
- Nutzende ohne Administratorrolle sehen nur Verfahren, in denen sie Mitglied sind; Administratorinnen und Administratoren sehen weiterhin alle Verfahren.
- Die Schwärzung von PDFs bricht mit einem Fehler ab, wenn Texterkennung oder Erkennung personenbezogener Daten fehlschlagen, statt teilweise ungeschwärzte Seiten auszugeben. Metadaten, Anmerkungen, Formulare und eingebettete Dateien werden entfernt.
- ZIP-Importe schlagen bei automatischen Wiederholungen nicht mehr fehl. Verschlüsselte, geteilte oder anderweitig nicht unterstützte Archive erhalten eigene Fehlermeldungen.
- Eine fehlgeschlagene formale Vollständigkeitsprüfung kann neu gestartet werden, ohne die Unterlagen erneut hochzuladen.
- Bei Anforderungen aus Rechtsnormen werden Unterlagen nach Relevanz statt nach Verarbeitungsreihenfolge zugeordnet.
- Die Suche nach Rechtsnormen schlägt nicht mehr fehl, wenn sie nur einen Treffer liefert, und Normtexte mit Formatierungen werden korrekt in Sätze zerlegt.
- Der Standard-Themenkatalog nennt für „Kommunale Belange“ Art. 28 Abs. 2 GG.
- Die Inhaltsextraktion schlägt bei Unterlagen mit vielen Kapiteln nicht mehr fehl.
- SPARK Workflow ist jetzt barrierefrei nach BITV 2.0 und EN 301 549.
- Weitere Fehlerbehebungen und Optimierungen wurden vorgenommen.

## Version 0.2.3 (12.10.2026)

- Die Schwärzung von PDFs entfernt Inhalte zuverlässiger: Geschwärzte Inhalte bleiben nicht mehr über Seitenobjekte erhalten, die außerhalb der Seitenstruktur referenziert werden.
- Weitere Fehlerbehebungen und Sicherheitsupdates wurden vorgenommen.

## Version 0.2.2 (10.08.2026)

- Ein deutsches Benutzerhandbuch steht zur Verfügung.
- Die Schwärzung von PDFs entfernt digitale Signaturen vor dem Schwärzen.
- Die Benutzerliste zeigt Administratorrollen nicht mehr an.
- Die Rechtsmethodik verarbeitet Verfahren auch dann, wenn Gesetzesdokumente fehlen.

## Version 0.2.1 (15.07.2026)

- Die Plausibilitätsprüfung wurde auf die bidirektionale Prüfung von Widersprüchen zwischen Unterlagen erweitert (bisheriger Funktionsumfang: Prüfung innerhalb einer Unterlage und zwischen einer Unterlage und dem Erläuterungsbericht).
- Der Dialog zur Bearbeitung der Rechtsgrundlage in der materiellen Vollständigkeitsprüfung wurde um alle zur Verfügung stehenden Normen erweitert.
- Hinweise aus der Texterkennung werden zuverlässiger entfernt, damit EWMS Einwendungen nicht fälschlicherweise als Sicherheitsrisiko einstuft.
- Die maximale Laufzeit für das Entpacken von ZIP-Archiven wurde erhöht, damit Uploads mit vielen oder großen Dateien zuverlässiger verarbeitet werden.
- Hochgeladene Dateien werden abgelehnt, wenn die Virenprüfung kein eindeutiges Ergebnis liefert.
- Der Browser-Tab zeigt den Titel der aktuellen Seite, und bei Eingabefehlern in Formularen wird der Fokus besser geführt.
- Verschiedene Anpassungen an der Oberfläche (u. a. zur Barrierefreiheit), Fehlerbehebungen und allgemeine Verbesserungen der Qualität wurden vorgenommen.

## Version 0.2.0-beta (15.06.2026)

- Der Prozessschritt „Behörden- und Öffentlichkeitsbeteiligung“ steht zur Verfügung.
- Die nachträgliche Änderung von Antragsunterlagen (z. B. Planänderungen) sowie das erneute Anstoßen von KI-Analysen stehen zur Verfügung.
- Die Rechtsmethodik, Risikohinweise und Feedbackfunktionen im Arbeitsschritt „Rechtliche Prüfung und Beschlusserstellung“ wurden implementiert.
- Der Schwärzungsagent steht zur Verfügung.
- Funktionen für das Einwendungsmanagement (EWMS) stehen in der Oberfläche zur Verfügung.
- Die Protokollierungsdienste wurden implementiert.
- Die Integration des Fachplanungsportals wurde umgesetzt.
- Ein Rollen- und Rechtekonzept wurde implementiert.
- Die Prozessschritte „Materielle Vollständigkeitsprüfung“ und „Rechtliche Prüfung und Beschlusserstellung“ stehen zur Verfügung.
- Das Hinzufügen benutzerdefinierter benötigter Unterlagen mit identischer Bezeichnung wurde verhindert.
- Die Icons „+“ und „-“ im Sensibilitätsfilter erhöhen bzw. verringern jetzt den Filterwert.
- Die Steuerung der Embedding-Schnittstellen für FVP und PP wurde präzisiert. Die Konfiguration wurde so angepasst, dass Embedding-Anfragen aus der Extraktion (FVP) und aus PP getrennt an unterschiedliche Provider geleitet werden.
- Die maximale Dateigröße einzelner Dateien in hochgeladenen ZIP-Archiven wurde von 128 MB auf 1024 MB erhöht.
- Es wurde ein Changelog hinzugefügt.
- Weitere Fehlerbehebungen und Optimierungen wurden vorgenommen.

## Version 0.1.0-beta (31.03.2026)

- Der erste Release-Stand der Anwendung im Scope von BzA-A.
- Die Inhaltsextraktion aus Antragsunterlagen, die formale Vollständigkeitsprüfung und die Plausibilitätsprüfung stehen zur Verfügung.
