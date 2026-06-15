import { useState } from 'react';
import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { UserPicker, type UserPickerOption } from './UserPicker';

const USERS: UserPickerOption[] = [
  {
    id: 'synthetic-alpha',
    label: 'Synthetic Alpha',
    description: 'synthetic-alpha@example.test',
  },
  {
    id: 'synthetic-beta',
    label: 'Synthetic Beta',
    description: 'synthetic-beta@example.test',
  },
  { id: 'synthetic-gamma', label: 'Synthetic Gamma' },
];

export const UserPickerStory: StoryComponentType = (props) => {
  const { id } = props;
  const [value, setValue] = useState<string[]>(['synthetic-alpha']);

  return (
    <Story
      id={id}
      title="User Picker"
      description="ActionMenu-based multi-select for choosing users."
    >
      <Story.Section title="Multi select" contentClassName="max-w-sm">
        <UserPicker
          users={USERS}
          value={value}
          onChange={setValue}
          label="Select users"
          placeholder="Select users"
          emptyLabel="No users available"
          selectedCountLabel={(count) => `${count} selected`}
        />
      </Story.Section>
    </Story>
  );
};

UserPickerStory.storyTitle = 'User Picker';
