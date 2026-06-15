import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { StatusBadge } from './StatusBadge';

const variants = ['default', 'neutral', 'success', 'warning', 'error'] as const;

export const StatusBadgeStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Status Badge"
      description="Status badge with bordered, coloured variants. Use for entity status display."
    >
      <Story.Section title="Variants — Default size">
        {variants.map((variant) => (
          <StatusBadge key={variant} variant={variant}>
            {variant.charAt(0).toUpperCase() + variant.slice(1)}
          </StatusBadge>
        ))}
      </Story.Section>
      <Story.Section title="Variants — Small size (sm)">
        {variants.map((variant) => (
          <StatusBadge key={variant} variant={variant} size="sm">
            {variant.charAt(0).toUpperCase() + variant.slice(1)}
          </StatusBadge>
        ))}
      </Story.Section>
      <Story.Section title="Usage examples">
        <StatusBadge variant="neutral">Offen</StatusBadge>
        <StatusBadge variant="neutral">In Bearbeitung</StatusBadge>
        <StatusBadge variant="success">Genehmigt</StatusBadge>
        <StatusBadge variant="warning">Ausstehend</StatusBadge>
        <StatusBadge variant="error">Abgelehnt</StatusBadge>
        <StatusBadge
          variant="neutral"
          onRemove={() => undefined}
          removeLabel="Remove topic"
        >
          Energiewirtschaft
        </StatusBadge>
      </Story.Section>
    </Story>
  );
};
StatusBadgeStory.storyTitle = 'Status Badge';
