# SPARK Workflow Benutzerhandbuch

Dieses Verzeichnis ist die kanonische, wartbare Quelle des SPARK Workflow Benutzerhandbuchs. Die Fumapress-Anwendung unter [`../../01-frontend/handbuch`](../../01-frontend/handbuch) baut daraus die statische Handbuchseite.

## Struktur

`index.mdx` enthält Metadaten, Versionsangaben und die geordnete Zusammenstellung der 15 Kapiteldateien. Nur diese Datei wird als Route kompiliert. Die Kapiteldateien und dieses README bleiben quellseitige Fragmente. Verlustfrei optimierte Abbildungen liegen unter `assets/`.

Die Migration enthält 65 nummerierte Überschriften, den unnummerierten Abschnitt „Formale Vollständigkeitsprüfung: KI-Analyse starten“, 48 Abbildungen und 48 Bildunterschriften. In den Abbildungen sind 233 regulär in Abbildungsabsätzen positionierte Nummernmarkierungen enthalten. Zwei weitere, ungewöhnlich am vorausgehenden Überschriftenabsatz verankerte Markierungen der Abbildung 48 wurden ebenfalls anhand ihrer OOXML-Koordinaten zusammengesetzt.

## Ankerkonventionen

- Kapitelanker folgen dem Schema `kapitel-5-2-13`.
- Abbildungen verwenden `abbildung-19`.
- Die unnummerierte KI-Analyse verwendet `ki-analyse-starten`.
- Überschriften der Ebenen H2 und H3 erscheinen im Inhaltsverzeichnis. Tiefere Überschriften behalten mit `[!toc]` ihren Anker und ihre Suchbarkeit, erscheinen aber nicht in der Seitenübersicht.

Anker sind Teil der öffentlichen URL und dürfen bei redaktionellen Änderungen nicht ohne Weiterleitung umbenannt werden.

## Bearbeitung

1. Den Inhalt im passenden nummerierten Markdown-Fragment ändern.
2. Neue Kapiteldateien in `index.mdx` an der fachlich richtigen Stelle einbinden.
3. Abbildungen als PNG unter `assets/` ablegen, aussagekräftigen deutschen Alternativtext vergeben und die Abbildungsnummer nicht wiederverwenden.
4. Interne Verweise als Hash-Link auf einen stabilen Anker setzen.
5. In `01-frontend/handbuch` `corepack pnpm@10.30.2 types:check` und `corepack pnpm@10.30.2 build` ausführen.

Die migrierten Markdown-Dateien und Assets sind ab jetzt die gepflegte Quelle; eine erneute DOCX-Konvertierung würde redaktionelle Änderungen überschreiben.
