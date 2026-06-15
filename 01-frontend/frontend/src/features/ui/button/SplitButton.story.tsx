import { useState } from 'react';
import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { SplitButton } from './SplitButton';

export const SplitButtonStory: StoryComponentType = (props) => {
  const { id } = props;
  const [checkedSm, setCheckedSm] = useState(false);
  const [checkedMd, setCheckedMd] = useState(false);
  const [checkedCustom, setCheckedCustom] = useState(true);

  return (
    <Story
      id={id}
      title="Split Button"
      description="Bi-state button with a right icon separated by a hairline divider. Unchecked shows a check icon (primary style), checked turns green with an X icon."
    >
      <Story.Section title="Small (sm)">
        <SplitButton
          size="sm"
          checked={checkedSm}
          onCheckedChange={setCheckedSm}
        />
      </Story.Section>
      <Story.Section title="Medium (md)">
        <SplitButton
          size="md"
          checked={checkedMd}
          onCheckedChange={setCheckedMd}
        />
      </Story.Section>
      <Story.Section title="Custom labels">
        <SplitButton
          size="sm"
          checked={checkedCustom}
          onCheckedChange={setCheckedCustom}
          checkedLabel="Alle geprüft"
          uncheckedLabel="Alle prüfen"
        />
      </Story.Section>
      <Story.Section title="Disabled">
        <SplitButton
          size="sm"
          checked={false}
          onCheckedChange={() => {}}
          disabled
        />
        <SplitButton
          size="sm"
          checked={true}
          onCheckedChange={() => {}}
          disabled
        />
      </Story.Section>
    </Story>
  );
};
SplitButtonStory.storyTitle = 'Split Button';
