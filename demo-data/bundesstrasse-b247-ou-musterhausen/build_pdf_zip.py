"""Render the test-case Markdown documents (dokumente/*.md) to PDF and bundle them in a ZIP.

The frontend "Verfahren anlegen" upload expects a ZIP of PDF files. This script regenerates
both the per-document PDFs (dokumente-pdf/) and the upload ZIP from the Markdown sources, so
the `.md` files stay the single source of truth.

Run (no project venv changes; Chromium downloaded on first use):

    uv run --no-sync --with markdown python build_pdf_zip.py
    # one-time, if Chromium is missing:
    uv run --no-sync playwright install chromium

Requires: `markdown` (use --with markdown) and `playwright` (already a workspace dependency).
"""

import sys
import zipfile
from pathlib import Path

import markdown
from playwright.sync_api import sync_playwright

CASE = Path(__file__).resolve().parent
SRC = CASE / "dokumente"
OUT = CASE / "dokumente-pdf"
ZIP_PATH = CASE / "B247-OU-Musterhausen_Planunterlagen.zip"

CSS = """
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body { font-family: 'Segoe UI', 'Arial', sans-serif; font-size: 10.5pt; line-height: 1.45;
       color: #1a1a1a; }
h1 { font-size: 18pt; border-bottom: 2px solid #2b2b6b; padding-bottom: 4px; }
h2 { font-size: 14pt; color: #2b2b6b; margin-top: 18px; }
h3 { font-size: 12pt; color: #333; margin-top: 14px; }
table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 9.5pt; }
th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; }
th { background: #eef0f7; }
blockquote { border-left: 3px solid #b0b0c8; margin: 10px 0; padding: 4px 12px; color: #555;
             background: #f7f7fb; font-size: 9.5pt; }
code { font-family: 'Consolas', monospace; background: #f0f0f0; padding: 1px 3px; border-radius: 3px; }
hr { border: none; border-top: 1px solid #ccc; margin: 16px 0; }
"""

HTML_TMPL = """<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
<style>{css}</style></head><body>{body}</body></html>"""


def md_to_html(md_text: str) -> str:
    body = markdown.markdown(
        md_text,
        extensions=["tables", "fenced_code", "sane_lists", "attr_list"],
        output_format="html5",
    )
    return HTML_TMPL.format(css=CSS, body=body)


def main() -> int:
    OUT.mkdir(exist_ok=True)
    md_files = sorted(SRC.glob("*.md"))
    if not md_files:
        print("No markdown files found in", SRC)
        return 1

    pdf_paths: list[Path] = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        for md in md_files:
            html = md_to_html(md.read_text(encoding="utf-8"))
            pdf_path = OUT / (md.stem + ".pdf")
            page.set_content(html, wait_until="load")
            page.pdf(
                path=str(pdf_path),
                format="A4",
                print_background=True,
                margin={"top": "18mm", "bottom": "18mm", "left": "16mm", "right": "16mm"},
            )
            pdf_paths.append(pdf_path)
            print(f"PDF   {pdf_path.name}  ({pdf_path.stat().st_size // 1024} KB)")
        browser.close()

    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as zf:
        for pdf in pdf_paths:
            zf.write(pdf, arcname=pdf.name)
    print(f"\nZIP   {ZIP_PATH.name}  ({ZIP_PATH.stat().st_size // 1024} KB, {len(pdf_paths)} PDFs)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
