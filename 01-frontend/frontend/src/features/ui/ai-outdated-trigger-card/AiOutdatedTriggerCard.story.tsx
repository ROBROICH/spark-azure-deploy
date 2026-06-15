import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { AiOutdatedTriggerCard } from './AiOutdatedTriggerCard';

const noop = () => undefined;

export const AiOutdatedTriggerCardStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="AI Outdated Trigger Card"
      description="Yellow KI warning cards for outdated generated results."
    >
      <Story.Section
        title="Materielle Vollständigkeitsprüfung"
        contentClassName="w-full flex-col items-stretch"
      >
        <div className="w-full max-w-[560px]">
          <AiOutdatedTriggerCard
            name="story-ai-outdated-trigger-card-mvp"
            title="Einige KI-Ergebnisse sind nicht mehr aktuell"
            body="Der Dokumentenstand hat sich geändert. Einzelne Normprüfungen und Fundstellen müssen erneut durch die KI aktualisiert werden."
          />
        </div>
      </Story.Section>
      <Story.Section
        title="Rechtliche Prüfung und Beschlusserstellung"
        contentClassName="w-full flex-col items-stretch"
      >
        <div className="w-full max-w-[560px]">
          <AiOutdatedTriggerCard
            name="story-ai-outdated-trigger-card-rpb-expanded"
            title="KI-Aktualisierung empfohlen"
            body="Der Unterlagenstand hat sich geändert. Klicken Sie auf „Aktualisieren“, um die KI-Ergebnisse auf Basis des aktuellsten Unterlagenstands zu aktualisieren."
            versionAction={{
              label: 'Versionen anzeigen',
              onClick: noop,
            }}
            refreshAction={{
              label: 'Aktualisieren',
              onClick: noop,
            }}
          />
        </div>
        <div className="w-full max-w-[560px]">
          <AiOutdatedTriggerCard
            name="story-ai-outdated-trigger-card-rpb-loading"
            title="KI-Aktualisierung empfohlen"
            body="Der Unterlagenstand hat sich geändert. Klicken Sie auf „Aktualisieren“, um die KI-Ergebnisse auf Basis des aktuellsten Unterlagenstands zu aktualisieren."
            versionAction={{
              label: 'Versionen anzeigen',
              onClick: noop,
            }}
            refreshAction={{
              isLoading: true,
              label: 'Aktualisieren',
              loadingLabel: 'Aktualisierung läuft ...',
              onClick: noop,
            }}
          />
        </div>
      </Story.Section>
      <Story.Section
        title="Collapsed"
        contentClassName="w-full flex-col items-stretch"
      >
        <div className="w-full max-w-[560px]">
          <AiOutdatedTriggerCard
            name="story-ai-outdated-trigger-card-collapsed"
            initialCollapsed
            title="KI-Aktualisierung empfohlen"
            body="Der Unterlagenstand hat sich geändert. Klicken Sie auf „Aktualisieren“, um die KI-Ergebnisse auf Basis des aktuellsten Unterlagenstands zu aktualisieren."
            versionAction={{
              label: 'Versionen anzeigen',
              onClick: noop,
            }}
            refreshAction={{
              label: 'Aktualisieren',
              onClick: noop,
            }}
          />
        </div>
      </Story.Section>
    </Story>
  );
};

AiOutdatedTriggerCardStory.storyTitle = 'AI Outdated Trigger Card';
