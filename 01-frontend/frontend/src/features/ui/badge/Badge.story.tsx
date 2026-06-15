import { Story } from '../story/Story';
import type { StoryComponentType } from '../story/Story';
import { Badge } from './Badge';

const badgeVariants = [
  'primary',
  'secondary',
  'success',
  'neutral',
  'ai',
  'warningOrange',
  'error',
  'warningYellow',
] as const;

export const BadgeStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Badge"
      description="Badges highlight quick metadata such as status or categories."
    >
      <Story.Section title="Variants">
        {badgeVariants.map((variant) => (
          <Badge key={variant} variant={variant}>
            {variant}
          </Badge>
        ))}
      </Story.Section>
      <Story.Section title="Custom types">
        <Badge type="success">Success</Badge>
        <Badge type="ai">AI</Badge>
      </Story.Section>
      <Story.Section title="Sizes">
        <Badge variant="primary">Medium</Badge>
        <Badge variant="primary" size="small">
          Small
        </Badge>
      </Story.Section>
    </Story>
  );
};
BadgeStory.storyTitle = 'Badge';
