import { cn } from '@/features/ui/style/cn';
import {
  Fragment,
  createContext,
  createElement,
  useContext,
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
} from './markdownSafety';

type SafeMarkdownProps = {
  children: string;
  className?: string;
  as?: 'article' | 'div';
  hrefMode?: 'remove' | 'escape';
};

type TextRenderOptions = {
  hrefMode: NonNullable<SafeMarkdownProps['hrefMode']>;
  externalUrlTooltip: string;
};

const MarkdownHrefModeContext =
  createContext<TextRenderOptions['hrefMode']>('remove');
const MarkdownExternalUrlTooltipContext = createContext('');

const useTextRenderOptions = (): TextRenderOptions => {
  return {
    hrefMode: useContext(MarkdownHrefModeContext),
    externalUrlTooltip: useContext(MarkdownExternalUrlTooltipContext),
  };
};

const renderTextWithExternalIndicators = (
  text: string,
  options: TextRenderOptions,
) => {
  if (options.hrefMode !== 'escape') {
    return text;
  }

  return renderTextWithExternalUrlIndicators(text, {
    externalUrlTooltip: options.externalUrlTooltip,
  });
};

const renderMarkdownNode = (
  node: ReactNode,
  options: TextRenderOptions,
): ReactNode => {
  if (typeof node === 'string' || typeof node === 'number') {
    return renderTextWithExternalIndicators(String(node), options);
  }

  if (Array.isArray(node)) {
    return node.map((childNode, index) => (
      <Fragment key={index}>{renderMarkdownNode(childNode, options)}</Fragment>
    ));
  }

  return node;
};

const createTextComponent = (tagName: string) => {
  const MarkdownTextComponent = (componentProps: {
    children?: ReactNode;
  }): ReactElement => {
    const options = useTextRenderOptions();

    return createElement(
      tagName,
      undefined,
      renderMarkdownNode(componentProps.children, options),
    );
  };

  return MarkdownTextComponent;
};

const MarkdownAnchor = (componentProps: {
  children?: ReactNode;
  href?: string;
}) => {
  const options = useTextRenderOptions();

  if (options.hrefMode === 'remove') {
    return null;
  }

  return renderEscapedMarkdownAnchor({
    children: componentProps.children,
    href: componentProps.href,
    externalUrlTooltip: options.externalUrlTooltip,
  });
};

const textComponents = Object.fromEntries(
  SAFE_MARKDOWN_ALLOWED_ELEMENTS.map((tagName) => [
    tagName,
    createTextComponent(tagName),
  ]),
);

const markdownComponents = {
  ...textComponents,
  br: () => <br />,
  hr: () => <hr />,
  code: (componentProps) => <code>{componentProps.children}</code>,
  pre: (componentProps) => <pre>{componentProps.children}</pre>,
  a: MarkdownAnchor,
} satisfies Components;

export const SafeMarkdown = (props: SafeMarkdownProps) => {
  const { children, className, as: Root = 'div', hrefMode = 'remove' } = props;
  const { t } = useTranslation('shared');
  const externalUrlTooltip = t('safeMarkdown.externalUrlTooltip');

  return (
    <Root className={cn(className)}>
      <MarkdownHrefModeContext.Provider value={hrefMode}>
        <MarkdownExternalUrlTooltipContext.Provider value={externalUrlTooltip}>
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
        </MarkdownExternalUrlTooltipContext.Provider>
      </MarkdownHrefModeContext.Provider>
    </Root>
  );
};
