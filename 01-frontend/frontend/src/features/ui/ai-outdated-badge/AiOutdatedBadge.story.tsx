import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { AiOutdatedBadge } from './AiOutdatedBadge';

const tooltipCopy = {
  closeLabel: 'Schließen',
  description:
    'Ihre derzeitige KI-Bearbeitung basiert auf einem veralteten Unterlagenstand.',
  instruction:
    'Klicken Sie auf „Aktualisieren“, um die KI-Ergebnisse zu aktualisieren.',
  title: 'Versionshinweis',
};

/**
 * Shows the static, tooltip-only, actionable, loading, and disabled variants of
 * the shared outdated AI badge.
 *
 * @param props Story registration props from the design-system shell.
 * @returns The AI outdated badge story section.
 */
export const AiOutdatedBadgeStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="AI Outdated Badge"
      description="Compact versioning badge for outdated AI-generated results with a dark detail tooltip."
    >
      <Story.Section title="States">
        <AiOutdatedBadge label="Veraltet" />
        <AiOutdatedBadge
          label="Veraltet"
          tooltip={{
            ...tooltipCopy,
          }}
        />
        <AiOutdatedBadge
          label="Veraltet"
          tooltip={{
            ...tooltipCopy,
            versionAction: {
              label: 'Versionen anzeigen',
              onClick: () => undefined,
            },
            refreshAction: {
              label: 'Aktualisieren',
              onClick: () => undefined,
            },
          }}
        />
        <AiOutdatedBadge
          label="Veraltet"
          tooltip={{
            ...tooltipCopy,
            versionAction: {
              label: 'Versionen anzeigen',
              onClick: () => undefined,
            },
            refreshAction: {
              isLoading: true,
              label: 'Aktualisierung läuft ...',
              onClick: () => undefined,
            },
          }}
        />
        <AiOutdatedBadge
          label="Veraltet"
          tooltip={{
            ...tooltipCopy,
            versionAction: {
              disabled: true,
              label: 'Versionen anzeigen',
            },
            refreshAction: {
              disabled: true,
              label: 'Aktualisieren',
            },
          }}
        />
      </Story.Section>
    </Story>
  );
};

AiOutdatedBadgeStory.storyTitle = 'AI Outdated Badge';
