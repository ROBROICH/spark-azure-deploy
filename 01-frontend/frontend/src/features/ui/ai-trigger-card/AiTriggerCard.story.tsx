import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { AiTriggerCard } from './AiTriggerCard';

const emptyBody =
  'Es liegen noch keine KI-Ergebnisse zu dieser Norm vor. Klicken Sie auf „Starten“, damit die KI die Unterlagen nach relevante Informationen zu dieser Norm durchsucht und darauf basierend eine Bewertung generiert.';
const noop = () => undefined;

export const AiTriggerCardStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="AI Trigger Card"
      description="AI analysis trigger card for empty, running, and successful states."
    >
      <Story.Section
        title="Variants"
        contentClassName="grid w-full grid-cols-1 items-start gap-4 lg:grid-cols-2"
      >
        <AiTriggerCard
          name="story-ai-trigger-card-empty-expanded"
          status="empty"
          title="KI-Analyse starten"
          body={emptyBody}
          startActionLabel="Starten"
          onStart={noop}
        />
        <AiTriggerCard
          name="story-ai-trigger-card-empty-collapsed"
          status="empty"
          title="KI-Analyse starten"
          body={emptyBody}
          startActionLabel="Starten"
          initialCollapsed
          onStart={noop}
        />
        <AiTriggerCard
          name="story-ai-trigger-card-progress-expanded"
          status="progress"
          title="KI analysiert die Unterlagen"
          collapsedTitle="KI-Analyse läuft ..."
          body="Die Unterlagen werden aktuell verarbeitet. Das kann einen Moment dauern."
          progressActionLabel="KI-Analyse läuft ..."
        />
        <AiTriggerCard
          name="story-ai-trigger-card-progress-collapsed"
          status="progress"
          title="KI analysiert die Unterlagen"
          collapsedTitle="KI-Analyse läuft ..."
          body="Die Unterlagen werden aktuell verarbeitet. Das kann einen Moment dauern."
          progressActionLabel="KI-Analyse läuft ..."
          initialCollapsed
        />
        <AiTriggerCard
          name="story-ai-trigger-card-success"
          status="success"
          title="KI-Analyse wurde erfolgreich abgeschlossen"
          className="lg:col-span-2"
        />
      </Story.Section>
    </Story>
  );
};

AiTriggerCardStory.storyTitle = 'AI Trigger Card';
