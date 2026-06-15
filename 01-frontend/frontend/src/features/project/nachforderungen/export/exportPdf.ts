import type { Editor } from '@tiptap/react';

const PRINT_STYLES = `
  @page { size: A4; margin: 20mm; }
  body { font-family: Arial, sans-serif; color: #1a1a1a; font-size: 11pt; line-height: 1.5; }
  h1 { font-size: 18pt; font-weight: 700; margin: 0 0 12pt; }
  h2 { font-size: 14pt; font-weight: 600; margin: 12pt 0 6pt; }
  h3 { font-size: 12pt; font-weight: 600; margin: 8pt 0 6pt; }
  p  { margin: 0 0 6pt; }
  ul { margin: 0 0 6pt; padding-left: 20pt; }
  ol { margin: 0 0 6pt; padding-left: 20pt; }
  li { margin-bottom: 3pt; }
  section { margin: 0; }
`;

/**
 * Strips script tags and event handler attributes from a DOM tree
 * to prevent script execution in the print window.
 */
const removeEventHandlerAttributes = (element: Element): void => {
  for (const attr of Array.from(element.attributes)) {
    if (attr.name.startsWith('on')) {
      element.removeAttribute(attr.name);
    }
  }
};

const removeJavascriptHref = (element: Element): void => {
  if (
    element.hasAttribute('href') &&
    element
      .getAttribute('href')
      ?.trimStart()
      .toLowerCase()
      .startsWith('javascript:')
  ) {
    element.removeAttribute('href');
  }
};

const sanitizeNode = (root: Element): void => {
  for (const script of Array.from(root.querySelectorAll('script'))) {
    script.remove();
  }
  for (const el of Array.from(root.querySelectorAll('*'))) {
    removeEventHandlerAttributes(el);
    removeJavascriptHref(el);
  }
};

export const exportPdf = (
  editor: Editor,
  title: string,
  language: string,
): void => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    return;
  }

  // Sever opener reference so the popup cannot reach the parent window
  printWindow.opener = null;

  const doc = printWindow.document;
  doc.open();
  doc.close();

  doc.documentElement.setAttribute('lang', language || 'de');

  const meta = doc.createElement('meta');
  meta.setAttribute('charset', 'utf-8');
  doc.head.appendChild(meta);

  const titleEl = doc.createElement('title');
  titleEl.textContent = title;
  doc.head.appendChild(titleEl);

  const style = doc.createElement('style');
  style.textContent = PRINT_STYLES;
  doc.head.appendChild(style);

  // Parse editor HTML through DOMParser and sanitize before injecting
  const parser = new DOMParser();
  const parsed = parser.parseFromString(editor.getHTML(), 'text/html');
  sanitizeNode(parsed.body);

  // Move sanitized nodes into the print window body
  while (parsed.body.firstChild) {
    doc.body.appendChild(doc.adoptNode(parsed.body.firstChild));
  }

  printWindow.addEventListener('afterprint', () => printWindow.close());
  printWindow.print();
};
