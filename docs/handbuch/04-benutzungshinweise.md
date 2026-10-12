## 4 Benutzungshinweise [#kapitel-4]

### 4.1 Aufbau der Benutzeroberfläche [#kapitel-4-1]

Die Benutzeroberfläche folgt einer klaren und konsistenten Struktur, die eine intuitive Orientierung und effiziente Bearbeitung ermöglicht.

Zentrale Orientierung bietet eine ausklappbare Navigationsleiste, die in allen Ansichten präsent bleibt und den Zugriff auf wesentliche Funktionen ermöglicht. In den einzelnen Prüfschritten eines Verfahrens wird der aktuelle Bearbeitungsstand durch Fortschrittsindikatoren ersichtlich. Diese visualisieren den Ablauf der Prüfung transparent. Standardisierte Kopfzeilen-Bereiche sorgen zusätzlich für Einheitlichkeit und Orientierung und erleichtern somit die Navigation.

KI-generierte Inhalte sowie KI-bezogene Aktionen werden im gesamten System konsequent mit einem „Stern“-Icon sowie lilafarbener Färbung gekennzeichnet.

Informationen werden Nutzenden kontextbezogen zur Verfügung gestellt. In den Arbeitsschritten wird dabei mit vertikal geteilten Sektionen der Benutzeroberfläche gearbeitet. Diese expandieren in der Ansicht auf großen Bildschirmen; auf kleineren Ausgabegeräten wird mit einer Tab-Logik gearbeitet, um alle relevanten Sektionen flexibel zu erreichen.

Um die Hauptansichten übersichtlich zu halten, werden ergänzende Bearbeitungsschritte und Eingaben in Detailansichten oder sogenannten Dialogfenstern umgesetzt. Ein Dialogfenster ist ein temporäres Fenster, das sich über der Benutzeroberfläche für Eingaben und Dialoge öffnet. So konzentriert sich die Kernansicht auf das Wesentliche, während gleichzeitig alle notwendigen Funktionen ohne Umwege zugänglich bleiben. Relevante Angaben zum Verfahren und KI-Ergebnisse werden in Tabellen dargestellt, was die Leserlichkeit erhöht und die Übersicht über den Prozess hinweg erleichtert.

Der konsistente Aufbau der Benutzeroberfläche ermöglicht den Nutzenden, Strukturen schnell zu verinnerlichen und dadurch eine sichere Orientierung im System zu entwickeln. Wiederkehrende Elemente und eine einheitliche Navigationslogik schaffen Vertrautheit, während unmittelbares Feedback jede Eingabe transparent macht. So entsteht eine Arbeitsumgebung, die sowohl wirksam als auch nachvollziehbar ist.

### 4.2 Barrierefreiheit, Ergonomie und Mehrsprachenunterstützung [#kapitel-4-2]

Die Applikation SPARK Workflow ist auf eine ergonomische und barrierefreie Nutzung für unterschiedliche Nutzergruppen ausgerichtet. Seit September 2026 ist SPARK Workflow nach der Barrierefreie-Informationstechnik-Verordnung (BITV 2.0) zertifiziert und erfüllt damit die gesetzlichen Anforderungen an die digitale Barrierefreiheit.

Die Applikation wurde zwischen Juni und September 2026 durch das ITZBund nach BITV 2.0 geprüft. Einzelheiten zur Barrierefreiheit enthält die Erklärung zur Barrierefreiheit, die in der Applikation über den Navigationspunkt „Barrierefreiheit“ aufgerufen werden kann (s. Kapitel [5.2.4](#kapitel-5-2-4)).

Einschränkungen hinsichtlich der Barrierefreiheit können sich bei der Anzeige und Verarbeitung von Dokumenten ergeben, die durch Vorhabenträger, Einwendende oder sonstige Verfahrensbeteiligte eingereicht werden (z. B. Antragsunterlagen oder Einwendungen und Stellungnahmen). Diese Unterlagen werden bei der Planfeststellungsbehörde häufig nicht barrierefrei eingereicht (z. B. technische Pläne oder handgeschriebene Einwendungen). Die Applikation verarbeitet und stellt diese Dokumente unverändert in der eingereichten Form bereit. Etwaige Einschränkungen der Barrierefreiheit dieser Inhalte resultieren somit aus den Ausgangsdokumenten selbst.

Eine vollständige Tastaturnutzbarkeit ist gegeben. Es ist vorgesehen, Tastaturnutzenden die Navigation zwischen einzelnen Prozessbereichen (z. B. sogenannten „Swimlanes“) zu erleichtern. Für diese Funktionalität ist vorgesehen, künftig eine gezielte Steuerung über Tastaturkürzel bereitzustellen, um die Nutzung durch Screenreader und andere assistive Technologien zu verbessern.

Die kontinuierliche Weiterentwicklung der Barrierefreiheit ist Bestandteil der Produktentwicklung von SPARK Workflow.

Die Applikation steht in deutscher und englischer Sprache zur Verfügung.

### 4.3 Rollen- und Rechtekonzept [#kapitel-4-3]

**Systemweite Rollen:**

**Administration**

Die Administration verfügt über übergreifende, systemweite Berechtigungen. Die verfügbaren Verfahrensarten sowie je Verfahrensart den Themenkatalog, die erforderlichen Unterlagen und die Beschlussvorlage pflegt sie im Administrationsbereich der Applikation (s. Kapitel [6.3](#kapitel-6-3)). Für Berechtigungsstrukturen stehen ihr administrative Pflegefunktionen über das Backend zur Verfügung.

Die Administration hat Zugriff auf alle Verfahren ihrer Behörde. Sie besitzt in Bezug auf Verfahren ihrer Behörde alle Rechte der Verfahrensleitung. Sie kann unabhängig von einer Verfahrenszuordnung auf Verfahren zugreifen, Rollen- und Teamzuordnungen verwalten, Verfahren löschen sowie das Audit-Protokoll einsehen und exportieren.

**Bearbeitende**

In einem Produktivbetrieb verfügen Bearbeitende nicht über diese systemweiten Berechtigungen. Sie werden bedarfsbezogen einzelnen Verfahren zugeordnet und erhalten ihre Rechte im jeweiligen Kontext.

**Verfahrensbezogene Rollen:**

Für jedes Verfahren wird ein Verfahrensteam definiert, das im Verlauf der Bearbeitung angepasst werden kann. In einem Verfahren bestehen folgende verfahrensbezogenen Funktionen:

**Verfahrensleitung**

Die Verfahrensleitung ist für die fachliche Steuerung des Verfahrens verantwortlich. Sie kann sämtliche Arbeitsschritte und Themen einsehen, das Verfahrensteam verwalten (insbesondere Bearbeitende hinzufügen, entfernen und verfahrensbezogene Rollen zuweisen) sowie Themen gezielt einzelnen Bearbeitenden zuordnen. Sie ist befugt, alle Inhalte zu bearbeiten und im Rahmen der fachlichen Prüfung und Qualitätssicherung Freigaben zu erteilen. Die Verfahrensleitung kann den Beschluss exportieren.

**Zugewiesene Bearbeitende**

Zugewiesene Bearbeitende sind Teil des Verfahrensteams. Sie können alle Inhalte des Verfahrens einsehen und im Rahmen ihrer Themenzuordnung an der Bearbeitung mitwirken. Die Themenzuordnung regelt ergänzend die konkrete Bearbeitungsberechtigung auf Ebene einzelner Themen.

Durch dieses mehrstufige Rollen- und Rechtemanagement wird eine klare Trennung von Verantwortlichkeiten sowie eine strukturierte und sichere Bearbeitung von Verfahren gewährleistet. Eine Erweiterung des Rollen- und Rechtemodells ist perspektivisch möglich.
