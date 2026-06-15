"""Database seeding script for template document types.

This script populates the database with template categories and document types
that serve as the source of truth for project-specific FCS configurations.
"""

import uuid
from typing import Any

from event_logging import EventAction, EventCategory, EventOutcome
from event_logging.enums import LogEventDefault
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.models.db_models import Base, TemplateCategory, TemplateDocumentType
from src.utils.logger import logger


def uid(n: int) -> uuid.UUID:
    """Generate a deterministic UUID from an integer."""
    return uuid.UUID(int=n)


# Project type IDs — must match the IDs seeded in project_logic_service.
# uid(0) = Fernstraßen Bundesamt, uid(1) = Offshore-Windparks, uid(2) = Hochspannungsleitungen
FERNSTRASSEN_BUNDESAMT_PROJECT_TYPE_ID = uid(0)

TEMPLATE_SEED_DATA: list[dict[str, Any]] = [
    {
        "category": "Teil A - Vorhabensbeschreibung",
        "project_type_id": FERNSTRASSEN_BUNDESAMT_PROJECT_TYPE_ID,
        "document_types": [
            {
                "name": "Erläuterungsbericht",
                "description": "Ein Dokument, das das beantragte Vorhaben sowie den Antragsgegenstand erläutert. Es enthält u. a. Angaben zur Planrechtfertigung, zur Abschnittsbildung, zur Vorausschau eines Gesamtvorhabens, zu vorausgegangenen Verfahrensschritten sowie regelmäßig die fachplanerische Alternativen- bzw. Variantenprüfung. Zudem setzt es sich mit den durch das Vorhaben berührten rechtlichen und fachplanerischen Belangen auseinander. Das Dokument enthält zusammenfassende Ausführungen zu den technischen Rahmenbedingungen sowie zu den umwelt- und naturschutzrechtlichen Auswirkungen des Vorhabens / der Anlage einschließlich ggf. vorgesehener Schutzmaßnahmen.",
                "expected_count": 1,
            },
        ],
    },
    {
        "category": "Teil B - Planteil",
        "project_type_id": FERNSTRASSEN_BUNDESAMT_PROJECT_TYPE_ID,
        "document_types": [
            {
                "name": "Übersichtskarte",
                "description": "Die Übersichtskarte vermittelt einen Überblick über die Lage der Baumaßnahme im Straßennetz. Sie stellt den geplanten Trassenverlauf des Vorhabens auf einer (politischen Karte grafisch mittels einer farblicher Kennzeichnung dar. Der Zusammenhang mit anderen Vorhaben von Verkehrswegeplänen soll dargestellt werden. Die Karte wird auf der Grundlage von digitalen topografischen Karten oder gegebenenfalls digitalen Luftbildern erzeugt.",
                "expected_count": 1,
            },
            {
                "name": "Übersichtslageplan",
                "description": "Ein Übersichtsplan, der den geplanten Streckenverlauf lagebezogen darstellt und die räumliche Einordnung des Vorhabens ermöglicht (u. a. Anschlussstellen / Knotenpunkte, Querungen, relevante Infrastrukturen, Schutzgebiete). Der Verlauf kann auch abschnittsweise in mehreren Übersichtslageplänen dargestellt werden. Der Plan wird regelmäßig auf der Grundlage von digitalen topografischen Karten oder digitalen Luftbildern erzeugt.",
                "expected_count": 1,
            },
            {
                "name": "Übersichtshöhenplan",
                "description": "Ein Übersichtsplan, der den geplanten Streckenverlauf in einer höhenbezogenen Übersicht darstellt (z. B. Geländehöhen, topografische Randbedingungen, grobe Höhenbezüge / Relief) und der orientierenden Darstellung der Höhenverhältnisse entlang der gesamten Strecke des Vorhabens dient. Er vermittelt den Überblick zur Gradiente und zu den Geländeverhältnissen. Er enthält regelmäßig Höhen- und Steigungsangaben. Zudem enthält er zum Teil bauwerksbezogene Angaben (bspw. Kilometrierung, Länge, Verlaufsdarstellung, Quer- und Längsachsneigung).",
                "expected_count": 1,
            },
            {
                "name": "Lageplan",
                "description": 'Der "Lageplan" ist ein Trassierungslageplan, d.h. eine technische Zeichnung zum geplanten Streckenverlauf mit Darstellung der Trasse, der Straßenachse, der Bauwerke, der Baubereiche sowie vorübergehend (z. B. Baufelder, Arbeitsflächen, Baustraßen / Behelfswege) oder dauerhaft (z. B. Straßenkörper, Böschungen, Entwässerungsanlagen, dauerhafte Nebenflächen) in Anspruch zu nehmender Flächen. Enthalten sind zudem Fremdanlagen sowie die Katastersituation (Gemarkung, Flur, Flurstück) im Bereich und im Umfeld des Vorhabens. Es können zudem Angaben zur Geländesteigung, -begrünung und der Zuordnung zu Gemeinden enthalten sein. In eingefügten Textfeldern könen sich zudem weitere Erläuterungen zur (überplanten) Lage finden.',
                "expected_count": 1,
            },
            {
                "name": "Höhenplan",
                "description": "Ein Höhenplan (Längsprofil) als technische Zeichnung, die den Streckenverlauf in der Vertikalen / im Aufriss darstellt. Er enthält regelmäßig Angaben zu Geländehöhen, Gradiente, Neigungen sowie zu besonderen Punkten und Bauwerken (z. B. Brücken, Unter- / Überführungen, Gewässerquerungen, Knotenpunkte) entlang des Vorhabens. Der Höhenplan hat einen höheren Detailgrad als der Übersichtshöhenplan.",
                "expected_count": 1,
            },
            {
                "name": "Lageplan der Immissionsschutzmaßnahmen*",
                "description": "Ein Lageplan, der immissionsschutzbezogene Maßnahmen im Vorhabensbereich kartografisch verortet. Dargestellt werden u.a. die im Ergebnis der schalltechnischen Berechnung lärmbetroffenen Bereiche / schutzwürdige Nutzungen sowie die vorgesehenen Schutzvorkehrungen zur Vermeidung oder Minderung von Immissionen (insb. Verkehrslärm), wie z. B. Lärmschutzwände / -wälle, lärmmindernde Beläge, Geschwindigkeitsbeschränkungen. Der Plan ist nicht vorzulegen, wenn die Lärmsituation im Lageplan nicht dargestellt werden kann oder wenn Maßnahmen oder Immissionsorte außerhalb der Lageplanausschnitte liegen.",
                "expected_count": 1,
            },
            {
                "name": "Lageplan der Entwässerungsmaßnahmen*",
                "description": "Ein Lageplan, der die Entwässerung des Vorhabens kartografisch darstellt. Er enthält regelmäßig Angaben zu Entwässerungseinrichtungen (z. B. Mulden / Rigolen, Leitungen / Sammler, Durchlässe), Einleitstellen, Versickerungs- und Rückhalte- / Behandlungsanlagen sowie Bezüge zu Gewässern, Wasserschutzgebieten und sonstigen Schutzzonen und dient als Grundlage für wasserrechtliche und wasserwirtschaftliche Bewertungen. Der Plan ist nicht vorzulegen, wenn die Entwässerungsmaßnahmen im Lageplan nihct dargestellt werden kann oder wenn Entwässerungsanlagen außerhalb der Lageplanausschnitte liegen. Die Grundlagen und Berechnungen für den Lageplan der Entwässerungsmaßnahmen enthält Unterlage 18 Wassertechnische Untersuchungen.",
                "expected_count": 1,
            },
            {
                "name": "Landschaftspflegerische Maßnahmen (Maßnahmenübersichtsplan)",
                "description": "Der Maßnahmenübersichtsplan ist ein Lageplan, der regelmäßig Bestandteil des Landschaftspflegerischen Begleitplans (LBP) ist. Er berücksichtigt die naturschutzrechtliche Eingriffsregelung, den Natura 2000-Gebietsschutz und den Artenschutz. Der Plan bildet Schutzgebiete ab. Der Plan bildet die Lage der vorgesehenen Vermeidungsmaßnahmen, Minderungsmaßnahmen, Ausgleichsmaßnahmen und Ersatzmaßnahmen sowie der Schadensbegrenzungsmaßnahmen, Kohärenzsicherungsmaßnahmen, CEF-Maßnahmen und FCS-Maßnahmen ab. Nicht jede Maßnahme ist Bestandteil jeder Planung, d.h. es müssen nicht Informationen zu allen benannten Maßnahmentypen enthalten sein.",
                "expected_count": 1,
            },
            {
                "name": "Landschaftspflegerische Maßnahmen (Maßnahmenplan)",
                "description": "Die Maßnahmenpläne sind Lagepläne, die regelmäßig Bestandteil des Landschaftspflegerischen Begleitplans (LBP) sind. Sie berücksichtigen die naturschutzrechtliche Eingriffsregelung, den Natura 2000-Gebietsschutz und den Artenschutz. Die Pläne bilden Schutzgebiete ab. Die Pläne bilden die Lage der vorgesehenen Vermeidungsmaßnahmen, Minderungsmaßnahmen, Ausgleichsmaßnahmen und Ersatzmaßnahmen sowie der Schadensbegrenzungsmaßnahmen, Kohärenzsicherungsmaßnahmen, CEF-Maßnahmen und FCS-Maßnahmen ab. Nicht jede Maßnahme ist Bestandteil jeder Planung, d.h. es müssen nicht Informationen zu allen benannten Maßnahmentypen enthalten sein.",
                "expected_count": 1,
            },
            {
                "name": "Landschaftspflegerische Maßnahmen (Maßnahmenblätter)",
                "description": "Die Maßnahmenblätter sind regelmäßig Bestandteil des Landschaftspflegerischen Begleitplans (LBP). In den Maßnahmenblättern werden die landschaftspflegerischen Maßnahmen unter Bezugnahme der durch das Vorhaben hervorgerufenen Konflikte hergeleitet, beschrieben und nachvollziehbar begründet. Dafür enthalten die Maßnahmenblätter für jede vorgesehene Vermeidungsmaßnahme, Minderungsmaßnahme, Ausgleischmaßnahme, Ersatzmaßnahme, Schadensbegrenzungsmaßnahme, Kohärenzsicherungsmaßnahme, CEF-Maßnahmen oder FCS-Maßnahme gesondert Maßnahme eine gesonderte Beschreibung. Nicht jede Maßnahme ist Bestandteil jeder Planung, d.h. es müssen nicht Informationen zu allen benannten Maßnahmentypen enthalten sein. Die Beschreibung der Maßnahmen findet sich oft in Formblättern.",
                "expected_count": 1,
            },
            {
                "name": "Landschaftspflegerische Maßnahmen (tabellarische Gegenüberstellung von Eingriff und Kompensation)",
                "description": "Ein Dokument mit einer tabellarischen Gegenüberstellung von Eingriff und Kompensation, das regelmäßig Bestandteil des Landschaftspflegerischen Begleitplans (LBP) ist. In dem Dokument werden die landschaftspflegerischen Maßnahmen unter Bezugnahme der durch das Vorhaben hervorgerufenen Konflikte hergeleitet. Es handelt sich um die Maßnahmen, die in den Maßnahmenübersichtsplänen und in den Maßnahmenplänen dargestellt werden.",
                "expected_count": 1,
            },
            {
                "name": "Grunderwerb (Grunderwerbsplan)",
                "description": "Ein Grunderwerbsplan bzw. Grundstücksplan ist eine technische Zeichnung unter Darstellung des geplanten Trassenverlaufs sowie aller betroffenen Liegenschaften mit Kennzeichnung der Katastersituation. Der Grunderwerbsplan bildet die im Grunderwerbsverzeichnis aufgelisteten Grundstücksinanspruchnahmen ab.",
                "expected_count": 1,
            },
            {
                "name": "Grunderwerb (Grunderwerbsverzeichnis)",
                "description": "Im Grunderwerbsverzeichnis sind alle vom Vorhaben betroffenen Liegenschaften benannt und Angaben zu deren Beanspruchung in Art und Umfang enthalten. Das Verzeichnis enthält eine tabellarische Auflistung. Die Tabelle ist fortlaufend nummeriert und enthält unter anderem Angaben zur Flur, Flurstück, Gemarkung, Nutzungsart, Grundbuch, Grundbuchblatt, Flächenbedarf und Art der in Anspruch zu nehmenden Flächen und Angaben zur ggf. erforderlichen dinglichen Sicherung / zum Erwerb der Flächen.",
                "expected_count": 1,
            },
            {
                "name": "Regelungsverzeichnis",
                "description": "Ein Verzeichnis, das die im Plan enthaltenen Regelungen und Festsetzungen tabellarisch aufführt. Es dient der Nachvollziehbarkeit der planungsrechtlichen und technischen Regelungen (z. B. Bauausführung, Verkehrsführung während der Bauzeit, Betrieb, Schutzmaßnahmen, Nebenbestimmungen) und kann Verweise auf zugehörige Pläne, Maßnahmen und Auflagen enthalten. Kostenregelungen werden dem Grunde nach aufgeführt, wenn sie auf einer öffentlich-rechtlichen Rechtsgrundlage beruhen. Auf Kostenregelungen, die auf privatrechtlichen Veträgen beruhen, wird nachrichtlich hingewiesen.",
                "expected_count": 1,
            },
            {
                "name": "Widmung / Umstufung / Einziehung",
                "description": "Eine Unterlage bzw. ein Plan, die erforderliche straßenrechtliche Entscheidungen zur Widmung, Umstufung oder Einziehung betroffener Verkehrsflächen darstellt und begründet. Sie enthält regelmäßig Angaben zu betroffenen Strecken / Flächen, Rechtsgrundlagen, Umfang der Änderung.",
                "expected_count": 1,
            },
        ],
    },
    {
        "category": "Teil C - Untersuchungen, weitere Pläne, Skizzen",
        "project_type_id": FERNSTRASSEN_BUNDESAMT_PROJECT_TYPE_ID,
        "document_types": [
            {
                "name": "Straßenquerschnitt (Ermittlung der Bauklasse, Regelquerschnitte, Sonderquerschnitte)",
                "description": "Ein Dokument bzw. meist mehrere Dokumente mit (tabellarischen) Angaben zur Bauklassenermittlung und mit Abbildungen zu Querschnittsdarstellungen (Regel- und Sonderquerschnitte) des Straßenbauvorhabens. Es enthält technische Zeichnungen einschließlich Bemaßungen z. B. zu Fahrstreifen- und Seitenstreifen / Seitenraumaufbau, Mittelstreifen, Banketten, Böschungen, Entwässerung, Abständen sowie zu Sonderbereichen (z. B. Bauwerke, Lärmschutz, Knotenpunkte) und dient der Darstellung der bautechnischen Ausgestaltung.",
                "expected_count": 1,
            },
            {
                "name": "Sonstige Pläne (besondere Lagepläne, Planunterlagen Folgemaßnahmen § 75 Abs. 1 Satz 1 VwVfG)",
                "description": "Ein Plan oder mehrere Pläne sowie Abbildungen mit technischen Zeichnungen die vorhabenbezogene Besonderheiten im Bereich des Streckenverlaufs oder der Ausführung darstellen. Dies sind u. a. Detaillagepläne / Sonderlagepläne für Teile der Straßenbaumaßnahme (bspw. Knotenpunkte, Rastanlagen, Nebenanlagen, Leitungen), Pläne mit technischen Zeichnungen / Bauwerksskizzen zu besonderen Querungen / Bauwerken oder zu notwendigen Folgemaßnahmen an Anlagen anderer Planungsträger (§ 75 Abs. 1 Satz 1 VwVfG) wie bspw. die Umlegung von Leitungen / Bahnanlagen.",
                "expected_count": 1,
            },
            {
                "name": "Immissionstechnische Untersuchungen (Erläuterungen, Berechnungen)",
                "description": "Eine, oft mehrere Unterlagen, die die durch das Fernstraßenvorhaben verursachten Immissionen im Bau- und Betriebszustand ermitteln und bewerten. Dazu gehören regelmäßig (1) Untersuchungen zum Baulärm (Geräte- / Baustellenlärm, Bauphasen, zeitliche Einordnung), (2) Untersuchungen zum Verkehrslärm (Prognose der Verkehrsbelastung, Berechnung der Immissionspegel an maßgeblichen Immissionsorten, Prüfung der Einhaltung geltender Grenz- / Auslösewerte), (3) Untersuchungen zur Gesamtlärmsituation (Prognose), (4)Untersuchungen zu Luftschadstoffimmissionen und (5) Untersuchungen zu baubedingten Erschütterungen (einschließlich sekundärem Luftschall) - jeweils mit Erläuterungen, Annahmen, Rechen- / Berechnungsunterlagen, Ergebnisdarstellungen und Bewertung. Soweit erforderlich enthalten die Unterlagen Vorschläge und Nachweise zu Lärmschutzmaßnahmen (z. B. aktive Lärmschutzanlagen wie Wände / Wälle, lärmmindernde Fahrbahnbeläge, Bauablauf- / Geräteeinschränkungen, erschütterungsmindernde Bauverfahren) sowie die kartografische / planerische Verortung relevanter Wirkbereiche.",
                "expected_count": 1,
            },
            {
                "name": "Wassertechnische Untersuchungen (Erläuterungen, Berechnungen)",
                "description": "Ein oder mehrere wassertechnische Unterlagen, die die Angaben / Berechnungen zur Bemessung der Anlagen für die Oberflächenentwässerung des Straßenkörpers enthalten. Enthalten sind regelmäßig (tabellarische) Angaben zu Art und Umfang der Einleitung von Straßenoberflächenwasser in Gewässer, eine Beschreibung der wasserwirtschaftlich relevanten Vorhabenbestandteile (z. B. Straßenentwässerung, Rückhalteanlagen / Behandlungsanlagen, Einleitungen, Versickerung, Wasserhaltung), die Abgrenzung betroffener Wasserkörper / Einzugsgebiete, Berechnungen und Nachweise (z. B. Bemessung von Entwässerungs- und Behandlungsanlagen, Abfluss- / Retentionsnachweise, Stoffeintrags- / Behandlungsnachweise). Die wassertechnischen Untersuchungen enthalten bei Gewässerquerungen oder bei Lage des Vorhabens im Überschwemmungsgebiet den Nachweis des schadlosen Hochwasserabflusses einschließlich der Berechnung von Retentionsraumverlust und Retentionsraumersatz.",
                "expected_count": 1,
            },
            {
                "name": "UVP-Bericht / Umweltverträglichkeitsstudie",
                "description": "Der UVP-Bericht dient der Umsetzung der Anforderungen aus § 16 UVPG und der Anlage 4 zum UVPG. Er stellt das Vorhaben mit seinen voraussichtlichen Umweltauswirkungen schriftlich dar und wird durch Abbildungen und Karten ergänzt. Der UVP-Bericht enthält eine Beschreibung des Vorhabens mit Angaben zum Standort, zur Art, zum Umfang und zur Ausgestaltung, zur Größe und zu anderen wesentlichen Merkmalen des Vorhabens, eine Beschreibung der Umwelt und ihrer Bestandteile im Einwirkungsbereich des Vorhabens, eine Beschreibung der Merkmale des Vorhabens und des Standorts, mit denen das Auftreten erheblicher nachteiliger Umweltauswirkungen des Vorhabens ausgeschlossen, vermindert oder ausgeglichen werden soll, eine Beschreibung der geplanten Maßnahmen, mit denen das Auftreten erheblicher nachteiliger Umweltauswirkungen des Vorhabens ausgeschlossen, vermindert oder ausgeglichen werden soll, sowie eine Beschreibung geplanter Ersatzmaßnahmen, eine Beschreibung der zu erwartenden erheblichen Umweltauswirkungen des Vorhabens, eine Beschreibung der vernünftigen Alternativen, die für das Vorhaben und seine spezifischen Merkmale relevant und vom Vorhabenträger geprüft worden sind, und die Angabe der wesentlichen Gründe für die getroffene Wahl unter Berücksichtigung der jeweiligen Umweltauswirkungen sowie eine allgemein verständliche, nichttechnische Zusammenfassung des UVP-Berichts.",
                "expected_count": 1,
            },
            {
                "name": "FFH-Verträglichkeitsprüfung / Natura 2000-Verträglichkeitsprüfung",
                "description": "Die FFH-Verträglichkeitsprüfung / Natura 2000-Verträglichkeitsprüfung ist durchzuführen, wenn die FFH-Vorprüfung Beeinträchtigungen eines Natura 2000-Gebietes nicht ohne weiteres, z. B. nicht ohne eigene Untersuchungen, nicht ohne Festlegung von Schadensbegrenzungsmaßnahmen etc., ausschließen kann, oder wenn erhebliche Beeinträchtigungen nicht von vornherein ausgeschlossen werden können. Die Unterlage untersucht die Verträglichkeit des geplanten Vorhabens mit den Erhaltungszielen eines Natura 2000-Gebiets (FFH-Gebiet, Vogelschutzgebiet) im Wirkraum des Planvorhabens. Prüfungsgegenstand ist § 34 BNatSchG im Hinblick auf mögliche erhebliche Beeinträchtigungen eines Natura 2000-Gebiets in seinem für die Erhaltungsziele oder den Schutzzweck maßgeblichen Bestandteile. Dabei wird auch das Zusammenwirken des beantragten Vorhabens mit anderen Plänen und Projekten berücksichtigt.",
                "expected_count": 1,
            },
            {
                "name": "Landschaftspflegerischer Begleitplan (LBP)",
                "description": "Der Landschaftspflegerische Begleitplan (LBP) dient der Berücksichtigung der naturschutzrechtlichen Eingriffsregelung (§§ 14, 15 Bundesnaturschutzgesetzes - BNatSchG) und integriert auch andere naturschutzbezogene Erhebungen und Maßnahmen (§ 17 BNatSchG). Der LBP besteht in der Regel aus einem Erläuterungsbericht sowie aus einem Kartenteil, in dem die Beeinträchtigungen und die geplanten CEF- und FCS-Maßnahmen, Schutz- und Kompensationsmaßnahmen (Ausgleichsmaßnahmen, Ersatzmaßnahmen) im Bezug zum beantragten Vorhaben / der Anlage dargestellt sind. Die zum LBP gehörenden Unterlagen Maßnahmenübersichtsplan, die Maßnahmenpläne, die Maßnahmenblätter und die tabellarische Gegenüberstellung von Eingriff und Kompensation sind in der Unterlage 9 enthalten.",
                "expected_count": 1,
            },
            {
                "name": "Artenschutzrechtlicher Fachbeitrag",
                "description": "Ein artenschutzrechtlicher Fachbeitrag / Artenschutzfachbeitrag / spezielle artenschutzrechtliche Prüfung ist ein Gutachten, das die Auswirkungen eines Vorhabens auf besonders geschützte und streng geschützte und bestimmte andere Tier- und Pflanzenarten sowie deren Entwicklungsformen bewertet. Er ist notwendig, um zu prüfen, ob die in § 44 Abs. 1 des Bundesnaturschutzgesetzes (BNatSchG) genannten Verbotstatbestände (sog. Zugriffsverbote) bei Realisierung des Vorhabens erfüllt werden. Dabei sind - wenn die Voraussetzungen erfüllt sind - auch die Privilegierungstatbestände in § 44 Abs. 5 BNatSchG zu berücksichtigen. Ziel ist die Einhaltung des besonderen Artenschutzrechts und - bei Bedarf - die Entwicklung von Vermeidungs- und vorgezogenen Ausgleichsmaßnahmen (sog. CEF-Maßnahmen), um Beeinträchtigungen zu vermeiden oder vorgezogen auszugleichen. Ggf. wird in der Unterlage auch dargelegt, weshalb eine artenschutzrechtliche Ausnahme nach § 45 Abs. 7 BNatSchG erteilt werden muss und kann. Dann enthält die Unterlage auch eine Alternativenprüfung und ggf. FCS-Maßnahmen / populationsstützende Maßnahmen. Der Artenschutzfachbeitrag kann in den Landschaftspflegerischen Begleitplan (Unterlage 19) integriert sein.",
                "expected_count": 1,
            },
        ],
    },
]


def row_exists(db: Session, model: type[Base], **filters: Any) -> bool:
    """Check if a row exists in the database for the given model and filters.

    Args:
        db: SQLAlchemy session.
        model: SQLAlchemy model class.
        **filters: Arbitrary keyword filters to apply.

    Returns:
        True if row exists, False otherwise.
    """
    stmt = select(1).select_from(model).filter_by(**filters).limit(1)
    result = db.execute(stmt)
    return result.scalar_one_or_none() is not None


def _category_key(project_type_id: uuid.UUID | None, category_name: str) -> tuple[uuid.UUID | None, str]:
    """Build a stable lookup key for a template category."""
    return (project_type_id, category_name)


def seed_template_categories(db: Session) -> dict[tuple[uuid.UUID | None, str], uuid.UUID]:
    """Seed template categories and return name->id mapping.

    Args:
        db: SQLAlchemy session.

    Returns:
        Dictionary mapping (project_type_id, category_name) to category UUIDs.
    """
    category_ids: dict[tuple[uuid.UUID | None, str], uuid.UUID] = {}

    for i, cat_data in enumerate(TEMPLATE_SEED_DATA):
        cat_name = cat_data["category"]
        project_type_id = cat_data.get("project_type_id")
        key = _category_key(project_type_id, cat_name)

        result = db.execute(
            select(TemplateCategory.id)
            .where(
                TemplateCategory.name == cat_name,
                TemplateCategory.project_type_id == project_type_id,
                TemplateCategory.deleted.is_(False),
            )
            .limit(1)
        )
        existing_category_id = result.scalar_one_or_none()
        if existing_category_id is not None:
            category_ids[key] = existing_category_id
            continue

        cat_id = uid(i + 1)
        category = TemplateCategory(
            id=cat_id,
            name=cat_name,
            project_type_id=project_type_id,
        )
        db.add(category)
        category_ids[key] = cat_id

    db.flush()
    return category_ids


def seed_template_document_types(db: Session, category_ids: dict[tuple[uuid.UUID | None, str], uuid.UUID]) -> None:
    """Seed template document types linked to categories.

    Args:
        db: SQLAlchemy session.
        category_ids: Dictionary mapping (project_type_id, category_name) to category UUIDs.
    """
    doc_type_index = 0

    for cat_data in TEMPLATE_SEED_DATA:
        cat_name = cat_data["category"]
        project_type_id = cat_data.get("project_type_id")
        cat_id = category_ids[_category_key(project_type_id, cat_name)]

        for doc_type_data in cat_data["document_types"]:
            doc_name = doc_type_data["name"]

            if row_exists(
                db,
                TemplateDocumentType,
                template_category_id=cat_id,
                name=doc_name,
            ):
                doc_type_index += 1
                continue

            doc_type = TemplateDocumentType(
                id=uid(1000 + doc_type_index),
                template_category_id=cat_id,
                name=doc_name,
                description=doc_type_data["description"],
                expected_count=doc_type_data.get("expected_count"),
            )
            db.add(doc_type)
            doc_type_index += 1

    db.flush()


def seed_template_data(db: Session) -> None:
    """Main entry point to seed all template data.

    Args:
        db: SQLAlchemy session.
    """
    logger.info(
        action=EventAction.WRITE,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.DATABASE,
        default_event=LogEventDefault.DATA_IMPORT,
        message="Starting template data seeding...",
    )
    category_ids = seed_template_categories(db)
    seed_template_document_types(db, category_ids)
    db.commit()
    logger.info(
        action=EventAction.WRITE,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.DATABASE,
        default_event=LogEventDefault.DATA_IMPORT,
        message="Template data seeding completed successfully.",
    )


if __name__ == "__main__":
    from sqlalchemy import create_engine

    from src.config.settings import settings

    engine = create_engine(settings.database_url.replace("+asyncpg", ""))
    with Session(engine) as session:
        seed_template_data(session)
