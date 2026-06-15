import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { AiButton } from './AiButton';

export const AiButtonStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="AI Button"
      description="Gradient AI action button with optional enabled and disabled tooltips."
    >
      <Story.Section title="States">
        <AiButton label="KI-Analyse starten" />
        <AiButton label="KI-Analyse starten" size="sm" />
        <AiButton
          label="KI-Analyse starten"
          enabledTooltip="KI-Analyse starten"
        />
        <AiButton
          label="KI-Analyse läuft"
          isLoading
          isDisabled
          disabledTooltip="KI-Analyse kann bis zu 2 Stunden dauern."
        />
      </Story.Section>
    </Story>
  );
};

AiButtonStory.storyTitle = 'AI Button';
