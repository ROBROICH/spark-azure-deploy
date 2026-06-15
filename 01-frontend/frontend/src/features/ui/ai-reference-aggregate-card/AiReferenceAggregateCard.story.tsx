import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { AiReferenceAggregateCard } from './AiReferenceAggregateCard';
import type { AiReferenceAggregateCardRow } from './AiReferenceAggregateCard';

const rows: AiReferenceAggregateCardRow[] = [
  {
    ariaLabel: 'Dokument, Seite 7',
    id: 'reference-1',
    meta: 'S. 7',
    title: 'Dokument',
  },
  {
    ariaLabel: 'Dokument, Seite 7',
    id: 'reference-2',
    meta: 'S. 7',
    title: 'Dokument',
  },
  {
    ariaLabel: 'Dokument, Seite 7',
    id: 'reference-3',
    meta: 'S. 7',
    title: 'Dokument',
  },
];

const longRows: AiReferenceAggregateCardRow[] = [
  ...rows,
  {
    ariaLabel: 'Dokument, Seite 7',
    id: 'reference-4',
    meta: 'S. 7',
    title: 'Dokument',
  },
  {
    ariaLabel: 'Dokument, Seite 7',
    id: 'reference-5',
    meta: 'S. 7',
    title: 'Dokument',
  },
];

const selectedRows: AiReferenceAggregateCardRow[] = rows.map((row) =>
  row.id === 'reference-2' ? { ...row, isSelected: true } : row,
);

const showMoreButton = (
  <button
    type="button"
    className="focus-ring rounded-[4px] px-2 py-[5px] text-[11px] leading-[14px] font-medium tracking-[0.02em] text-slate-700 hover:text-slate-900"
  >
    339 mehr anzeigen
  </button>
);

export const AiReferenceAggregateCardStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="AI Reference Aggregate Card"
      description="Neutral aggregate reference card for Materielle Vollständigkeitsprüfung AI Fundstellen groups."
    >
      <Story.Section title="Variants">
        <div className="grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-2">
          <AiReferenceAggregateCard
            title="§ 44 Vorschriften für besonders geschützte und bestimmte andere Tier- und Pflanzenarten"
            rows={rows}
          />
          <AiReferenceAggregateCard title="Dokumente" rows={rows} />
          <AiReferenceAggregateCard
            title="§ 44 Vorschriften für besonders geschützte und bestimmte andere Tier- und Pflanzenarten"
            isOutdated
            outdatedLabel="Veraltet"
            rows={longRows}
            showMoreControl={showMoreButton}
            action={{
              label: 'Aktualisieren',
              onClick: () => undefined,
            }}
          />
          <AiReferenceAggregateCard
            title="Beispieldokument 05.pdf"
            isOutdated
            outdatedLabel="Veraltet"
            rows={longRows}
            showMoreControl={showMoreButton}
          />
          <AiReferenceAggregateCard
            title="Ausgewählte Zeile"
            rows={selectedRows}
          />
        </div>
        <div className="w-[260px]">
          <AiReferenceAggregateCard
            title="§ 44 Vorschriften für besonders geschützte und bestimmte andere Tier- und Pflanzenarten"
            isOutdated
            outdatedLabel="Veraltet"
            rows={longRows}
            showMoreControl={showMoreButton}
            action={{
              label: 'Aktualisieren',
              onClick: () => undefined,
            }}
          />
        </div>
      </Story.Section>
    </Story>
  );
};

AiReferenceAggregateCardStory.storyTitle = 'AI Reference Aggregate Card';
