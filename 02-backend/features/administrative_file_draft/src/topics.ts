import { Type } from "@sinclair/typebox";

import { administrativeFileDraftErrors } from "./errors.ts";

export const TOPICS = {
  SONSTIGES_KEIN_THEMA: "Sonstiges / Kein Thema",
  GEGENSTAND_VORHABEN: "Gegenstand des Vorhabens",
  PLANUNGSSTUFEN: "Planungsstufen",
  LINIENBESTIMMUNG: "Linienbestimmung",
  NOTWENDIGKEIT_PLANFESTSTELLUNGSVERFAHREN: "Notwendigkeit des Planfeststellungsverfahrens",
  ZUSTAENDIGKEIT: "Zuständigkeit",
  VERFAHREN: "Verfahren",
  ANHOERUNGSVERFAHREN: "Anhörungsverfahren",
  UMWELTVERTRAEGLICHKEITSPRUEFUNG: "Umweltverträglichkeitsprüfung",
  PLANRECHTFERTIGUNG: "Planrechtfertigung",
  ALTERNATIVENPRUEFUNG: "Fachplanerische Alternativenprüfung",
  PLANUNGSLEITSAETZE: "Planungsleitsätze",
  RAUMORDNUNG: "Raumordnung",
  BAULEITPLANUNG: "Bauleitplanung",
  GESAMTABWAEGUNG: "Gesamtabwägung",
  IMMISSIONSSCHUTZ: "Immissionsschutz",
  IMMISSIONSSCHUTZ_VERKEHRSLAERM: "Immissionsschutz: Verkehrslärm",
  IMMISSIONSSCHUTZ_BAULAERM: "Immissionsschutz: Baulärm",
  IMMISSIONSSCHUTZ_LUFTSCHADSTOFFE: "Immissionsschutz: Luftschadstoffe",
  IMMISSIONSSCHUTZ_ERSCHUETTERUNGEN: "Immissionsschutz: Erschütterungen",
  NATURSCHUTZRECHT: "Naturschutzrecht",
  ARTENSCHUTZRECHT: "Artenschutzrecht",
  NATURA_2000_FFH_VERTRÄGLICHKEIT: "FFH-Verträglichkeit / Natura 2000",
  NATURSCHUTZ_EINGRIFFSREGELUNG: "Naturschutzrechtliche Eingriffsregelung",
  WALDSCHUTZ: "Waldschutz",
  WASSERRECHT_ERLAUBNISSE: "Wasserrechtliche Erlaubnisse",
  WASSERRAHMENRECHT: "Wasserrahmenrecht",
  GEWAESSERSCHUTZ: "Gewässerschutz",
  DENKMALSCHUTZ: "Denkmalschutz",
  BODENSCHUTZ_ALTLASTEN_ABFALL: "Bodenschutz, Altlasten, Abfall",
  KLIMASCHUTZ: "Klimaschutz",
  KOMMUNALE_BELANGE: "Kommunale Belange",
  GRUNDERWERB_EIGENTUM: "Grunderwerb / Eigentum",
  LANDWIRTSCHAFT: "Landwirtschaft",
  FORSTWIRTSCHAFT: "Forstwirtschaft",
  JAGDRECHT: "Jagdrecht",
  TECHNISCHE_SICHERHEIT: "Technische Sicherheit",
  BRAND_KATASTROPHENSCHUTZ: "Brand- und Katastrophenschutz",
  KAMPFMITTELBESEITIGUNG: "Kampfmittelbeseitigung",
  VER_ENTSORGUNGSANLAGEN: "Ver- und Entsorgungsanlagen",
  STRASSENRECHTLICHE_ENTSCHEIDUNGEN: "Straßenrechtliche Entscheidungen",
  NEBENBESTIMMUNGEN: "Nebenbestimmungen",
  ZUSAGEN_VORHABENTRAEGERIN: "Zusagen der Vorhabenträgerin",
  ENTSCHAEDIGUNGEN: "Entschädigungen",
  SOFORTIGE_VOLLZIEHBARKEIT: "Sofortige Vollziehbarkeit",
  KOSTENENTSCHEIDUNG: "Kostenentscheidung",
  RECHTSBEHELFSBELEHRUNG: "Rechtsbehelfsbelehrung",
  HOEHENPLAENE: "Höhenpläne",
  REGELUNGSVERZEICHNIS: "Regelungsverzeichnis",
  STRASSENQUERSCHNITT: "Straßenquerschnitt",
  LAGEPLAENE: "Sonstige Pläne: Lagepläne",
  UEBERWACHUNGSMASSNAHMEN: "Überwachungsmaßnahmen zur Einhaltung umweltbezogener Bestimmungen",
} as const;

export type TopicName = keyof typeof TOPICS;
export type TopicValue = (typeof TOPICS)[TopicName];

const topicNameByValue = new Map<TopicValue, TopicName>(
  Object.entries(TOPICS).map(([name, value]) => [value, name as TopicName]),
);

export const TopicValueSchema = Type.Enum(TOPICS);
export const NullableTopicValueSchema = Type.Union([TopicValueSchema, Type.Null()]);

export function topicToDatabase(value: string): TopicValue {
  if (topicNameByValue.has(value as TopicValue)) return value as TopicValue;
  const display = TOPICS[value as TopicName];
  if (display === undefined) {
    throw administrativeFileDraftErrors.INVALID_TOPIC({
      message: `Unknown Administrative File Draft topic '${value}'`,
    });
  }
  return display;
}

export function topicFromDatabase(value: string | null): TopicValue | null {
  if (value === null) return null;
  if (topicNameByValue.has(value as TopicValue)) return value as TopicValue;
  const display = TOPICS[value as TopicName];
  if (display === undefined) {
    throw administrativeFileDraftErrors.INVALID_TOPIC({
      message: `Unknown Administrative File Draft database topic '${value}'`,
    });
  }
  return display;
}
