import { Button } from '@/features/ui/button/Button';
import { MoreVertical, TriangleAlert } from 'lucide-react';
import type { StoryComponentType } from '../../story/Story';
import { Story } from '../../story/Story';
import { AiNormCard } from './AiNormCard';

const MenuButton = () => {
  return (
    <Button
      type="button"
      variant="ghost-light"
      size="xs"
      iconOnly
      aria-label="Weitere Aktionen"
    >
      <MoreVertical className="size-4" aria-hidden="true" />
    </Button>
  );
};

const defaultReviewAction = {
  checkedLabel: 'Geprüft',
  recheckLabel: 'Erneut prüfen',
  status: 'unchecked',
  uncheckedLabel: 'Prüfen',
  onClick: () => undefined,
} as const;

const LawChangeButton = () => {
  return (
    <button
      type="button"
      aria-label="Rechtsänderung anzeigen"
      className="focus-ring shrink-0 rounded-[4px] border-[0.5px] border-red-600 bg-red-50 p-1 text-red-800"
    >
      <TriangleAlert aria-hidden="true" className="size-4" />
    </button>
  );
};

/** Renders the AI norm card states in the local design system. */
export const AiNormCardStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="AI Norm Card"
      description="Norm card with AI header affordance and Prüfen, Erneut prüfen, and Geprüft actions."
    >
      <Story.Section
        title="Interaction states"
        contentClassName="grid w-full grid-cols-[repeat(auto-fit,minmax(260px,1fr))] items-start gap-3"
      >
        <AiNormCard
          title="§ 17 Verfahren; Ermächtigung zum Erlass von Rechtsverordnungen"
          menu={<MenuButton />}
          headerIcons={<LawChangeButton />}
          aiAction={{
            ariaLabel: 'KI starten',
            label: 'KI Starten',
            status: 'start',
            onClick: () => undefined,
          }}
          reviewAction={defaultReviewAction}
        />
        <AiNormCard
          title="§ 17 Verfahren; Ermächtigung zum Erlass von Rechtsverordnungen"
          menu={<MenuButton />}
          aiAction={{
            ariaLabel: 'KI starten',
            label: 'KI Starten',
            status: 'start',
            onClick: () => undefined,
          }}
          reviewAction={{
            ...defaultReviewAction,
            status: 'recheck',
          }}
        />
        <AiNormCard
          title="§ 44 Vorschriften für besonders geschützte und bestimmte andere Tier- und Pflanzenarten"
          menu={<MenuButton />}
          aiAction={{
            ariaLabel: 'KI aktualisieren',
            label: 'Aktualisieren',
            status: 'outdated',
            onClick: () => undefined,
          }}
          reviewAction={{
            ...defaultReviewAction,
            status: 'recheck',
          }}
        />
        <AiNormCard
          variant="success"
          title="§ 45 Ausnahmen; Ermächtigung zum Erlass von Rechtsverordnungen"
          menu={<MenuButton />}
          aiAction={{
            ariaLabel: 'KI starten',
            label: 'KI Starten',
            status: 'start',
            onClick: () => undefined,
          }}
          reviewAction={{
            ...defaultReviewAction,
            status: 'checked',
          }}
        />
      </Story.Section>
      <Story.Section
        title="Additional AI states"
        contentClassName="grid w-full grid-cols-[repeat(auto-fit,minmax(260px,1fr))] items-start gap-3"
      >
        <AiNormCard
          title="§ 44 Vorschriften für besonders geschützte Arten"
          menu={<MenuButton />}
          aiAction={{
            ariaLabel: 'KI-Unterstützung',
            label: 'KI-Unterstützung',
            status: 'current',
          }}
          reviewAction={defaultReviewAction}
        />
        <AiNormCard
          title="§ 17 Verfahren; Ermächtigung zum Erlass von Rechtsverordnungen"
          menu={<MenuButton />}
          aiAction={{
            ariaLabel: 'KI läuft',
            label: 'KI läuft',
            status: 'loading',
          }}
          reviewAction={defaultReviewAction}
        />
        <AiNormCard
          title="§ 44 Vorschriften für besonders geschützte Arten"
          menu={<MenuButton />}
          aiAction={{
            ariaLabel: 'Veraltete KI-Ergebnisse',
            label: 'Aktualisieren',
            outdatedBadgeLabel: 'Veraltet',
            status: 'outdated',
          }}
          reviewAction={{
            ...defaultReviewAction,
            status: 'recheck',
          }}
        />
      </Story.Section>
      <Story.Section
        title="Narrow width"
        contentClassName="flex-col items-stretch"
      >
        <AiNormCard
          className="max-w-[220px]"
          title="§ 44 Vorschriften für besonders geschützte und bestimmte andere Arten"
          menu={<MenuButton />}
          aiAction={{
            ariaLabel: 'KI aktualisieren',
            label: 'Aktualisieren',
            status: 'outdated',
            onClick: () => undefined,
          }}
          reviewAction={{
            ...defaultReviewAction,
            status: 'recheck',
          }}
        />
      </Story.Section>
      <Story.Section
        title="Contextual match"
        contentClassName="grid w-full grid-cols-[repeat(auto-fit,minmax(260px,1fr))] items-start gap-3"
      >
        <AiNormCard
          variant="match"
          title="§ 17 Verfahren; Ermächtigung zum Erlass von Rechtsverordnungen"
          menu={<MenuButton />}
          selection={{
            ariaLabel: 'Rechtsgrundlage auswählen',
            isSelected: true,
            onSelect: () => undefined,
          }}
          aiAction={{
            ariaLabel: 'KI starten',
            label: 'KI Starten',
            status: 'start',
            onClick: () => undefined,
          }}
          reviewAction={defaultReviewAction}
        />
      </Story.Section>
    </Story>
  );
};

AiNormCardStory.storyTitle = 'AI Norm Card';
