import { Fragment } from 'react';
import { ReferenceMarkdown } from './ReferenceMarkdown';

export type InjectReference = {
  documentId: string;
  node_id: string;
  title: string;
  chunkIds: string[];
  pageNumbers: number[];
};

export type InjectReferenceMap = Partial<Record<string, InjectReference>>;

export type ClickedInjectReference = InjectReference & {
  referenceId: string;
};

type InjectReferenceLinksProps = {
  references: InjectReferenceMap;
  text: string;
  onReferenceClick: (clickedReference: ClickedInjectReference) => void;
  format?: 'markdown' | 'text';
};

const MARKDOWN_SPECIAL_CHARACTER_PATTERN = /([\\`*_{}[\]<>()#+!|])/g;

const escapeMarkdown = (text: string) => {
  return text.replaceAll(MARKDOWN_SPECIAL_CHARACTER_PATTERN, '\\$1');
};

export const InjectReferenceLinks = (props: InjectReferenceLinksProps) => {
  const { references, text, onReferenceClick, format = 'markdown' } = props;
  const markdownText = format === 'text' ? escapeMarkdown(text) : text;

  return (
    <Fragment>
      <ReferenceMarkdown
        references={references}
        onReferenceClick={onReferenceClick}
      >
        {markdownText}
      </ReferenceMarkdown>
    </Fragment>
  );
};
