import { useState } from 'react';
import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import {
  InjectReferenceLinks,
  type ClickedInjectReference,
  type InjectReferenceMap,
} from './InjectReferenceLinks';

const storyReferences: InjectReferenceMap = {
  '0001': {
    document_id: 'dummy-doc-001',
    node_id: '3710d48d-ceb8-5ef4-9bdc-596941adc39b',
    title: 'Beispieldokument A',
    chunk_ids: ['chunk-0001'],
    page_numbers: [5, 7],
  },
  '0002': {
    document_id: 'dummy-doc-001',
    node_id: '9d41a997-a4c8-59d9-913b-d054a0a43202',
    title: 'Bearbeiter:',
    chunk_ids: ['chunk-0002'],
    page_numbers: [11],
  },
  '0064': {
    document_id: 'dummy-doc-002',
    node_id: '0064-node',
    title: 'Beispieldokument B',
    chunk_ids: ['chunk-0064'],
    page_numbers: [42, 44],
  },
};

const markdownExample =
  '**Synthetischer Beispielabschnitt**  \n- Der erste Hinweis verweist auf ein Beispieldokument [0001]  \n- Ein weiterer neutraler Hinweis verweist auf eine zweite Quelle [0064]  \n- Der abschließende Satz bleibt bewusst allgemein [0064]';

export const InjectReferenceLinksStory: StoryComponentType = (props) => {
  const { id } = props;
  const [lastClickedReference, setLastClickedReference] =
    useState<ClickedInjectReference | null>(null);

  return (
    <Story
      id={id}
      title="Inject Reference Links"
      description="Renders plain text or markdown and turns matching [0001]-style references into clickable links."
    >
      <Story.Section
        title="Plain Text"
        contentClassName="flex-col items-stretch"
      >
        <div className="max-w-[48rem] rounded-[8px] border border-slate-200 bg-slate-50 p-4 text-[13px] leading-[18px] text-slate-700">
          <InjectReferenceLinks
            references={storyReferences}
            text="Dieser synthetische Beispieltext enthält zwei Referenzen [0001] [0002]"
            onReferenceClick={setLastClickedReference}
          />
        </div>
      </Story.Section>

      <Story.Section title="Markdown" contentClassName="flex-col items-stretch">
        <article className="max-w-[48rem] rounded-[8px] border border-slate-200 bg-white p-4 text-[13px] leading-[18px] text-brand-950 [&_code]:rounded-md [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_em]:italic [&_li]:ml-4 [&_li]:list-disc [&_ol]:mb-4 [&_ol]:space-y-1 [&_ol]:pl-5 [&_p]:mb-4 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:mb-4 [&_ul]:space-y-1 [&_ul]:pl-5">
          <InjectReferenceLinks
            references={storyReferences}
            text={markdownExample}
            onReferenceClick={setLastClickedReference}
          />
        </article>
      </Story.Section>

      <Story.Section
        title="Last Click"
        contentClassName="flex-col items-stretch"
      >
        <pre className="max-w-[48rem] overflow-x-auto rounded-[8px] border border-slate-200 bg-slate-950 p-4 text-[12px] leading-[18px] text-slate-100">
          {lastClickedReference === null
            ? 'null'
            : JSON.stringify(lastClickedReference, null, 2)}
        </pre>
      </Story.Section>
    </Story>
  );
};

InjectReferenceLinksStory.storyTitle = 'Inject Reference Links';
