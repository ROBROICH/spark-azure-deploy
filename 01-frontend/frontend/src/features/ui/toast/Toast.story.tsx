import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { Button } from '../button/Button';
import { toast } from './Toast';

export const ToastStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Toast"
      description="Transient feedback messages. Fires without hitting any API."
    >
      <Story.Section title="Variants">
        <Button
          variant="secondary"
          onClick={() => toast.info('Heads up: this is an info toast.')}
        >
          Show info
        </Button>
        <Button
          variant="secondary"
          onClick={() => toast.success('Your changes were saved.')}
        >
          Show success
        </Button>
        <Button
          variant="secondary"
          onClick={() => toast.error('Something went wrong. Please try again.')}
        >
          Show error
        </Button>
      </Story.Section>
      <Story.Section title="Rapid sequence">
        <Button
          variant="secondary"
          onClick={() => {
            toast.success('Step 1 complete.');
            toast.info('Starting step 2…');
            setTimeout(() => toast.error('Step 2 failed.'), 1200);
          }}
        >
          Trigger sequence
        </Button>
      </Story.Section>
    </Story>
  );
};
ToastStory.storyTitle = 'Toast';
