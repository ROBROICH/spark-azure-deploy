import { sql, type SQLWrapper } from "drizzle-orm";

export const searchContains = (value: SQLWrapper, query: string | undefined) => {
  const search = query?.trim().toLocaleLowerCase("de-DE").replaceAll("ß", "ss");
  if (!search) return undefined;

  const baseQuery = search.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const germanQuery = search
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const asciiQuery = germanQuery.replace(/(a|o|u)e/g, "$1");
  const base = sql`regexp_replace(normalize(replace(lower(${value}), 'ß', 'ss'), NFD), ${"[\u0300-\u036f]"}, '', 'g')`;
  const german = sql`regexp_replace(normalize(replace(replace(replace(replace(lower(${value}), 'ß', 'ss'), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), NFD), ${"[\u0300-\u036f]"}, '', 'g')`;
  const ascii = sql`regexp_replace(${german}, '(a|o|u)e', ${"\\1"}, 'g')`;

  return sql<boolean>`(strpos(${base}, ${baseQuery}) > 0 or strpos(${german}, ${germanQuery}) > 0 or strpos(${ascii}, ${asciiQuery}) > 0)`;
};
