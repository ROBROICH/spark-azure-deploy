import {
  Fragment,
  createElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  SAFE_MARKDOWN_ALLOWED_ELEMENTS,
  renderEscapedMarkdownAnchor,
  renderTextWithExternalUrlIndicators,
} from '@/features/ui/safe-markdown/markdownSafety';
import type {
  ClickedInjectReference,
  InjectReferenceMap,
} from './InjectReferenceLinks';

type ReferenceMarkdownRenderContext = {
  isInsideLink: boolean;
  isInsideCode: boolean;
};

type ReferenceMarkdownOptions = {
  externalUrlTooltip: string;
  references: InjectReferenceMap;
  onReferenceClick: (clickedReference: ClickedInjectReference) => void;
};

type ReferenceMarkdownProps = {
  children: string;
  references: InjectReferenceMap;
  onReferenceClick: (clickedReference: ClickedInjectReference) => void;
};

const REFERENCE_TOKEN_PATTERN = /\[(\d+)\]/g;

const DEFAULT_RENDER_CONTEXT = {
  isInsideLink: false,
  isInsideCode: false,
} satisfies ReferenceMarkdownRenderContext;
const LINK_RENDER_CONTEXT = {
  isInsideLink: true,
  isInsideCode: false,
} satisfies ReferenceMarkdownRenderContext;
const CODE_RENDER_CONTEXT = {
  isInsideLink: false,
  isInsideCode: true,
} satisfies ReferenceMarkdownRenderContext;

const renderReferenceTextSegment = (
  text: string,
  options: ReferenceMarkdownOptions,
) => {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(REFERENCE_TOKEN_PATTERN)) {
    const referenceId = match[1] ?? '';
    const rawReferenceToken = `[${referenceId}]`;
    const startIndex = match.index;
    const matchedReferenceToken = match[0];

    if (startIndex > lastIndex) {
      nodes.push(text.slice(lastIndex, startIndex));
    }

    const reference = options.references[referenceId];
    if (!reference) {
      nodes.push(rawReferenceToken);
      lastIndex = startIndex + matchedReferenceToken.length;
      continue;
    }

    nodes.push(
      <button
        key={`reference-${referenceId}-${startIndex}`}
        type="button"
        className="focus-ring inline rounded-[2px] text-[13px] leading-[18px] font-semibold tracking-[-0.13px] text-purple-600 transition-colors hover:text-purple-700"
        aria-label={`${rawReferenceToken} ${reference.title}`}
        onClick={() =>
          options.onReferenceClick({
            ...reference,
            referenceId,
          })
        }
      >
        {rawReferenceToken}
      </button>,
    );
    lastIndex = startIndex + matchedReferenceToken.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length === 0 ? text : nodes;
};

const renderReferenceMarkdownText = (
  text: string,
  context: ReferenceMarkdownRenderContext,
  options: ReferenceMarkdownOptions,
): ReactNode => {
  if (context.isInsideLink || context.isInsideCode) {
    return text;
  }

  return renderTextWithExternalUrlIndicators(text, {
    externalUrlTooltip: options.externalUrlTooltip,
    renderTextSegment: (textSegment) =>
      renderReferenceTextSegment(textSegment, options),
  });
};

const renderReferenceMarkdownNode = (
  node: ReactNode,
  context: ReferenceMarkdownRenderContext,
  options: ReferenceMarkdownOptions,
): ReactNode => {
  if (typeof node === 'string' || typeof node === 'number') {
    return renderReferenceMarkdownText(String(node), context, options);
  }

  if (Array.isArray(node)) {
    return node.map((childNode, index) => (
      <Fragment key={index}>
        {renderReferenceMarkdownNode(childNode, context, options)}
      </Fragment>
    ));
  }

  return node;
};

const createReferenceTextComponent = (
  tagName: string,
  options: ReferenceMarkdownOptions,
) => {
  const ReferenceTextComponent = (componentProps: {
    children?: ReactNode;
  }): ReactElement => {
    return createElement(
      tagName,
      undefined,
      renderReferenceMarkdownNode(
        componentProps.children,
        DEFAULT_RENDER_CONTEXT,
        options,
      ),
    );
  };

  return ReferenceTextComponent;
};

const createReferenceAnchorComponent = (options: ReferenceMarkdownOptions) => {
  const ReferenceAnchor = (componentProps: {
    children?: ReactNode;
    href?: string;
  }) => {
    return renderEscapedMarkdownAnchor({
      children: componentProps.children,
      href: componentProps.href,
      externalUrlTooltip: options.externalUrlTooltip,
      renderChildren: (children) =>
        renderReferenceMarkdownNode(children, LINK_RENDER_CONTEXT, options),
    });
  };

  return ReferenceAnchor;
};

const createReferenceMarkdownComponents = (
  options: ReferenceMarkdownOptions,
): Components => {
  const textComponents = Object.fromEntries(
    SAFE_MARKDOWN_ALLOWED_ELEMENTS.map((tagName) => [
      tagName,
      createReferenceTextComponent(tagName, options),
    ]),
  );

  return {
    ...textComponents,
    br: () => <br />,
    hr: () => <hr />,
    code: (componentProps) => (
      <code>
        {renderReferenceMarkdownNode(
          componentProps.children,
          CODE_RENDER_CONTEXT,
          options,
        )}
      </code>
    ),
    pre: (componentProps) => (
      <pre>
        {renderReferenceMarkdownNode(
          componentProps.children,
          CODE_RENDER_CONTEXT,
          options,
        )}
      </pre>
    ),
    a: createReferenceAnchorComponent(options),
  } satisfies Components;
};

export const ReferenceMarkdown = (props: ReferenceMarkdownProps) => {
  const { children, references, onReferenceClick } = props;
  const { t } = useTranslation('shared');
  const markdownComponents = createReferenceMarkdownComponents({
    externalUrlTooltip: t('safeMarkdown.externalUrlTooltip'),
    references,
    onReferenceClick,
  });

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      allowedElements={[...SAFE_MARKDOWN_ALLOWED_ELEMENTS]}
      components={markdownComponents}
      skipHtml
      unwrapDisallowed
      urlTransform={(url) => url}
    >
      {children}
    </ReactMarkdown>
  );
};
