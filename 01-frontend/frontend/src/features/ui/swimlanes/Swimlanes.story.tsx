import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import {
  GroupedSections,
  MiscSections,
  StandaloneSections,
} from './SwimlanesStorySections';

/**
 * Design-system story for the Swimlanes compound component system.
 * Demonstrates standalone lanes, grouped/tabbed lanes, responsive
 * unfold behavior, and mixed compositions.
 */
export const SwimlanesStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Swimlanes"
      description="Composable swimlane layout system. Supports 2-6 lanes, grouped lanes with tabbed/unfolded modes, and per-group breakpoint control."
    >
      <StandaloneSections />
      <GroupedSections />
      <MiscSections />
    </Story>
  );
};
SwimlanesStory.storyTitle = 'Swimlanes';
