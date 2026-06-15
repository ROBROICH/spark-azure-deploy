import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { AvatarBand } from './AvatarBand';

export const AvatarBandStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Avatar Band"
      description="Overlapping user avatars with stable colors and tooltips."
    >
      <Story.Section title="Users">
        <AvatarBand
          getToggleLabel={({ isPinned, user }) =>
            `${isPinned ? 'Unpin' : 'Pin'} details for ${user.name}, ${user.email}`
          }
          getOverflowLabel={(count) => `${count} more editors`}
          users={[
            {
              id: 'user-1',
              name: 'Synthetic Alpha',
              email: 'synthetic-alpha@example.test',
            },
            {
              id: 'user-2',
              name: 'Synthetic Beta',
              email: 'synthetic-beta@example.test',
            },
            {
              id: 'user-3',
              name: 'Synthetic Gamma',
              email: 'synthetic-gamma@example.test',
            },
            {
              id: 'user-4',
              name: 'Synthetic Delta',
              email: 'synthetic-delta@example.test',
            },
          ]}
        />
      </Story.Section>
    </Story>
  );
};

AvatarBandStory.storyTitle = 'Avatar Band';
