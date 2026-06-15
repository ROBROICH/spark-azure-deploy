import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { UserAvatar } from './UserAvatar';

const USERS = [
  { name: 'Synthetic Alpha', email: 'synthetic-alpha@example.test' },
  { name: 'Synthetic Beta', email: 'synthetic-beta@example.test' },
  { name: 'Synthetic Gamma', email: 'synthetic-gamma@example.test' },
  { name: 'Synthetic Delta', email: 'synthetic-delta@example.test' },
  { name: 'Synthetic Epsilon', email: 'synthetic-epsilon@example.test' },
  { name: '', email: 'email-only@example.test' },
];

export const UserAvatarStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="User Avatar"
      description="Round user avatar that derives initials from name and picks a stable color from email."
    >
      <Story.Section title="Users">
        <div className="flex items-center -space-x-2">
          {USERS.map((user) => (
            <UserAvatar
              key={user.email}
              name={user.name}
              email={user.email}
              className="ring-2 ring-white"
            />
          ))}
        </div>
      </Story.Section>
    </Story>
  );
};

UserAvatarStory.storyTitle = 'User Avatar';
