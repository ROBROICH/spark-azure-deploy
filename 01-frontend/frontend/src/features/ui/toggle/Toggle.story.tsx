import { Story } from '../story/Story';
import type { StoryComponentType } from '../story/Story';
import { Toggle } from './Toggle';
import { useState } from 'react';

export const ToggleStory: StoryComponentType = (props) => {
  const { id } = props;
  const [enabled, setEnabled] = useState(true);

  return (
    <Story
      id={id}
      title="Toggle"
      description="Toggles switch between two states."
    >
      <Story.Section title="Default states">
        <Toggle label="Off" />
        <Toggle label="On" checked={enabled} onCheckedChange={setEnabled} />
      </Story.Section>
      <Story.Section title="Disabled">
        <Toggle label="Off" disabled />
        <Toggle label="On" checked disabled />
      </Story.Section>
    </Story>
  );
};
ToggleStory.storyTitle = 'Toggle';
