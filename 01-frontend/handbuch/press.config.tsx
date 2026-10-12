import type { ComponentProps } from "react";
import { defineConfig } from "fumapress";
import { fumadocsMdx } from "fumapress/adapters/mdx";
import { metaSchema, pageSchema } from "fumapress/adapters/mdx/schema";
import { fumapressTranslations } from "fumapress/i18n";
import { createDocsLayoutPage } from "fumapress/layouts/docs";
import { createRootLayout } from "fumapress/layouts/root";
import { linkValidationPlugin } from "fumapress/plugins/link-validation";
import { oramaSearchPlugin } from "fumapress/plugins/orama-search";
import { defineTranslations } from "fumadocs-core/i18n";
import { defineDocs } from "fumadocs-mdx/macro";
import { ImageZoom } from "fumadocs-ui/components/image-zoom";
import defaultMdxComponents, { createRelativeLink } from "fumadocs-ui/mdx";
import { uiTranslations } from "fumadocs-ui/i18n";
import { ThemeSwitch } from "fumadocs-ui/layouts/shared/slots/theme-switch";
import { FullSearchTrigger } from "fumadocs-ui/layouts/shared/slots/search-trigger";

const docs = defineDocs({
  dir: "../../docs/handbuch",
  docs: {
    files: ["./index.mdx"],
    async: true,
    schema: pageSchema,
  },
  meta: {
    schema: metaSchema,
  },
});

const translations = defineTranslations()
  .extend(uiTranslations())
  .extend(fumapressTranslations())
  .add({
    displayName: "Deutsch",
    "Search(search trigger)": "Handbuch durchsuchen",
    "Search(search dialog)": "Handbuch durchsuchen",
    "Open Search(search trigger)(aria-label)": "Suche öffnen",
    "Close Search(search dialog)(aria-label)": "Suche schließen",
    "No results found(search dialog)": "Keine Ergebnisse gefunden",
    "On this page(table of contents)": "Auf dieser Seite",
    "No Headings(table of contents)": "Keine Überschriften",
    "Table of Contents(inline table of contents)": "Inhaltsverzeichnis",
    "Toggle Theme(theme switcher)(aria-label)": "Farbschema wechseln",
    "Light(theme switcher)(aria-label)": "Helles Farbschema",
    "Dark(theme switcher)(aria-label)": "Dunkles Farbschema",
    "System(theme switcher)(aria-label)": "Systemeinstellung verwenden",
    "Toggle Menu(home layout header)(aria-label)": "Menü umschalten",
    "Open Sidebar(aria-label)": "Navigation öffnen",
    "Close Sidebar(aria-label)": "Navigation schließen",
    "Open Sidebar(sidebar)(aria-label)": "Seitennavigation öffnen",
    "Close Sidebar(sidebar)(aria-label)": "Seitennavigation schließen",
    "Collapse Sidebar(sidebar)(aria-label)": "Seitennavigation einklappen",
    "Show Sidebar(sidebar)": "Seitennavigation anzeigen",
    "Hide Sidebar(sidebar)": "Seitennavigation ausblenden",
    "Copy Anchor Link(heading anchor)(aria-label)": "Abschnittslink kopieren",
    "Open(page actions)": "Öffnen",
    "Previous Page(pagination)": "Vorherige Seite",
    "Next Page(pagination)": "Nächste Seite",
    "Page Not Found(404 not found page)": "Seite nicht gefunden",
    "Back to Home(404 not found page)": "Zurück zum Handbuch",
    "The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.(404 not found page)":
      "Die gesuchte Seite wurde möglicherweise entfernt, umbenannt oder ist vorübergehend nicht verfügbar.",
  });

const RootLayout = createRootLayout();
const HandbookLayout = createDocsLayoutPage({
  render() {
    return {
      lastModified: null,
      layoutProps: {
        sidebar: { enabled: false },
      },
      pageProps: {
        breadcrumb: { enabled: false },
        footer: { enabled: false },
        tableOfContent: { enabled: true, style: "normal" },
        tableOfContentPopover: {
          enabled: true,
          style: "normal",
          trigger: { "aria-label": "Inhaltsverzeichnis öffnen" },
          header: (
            <p className="px-1 pb-2 text-sm font-medium text-fd-foreground">
              Auf dieser Seite
            </p>
          ),
        },
      },
    };
  },
});

function HandbookImage(props: ComponentProps<"img">) {
  const source = typeof props.src === "string" ? props.src : "";
  const figureNumber = /abbildung-(\d{2})/.exec(source)?.[1];
  const figure = figureNumber ? Number(figureNumber) : undefined;
  const dimensions =
    figure === 1
      ? { width: 936, height: 369 }
      : figure === 2
        ? { width: 895, height: 330 }
        : figure === 3
          ? { width: 1388, height: 714 }
          : figure === 4
            ? { width: 1386, height: 710 }
            : figure === 30
              ? { width: 1920, height: 1128 }
              : figure
                ? { width: 1920, height: 1200 }
                : undefined;

  return (
    <span
      id={figure ? `abbildung-${figure}` : undefined}
      className="handbook-figure"
    >
      <ImageZoom
        {...props}
        width={dimensions?.width}
        height={dimensions?.height}
        loading={props.loading ?? "lazy"}
      />
    </span>
  );
}

function stripTocDirective(value: string | undefined) {
  return value?.replace(/\s*\[!toc\]\s*/g, " ").trim();
}

export default defineConfig({
  mode: "static",
  preset: false,
  content: docs.toFumadocsSource(),
  site: {
    name: "SPARK Workflow Benutzerhandbuch",
  },
  meta: {
    root() {
      return <link rel="icon" href={`${import.meta.env.BASE_URL}favicon.svg`} type="image/svg+xml" />;
    },
  },
  translations,
  defaultLayoutProps: {
    nav: {
      title: (
        <span className="spark-brand">
          <img
            className="spark-brand__logo spark-brand__logo--light"
            src={`${import.meta.env.BASE_URL}SPARK_Workflow_Logo_01.svg`}
            alt="SPARK Workflow"
            width={940}
            height={132}
          />
          <img
            className="spark-brand__logo spark-brand__logo--dark"
            src={`${import.meta.env.BASE_URL}SPARK_Workflow_Logo_03.svg`}
            alt="SPARK Workflow"
            width={940}
            height={132}
          />
          <span className="spark-brand__label">Benutzerhandbuch</span>
        </span>
      ),
      children: (
        <span className="spark-header-actions">
          <FullSearchTrigger
            className="spark-search-bar"
            hideIfDisabled
          />
          <ThemeSwitch mode="light-dark-system" />
        </span>
      ),
      url: "/",
      transparentMode: "none",
    },
    searchToggle: { enabled: false },
  },
  renderRoot(options) {
    return <RootLayout {...options} lang="de" />;
  },
  renderPage(options) {
    return <HandbookLayout {...options} lang="de" />;
  },
})
  .adapters(
    fumadocsMdx({
      async getMdxComponents(page) {
        return {
          ...defaultMdxComponents,
          a: createRelativeLink(await this.getLoader(), page),
          img: HandbookImage,
        };
      },
    }),
  )
  .plugins(
    oramaSearchPlugin({
      async buildIndex(page) {
        for (const adapter of this.adapters) {
          const data = await adapter["core:get-structured-data"]?.call(this, page);

          if (data) {
            return {
              id: page.url,
              title: page.data.title ?? page.path,
              description: page.data.description,
              url: page.url,
              structuredData: {
                headings: data.headings.map((heading) => ({
                  ...heading,
                  content: stripTocDirective(heading.content) ?? "",
                })),
                contents: data.contents.map((content) => ({
                  ...content,
                  heading: stripTocDirective(content.heading),
                  content: stripTocDirective(content.content) ?? "",
                })),
              },
            };
          }
        }

        throw new Error("Für die Handbuchsuche konnten keine strukturierten Daten erzeugt werden.");
      },
    }),
    linkValidationPlugin({ report: "both" }),
  );
