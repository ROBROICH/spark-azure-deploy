import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { ProgressBar } from './ProgressBar';

export const ProgressBarStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Progress Bar"
      description="Compact progress indicator for determinate and indeterminate workflow progress."
    >
      <Story.Section title="Determinate">
        <div className="w-80">
          <ProgressBar ariaLabel="Progress 45 percent" progress={0.45} />
        </div>
      </Story.Section>
      <Story.Section title="Indeterminate">
        <div className="w-80">
          <ProgressBar ariaLabel="Progress loading" />
        </div>
      </Story.Section>
    </Story>
  );
};

ProgressBarStory.storyTitle = 'Progress Bar';
