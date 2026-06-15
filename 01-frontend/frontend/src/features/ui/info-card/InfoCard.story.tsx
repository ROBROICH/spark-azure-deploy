import { Button } from '../button/Button';
import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { InfoCard } from './InfoCard';

const noop = () => undefined;

export const InfoCardStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Info Card"
      description="Generic information card for AI hints and warning messages."
    >
      <Story.Section
        title="Static"
        contentClassName="grid w-full grid-cols-1 items-start gap-4 lg:grid-cols-2"
      >
        <InfoCard
          ariaLabel="AI information"
          body="Die KI hat einen Hinweis vorbereitet. Pruefen Sie die vorgeschlagenen Inhalte, bevor Sie diese in die Bearbeitung uebernehmen."
          isCollapsible={false}
          title="KI-Hinweis verfuegbar"
          variant="ai"
        />
        <InfoCard
          ariaLabel="Warning information"
          body="Einige Angaben konnten nicht vollstaendig geprueft werden. Kontrollieren Sie die markierten Inhalte vor dem Fortfahren."
          isCollapsible={false}
          title="Manuelle Pruefung erforderlich"
          variant="warning"
        />
      </Story.Section>
      <Story.Section
        title="Collapsible"
        contentClassName="grid w-full grid-cols-1 items-start gap-4 lg:grid-cols-2"
      >
        <InfoCard
          body="Die Karte speichert ihren eingeklappten Zustand unter ihrem Namen und der jeweiligen Variante."
          collapsedTitle="KI-Hinweis"
          footer={
            <Button size="sm" type="button" onClick={noop}>
              Uebernehmen
            </Button>
          }
          isCollapsible
          name="story-info-card-ai"
          title="KI-Hinweis mit Aktion"
          variant="ai"
        />
        <InfoCard
          body="Diese Variante zeigt, wie eine Warnung eingeklappt startet und eine Aktion direkt im Header anbieten kann."
          collapsedHeaderAction={
            <Button size="xs" type="button" variant="secondary" onClick={noop}>
              Pruefen
            </Button>
          }
          collapsedTitle="Warnung"
          initialCollapsed
          isCollapsible
          name="story-info-card-warning"
          title="Warnung mit eingeklapptem Startzustand"
          variant="warning"
        />
      </Story.Section>
    </Story>
  );
};

InfoCardStory.storyTitle = 'Info Card';
