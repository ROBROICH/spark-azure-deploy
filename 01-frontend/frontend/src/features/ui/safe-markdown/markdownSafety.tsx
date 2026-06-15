import { TooltipWrapper } from '@/features/ui/tooltip/TooltipWrapper';
import { ExternalLink } from 'lucide-react';
import { Fragment, isValidElement, type ReactNode } from 'react';

export const SAFE_MARKDOWN_ALLOWED_ELEMENTS =
  'p strong em ul ol li h1 h2 h3 h4 h5 h6 table thead tbody tr th td blockquote br hr code pre a'.split(
    ' ',
  );

const RAW_HTTP_URL_PATTERN = /https?:\/\/[^\s<>()]+/gi;
const SAFE_PRINTABLE_HREF_PATTERN =
  /^(https?:\/\/|#|\/(?!\/)|\.{1,2}\/)[^\s]*$/i;

type RenderTextSegment = (text: string) => ReactNode;

const ExternalUrlIndicator = (props: { tooltip: string }) => {
  const { tooltip } = props;

  return (
    <TooltipWrapper content={tooltip}>
      <span
        aria-label={tooltip}
        role="img"
        className="mx-0.5 inline-flex align-[-0.125em] text-text-secondary"
      >
        <ExternalLink aria-hidden="true" className="size-3" strokeWidth={2} />
      </span>
    </TooltipWrapper>
  );
};

export const renderTextWithExternalUrlIndicators = (
  text: string,
  options: {
    externalUrlTooltip: string;
    renderTextSegment?: RenderTextSegment;
  },
) => {
  const renderTextSegment = options.renderTextSegment ?? ((segment) => segment);
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(RAW_HTTP_URL_PATTERN)) {
    const url = match[0];
    const startIndex = match.index;

    if (startIndex > lastIndex) {
      nodes.push(
        <Fragment key={`text-${lastIndex}`}>
          {renderTextSegment(text.slice(lastIndex, startIndex))}
        </Fragment>,
      );
    }

    nodes.push(
      <Fragment key={`url-${startIndex}`}>
        {renderTextSegment(url)}
        <ExternalUrlIndicator tooltip={options.externalUrlTooltip} />
      </Fragment>,
    );
    lastIndex = startIndex + url.length;
  }

  if (lastIndex < text.length) {
    nodes.push(
      <Fragment key={`text-${lastIndex}`}>
        {renderTextSegment(text.slice(lastIndex))}
      </Fragment>,
    );
  }

  if (nodes.length === 0) {
    return renderTextSegment(text);
  }

  return nodes;
};

/**
 * Recursively extracts visible text from rendered markdown children.
 *
 * @param node Rendered markdown child node to inspect.
 * @returns Plain text content in render order.
 */
const getPlainText = (node: ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getPlainText).join('');
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return getPlainText(node.props.children);
  }

  return '';
};

const hasControlCharacter = (value: string) => {
  return Array.from(value).some(
    (character) => (character.codePointAt(0) ?? 0) <= 31,
  );
};

const getPrintableHref = (href: string | undefined) => {
  const trimmedHref = href?.trim();

  if (!trimmedHref || hasControlCharacter(trimmedHref)) {
    return null;
  }

  if (SAFE_PRINTABLE_HREF_PATTERN.test(trimmedHref)) {
    return trimmedHref;
  }

  return null;
};

const isExternalHttpUrl = (href: string) => /^https?:\/\//i.test(href);

export const renderEscapedMarkdownAnchor = (props: {
  children?: ReactNode;
  href?: string;
  externalUrlTooltip: string;
  renderChildren?: (children: ReactNode) => ReactNode;
}) => {
  const printableHref = getPrintableHref(props.href);
  const labelText = getPlainText(props.children).trim();
  const shouldPrintHref = printableHref !== null && labelText !== printableHref;
  const children = props.renderChildren
    ? props.renderChildren(props.children)
    : props.children;

  return (
    <span>
      {children}
      {shouldPrintHref ? ` (${printableHref})` : null}
      {printableHref !== null && isExternalHttpUrl(printableHref) ? (
        <ExternalUrlIndicator tooltip={props.externalUrlTooltip} />
      ) : null}
    </span>
  );
};
