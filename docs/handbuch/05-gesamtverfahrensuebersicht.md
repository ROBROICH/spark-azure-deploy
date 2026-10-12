## 5 Schritt-für-Schritt-Anleitung für Nutzende [#kapitel-5]

### 5.1 Gesamtverfahrensübersicht [#kapitel-5-1]

Das im Folgenden beschriebene KI-gestützte Assistenzsystem SPARK Workflow unterstützt die fachliche Bearbeitung von Planfeststellungsverfahren durch die zuständige Behörde.

Das KI-Assistenzsystem bildet die juristischen Bearbeitungsschritte in einer klar strukturierten Reihenfolge ab und unterstützt damit den gewohnten Arbeitsablauf der Nutzenden. Am Ende des Verfahrens steht die (positive oder negative) Genehmigungsentscheidung der Behörde (Beschluss), deren Entstehung durch das KI-Assistenzsystem unterstützt und nachvollziehbar dokumentiert wird.

#### 5.1.1 Abfolge der Bearbeitung [!toc] [#kapitel-5-1-1]

Die Abfolge der Bearbeitung ist am Ablauf des Verwaltungsverfahrens orientiert und folgt damit auch verfahrensrechtlich vorgegebenen Schritten. Sie wird im KI-Assistenzsystem über klar abgegrenzte Bereiche der Benutzeroberfläche unterstützt.

1. Formale Vollständigkeitsprüfung: In der formalen Vollständigkeitsprüfung werden die eingereichten Unterlagen auf Vollständigkeit und inhaltliche Kohärenz geprüft (s. Kapitel [5.2.13](#kapitel-5-2-13)).
1. Materielle Vollständigkeitsprüfung: Anschließend folgt die materielle Vollständigkeitsprüfung, bei der geprüft wird, ob die Planunterlagen Anstoßwirkung entfalten (s. Kapitel [5.2.14](#kapitel-5-2-14) ff.).
1. Behörden- und Öffentlichkeitsbeteiligung: Entfalten die Planunterlagen Anstoßwirkung, erfolgt im Rahmen des Anhörungsverfahrens die Bekanntmachung des Verfahrens und die Auslegung der Planunterlagen sowie daran anschließend die Bearbeitung im Prüfschritt der „Behörden- und Öffentlichkeitsbeteiligung“. Dort werden Beteiligungseingänge (Einwendungen / Stellungnahmen) verwaltet und die entsprechenden Erwiderungen der Vorhabenträgerin erfasst (s. Kapitel [5.2.15](#kapitel-5-2-15)).
1. Rechtliche Prüfung und Beschlusserstellung: Im letzten Schritt erfolgt die rechtliche Prüfung und Beschlusserstellung. Hier wird die Genehmigungsfähigkeit des Vorhabens geprüft und die (positive oder negative) Genehmigungsentscheidung der Behörde (Beschluss) verfasst. Der finalisierte Beschluss wird zum Download bereitgestellt (s. Kapitel [5.2.16](#kapitel-5-2-16)).

#### 5.1.2 Änderung der Unterlagen [!toc] [#kapitel-5-1-2]

Vor und während eines Planfeststellungsverfahrens können Unterlagen – auch mehrfach – geändert werden.

Änderungen können zeitlich grundsätzlich vor der Auslegung des Plans, beispielsweise durch Ergänzung unvollständiger Unterlagen infolge von behördlichen Nachforderungen, oder nach der Auslegung des Plans als Planänderungen erfolgen.

In der Applikation werden Änderungen der Unterlagen durch Versionierung nachgehalten. Liegt eine Änderung von Unterlagen vor, können die Unterlagen in der Verfahrensübersicht in dem jeweiligen Verfahren aktualisiert werden. Hierbei ist vorgesehen, den vollständigen, aktualisierten Unterlagensatz hochzuladen, sodass automatisiert eine Differenz zu den vorherigen Unterlagen gebildet werden kann. Auf dieser Grundlage identifiziert die Applikation, ob bzw. welche Unterlagen hinzugefügt, geändert oder entfernt wurden.

Jede Änderung der Unterlagen führt zur Erstellung einer neuen Version, die automatisch mit einem Zeitstempel versehen wird. Frühere Versionen bleiben nachvollziehbar erhalten und werden als veraltet gekennzeichnet, insbesondere wenn KI-Ergebnisse auf einem nicht mehr aktuellen Stand basieren. KI-Analysen, die auf veralteten Unterlagen basieren, können direkt im Prozessschritt (formale Vollständigkeitsprüfung, Plausibilitätsprüfung) oder an den entsprechend relevanten Stellen (materielle Vollständigkeitsprüfung, rechtliche Prüfung und Beschlusserstellung) neu gestartet und so aktualisiert werden.

Sofern sich Änderungen in den Unterlagen auf bereits geprüfte Inhalte wie etwa Normprüfungen in der materiellen Vollständigkeitsprüfung auswirken, kann eine erneute Prüfung bereits geprüfter Inhalte erforderlich werden. Entsprechende Prüfstände werden in der Applikation kenntlich gemacht. Bereits auf „geprüft“ gesetzte Bewertungen werden mit der Kennzeichnung „erneut prüfen“ versehen und können durch die Nutzenden gezielt erneut bewertet werden. Dadurch wird ermöglicht, dass Entscheidungen stets auf den aktuellen Unterlagen basieren. So wird eine konsistente und aktuelle Bewertung des Verfahrens sichergestellt.

#### 5.1.3 Unterstützende Funktionen [!toc] [#kapitel-5-1-3]

Zusätzlich zu den Verfahrensschritten stehen verschiedene unterstützende Funktionen zur Verfügung:

- Verfahrensanlage und Unterlagenimport: Ausgehend vom Dashboard (s. Kapitel [5.2.3](#kapitel-5-2-3)) wird ein neues Verfahren angelegt, die Verfahrensinformationen werden eingegeben und die Unterlagen werden hochgeladen. Dies kann auch über externe Schnittstellen erfolgen.
- Verfahrensübersicht (s. Kapitel [5.2.5](#kapitel-5-2-5)) und Einzelverfahrensübersicht (s. Kapitel [5.2.11](#kapitel-5-2-11)): ermöglichen den strukturierten Zugriff auf laufende und abgeschlossene Verfahren.
- KI-Werkzeug „Schwärzungsagent“: ermöglicht die Schwärzung personenbezogener Daten in einem PDF-Dokument.
- Nachforderungsmanagement (s. Kapitel [6.2.2](#kapitel-6-2-2)): koordiniert die Rückmeldungen an Antragstellende.
- Kommentarfunktion (s. Kapitel [6.2.3](#kapitel-6-2-3)): unterstützt die interne Abstimmung.
- Protokollierung (s. Kapitel [6.2.4](#kapitel-6-2-4)): zeichnet alle User- und KI-basierten Aktionen auf und stellt ein Audit Log zum Export zur Verfügung.
- Erklärung zur Barrierefreiheit (s. Kapitel [4.2](#kapitel-4-2)): gibt Auskunft zur digitalen Barrierefreiheit von SPARK Workflow.
