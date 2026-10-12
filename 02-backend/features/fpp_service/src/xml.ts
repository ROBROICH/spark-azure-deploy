import { SaxesParser } from "saxes";

const FPP_NAMESPACE = "http://www.lucom.com/ffw/xml-data-1.0.xsd";
const unsafeXml = /<!DOCTYPE|<!ENTITY/i;

const stateNames = {
  "01": "Baden-Württemberg",
  "02": "Bayern",
  "03": "Berlin",
  "04": "Brandenburg",
  "05": "Bremen",
  "06": "Hamburg",
  "07": "Hessen",
  "08": "Mecklenburg-Vorpommern",
  "09": "Niedersachsen",
  "10": "Nordrhein-Westfalen",
  "11": "Rheinland-Pfalz",
  "12": "Saarland",
  "13": "Sachsen",
  "14": "Sachsen-Anhalt",
  "15": "Schleswig-Holstein",
  "16": "Thüringen",
} as const;

export type FppState = (typeof stateNames)[keyof typeof stateNames];

interface XmlElement {
  readonly localName: string;
  readonly namespaceUri: string;
  id?: string;
  readonly children: XmlElement[];
  text: string;
}

export interface ParsedFppXml {
  readonly entryDate: string;
  readonly state: string | null;
  readonly primaryState: FppState | null;
  readonly company: string | null;
  readonly addressCombined: string | null;
  readonly street: string | null;
  readonly houseNumber: string | null;
  readonly plz: string | null;
  readonly location: string | null;
  readonly country: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly fax: string | null;
}

interface StreetAndNumber {
  street: string | null;
  houseNumber: string | null;
}

function parseXml(xml: string): XmlElement {
  if (unsafeXml.test(xml)) throw new Error("Unsafe XML input detected");

  let root: XmlElement | undefined;
  const stack: XmlElement[] = [];
  const parser = new SaxesParser({ xmlns: true });
  parser.on("opentag", (tag) => {
    const id = (Object.values(tag.attributes) as Array<{ local: string; value: string }>).find(
      (attribute) => attribute.local === "id",
    )?.value;
    const element: XmlElement = {
      localName: tag.local,
      namespaceUri: tag.uri,
      children: [],
      text: "",
    };
    if (id !== undefined) element.id = id;
    const parent = stack.at(-1);
    if (parent === undefined) root = element;
    else parent.children.push(element);
    stack.push(element);
  });
  const appendText = (text: string): void => {
    const current = stack.at(-1);
    if (current !== undefined) current.text += text;
  };
  parser.on("text", appendText);
  parser.on("cdata", appendText);
  parser.on("closetag", () => {
    stack.pop();
  });

  try {
    parser.write(xml).close();
  } catch {
    throw new Error("Invalid XML failed to parse");
  }
  if (root === undefined) throw new Error("Invalid XML failed to parse");
  return root;
}

function* descendants(element: XmlElement): Generator<XmlElement> {
  for (const child of element.children) {
    yield child;
    yield* descendants(child);
  }
}

const allElements = (root: XmlElement): XmlElement[] => [root, ...descendants(root)];

function elementValue(root: XmlElement, id: string): string | null {
  const elements = allElements(root);
  const namespaced = elements.find(
    (element) => element.namespaceUri === FPP_NAMESPACE && element.id === id,
  );
  const element = namespaced ?? elements.find((candidate) => candidate.id === id);
  const value = element?.text.trim();
  return value ? value : null;
}

function parseEntryDate(value: string | null): string | null {
  if (value === null || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  if (!Number.isFinite(Date.parse(value))) return null;

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const calendarDate = new Date(0);
  calendarDate.setUTCHours(0, 0, 0, 0);
  calendarDate.setUTCFullYear(year!, month! - 1, day!);
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month! - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    return null;
  }
  return value.slice(0, 10);
}

function parseStreetAndNumber(combined: string | null): StreetAndNumber {
  if (!combined) return { street: null, houseNumber: null };
  if (combined.length > 500) return { street: combined.slice(0, 500).trim(), houseNumber: null };
  const match = /^(.*\S)\s+(\d+[a-zA-Z]?(?:-\d+[a-zA-Z]?)?)$/.exec(combined.trim());
  return match
    ? { street: match[1]!.trim(), houseNumber: match[2]!.trim() }
    : { street: combined.trim(), houseNumber: null };
}

function extractStates(root: XmlElement): readonly FppState[] {
  const states = new Set<FppState>();
  for (const dataset of allElements(root).filter(
    (element) => element.id === "Linked_Gebiet" || element.id === "Linked_Gebiet_Antrag",
  )) {
    const field = dataset.id === "Linked_Gebiet" ? "gebiet_bundesland" : "gebiet_bundesland_antrag";
    for (const element of descendants(dataset)) {
      if (element.id !== field) continue;
      const state = stateNames[element.text.trim() as keyof typeof stateNames];
      if (state !== undefined) states.add(state);
    }
  }
  return [...states].sort();
}

export function parseFppXml(xml: string): ParsedFppXml {
  const root = parseXml(xml);
  const value = (id: string) => elementValue(root, id);
  const entryDate = parseEntryDate(value("creationDate"));
  if (entryDate === null) {
    throw new Error("Missing required fields in XML: entry_date (creationDate)");
  }

  const representativeCompany = value("vertreter_org_name");
  const company = representativeCompany ?? value("tdv_firma");
  const country = representativeCompany
    ? value("vertreter_anschrift_land")
    : value("tdv_anschrift_land");
  const combinedStreet = representativeCompany
    ? value("vertreter_anschrift_hausnummer")
    : value("tdv_anschrift_strasse_hausnummer");
  const { street, houseNumber } = parseStreetAndNumber(combinedStreet);
  const states = extractStates(root);

  const representativeEmail = value("org_vertreter_np_mailadresse");
  const representativePhone = value("vertreter_np_telefonnummer");
  const hasRepresentativeContact = representativeEmail !== null || representativePhone !== null;
  let email = hasRepresentativeContact ? representativeEmail : value("projektleiter-email");
  let phone = hasRepresentativeContact ? representativePhone : value("projektleiter-telefon");
  email ??= value("ap_kontakt_email");
  phone ??= value("ap_kontakt_telefon");

  return {
    entryDate,
    state: states.length === 0 ? null : states.join(", "),
    primaryState: states[0] ?? null,
    company,
    addressCombined: representativeCompany
      ? value("vertreter_anschrift_zusatz")
      : value("tdv_anschrift_zusatz"),
    street,
    houseNumber,
    plz: representativeCompany
      ? value("vertreter_anschrift_postleitzahl")
      : value("tdv_anschrift_postleitzahl"),
    location: representativeCompany ? value("vertreter_anschrift_ort") : value("tdv_anschrift_ort"),
    country,
    email,
    phone,
    fax: value("projektleiter-fax"),
  };
}
