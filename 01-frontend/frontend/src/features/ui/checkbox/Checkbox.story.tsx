import { useState } from 'react';
import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { Checkbox } from './Checkbox';

export const CheckboxStory: StoryComponentType = (props) => {
  const { id } = props;
  const [isUncheckedExampleChecked, setIsUncheckedExampleChecked] =
    useState(false);
  const [isCheckedExampleChecked, setIsCheckedExampleChecked] = useState(true);
  const [isIndeterminateExampleChecked, setIsIndeterminateExampleChecked] =
    useState<'checked' | 'unchecked' | 'indeterminate'>('indeterminate');

  return (
    <Story
      id={id}
      title="Checkbox"
      description="Checkboxes allow users to select or deselect a single option"
    >
      <Story.Section title="Default states">
        <Checkbox
          checked={isUncheckedExampleChecked ? 'checked' : 'unchecked'}
          label="Unchecked"
          onCheckedOn={() => setIsUncheckedExampleChecked(true)}
          onCheckedOff={() => setIsUncheckedExampleChecked(false)}
        />
        <Checkbox
          checked={isCheckedExampleChecked ? 'checked' : 'unchecked'}
          label="Check-Icon"
          onCheckedOn={() => setIsCheckedExampleChecked(true)}
          onCheckedOff={() => setIsCheckedExampleChecked(false)}
        />
        <Checkbox
          checked={isIndeterminateExampleChecked}
          label="Minus-Icon"
          onCheckedOn={() => setIsIndeterminateExampleChecked('indeterminate')}
          onCheckedOff={() => setIsIndeterminateExampleChecked('unchecked')}
        />
      </Story.Section>
      <Story.Section title="Disabled">
        <Checkbox label="Unchecked" disabled />
        <Checkbox checked="checked" label="Check-Icon" disabled />
        <Checkbox checked="indeterminate" label="Minus-Icon" disabled />
      </Story.Section>
    </Story>
  );
};
CheckboxStory.storyTitle = 'Checkbox';
