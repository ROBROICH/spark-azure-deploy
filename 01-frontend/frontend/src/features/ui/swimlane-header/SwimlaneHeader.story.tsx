import { FileText, Filter, Maximize2, Settings } from 'lucide-react';
import { Button } from '../button/Button';
import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { SwimlaneHeader } from './SwimlaneHeader';

export const SwimlaneHeaderStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Swimlane Header"
      description="Standalone header bar for a swimlane section. Visually matches an active swimlane tab but without tab-switching semantics."
    >
      <Story.Section title="Default" contentClassName="flex-col">
        <SwimlaneHeader icon={FileText} title="Dokumente" />
      </Story.Section>
      <Story.Section
        title="With Action"
        description="An optional action slot (e.g. maximize button) rendered at the far right."
        contentClassName="flex-col"
      >
        <SwimlaneHeader
          icon={FileText}
          title="Dokumente"
          action={
            <Button
              variant="ghost"
              size="md"
              iconOnly
              aria-label="Maximize documents lane"
            >
              <Maximize2 />
            </Button>
          }
        />
      </Story.Section>
      <Story.Section
        title="With Children and Action"
        description="Right-justified children (e.g. toolbar buttons) render between the title and the action slot. Spacing is controlled by the consumer."
        contentClassName="flex-col"
      >
        <SwimlaneHeader
          icon={FileText}
          title="Dokumente"
          action={
            <Button
              variant="ghost"
              size="md"
              iconOnly
              aria-label="Maximize documents lane"
            >
              <Maximize2 />
            </Button>
          }
        >
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="md" iconOnly aria-label="Filter">
              <Filter />
            </Button>
            <Button variant="ghost" size="md" iconOnly aria-label="Settings">
              <Settings />
            </Button>
          </div>
        </SwimlaneHeader>
      </Story.Section>
      <Story.Section
        title="With Border Container"
        description="Wrapped in a bordered container, matching the swimlane panel design."
        contentClassName="flex-col"
      >
        <div className="overflow-hidden rounded-lg border border-border-primary">
          <SwimlaneHeader
            icon={FileText}
            title="Dokumente"
            action={
              <Button
                variant="ghost"
                size="md"
                iconOnly
                aria-label="Maximize documents lane"
              >
                <Maximize2 />
              </Button>
            }
          >
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="md" iconOnly aria-label="Filter">
                <Filter />
              </Button>
            </div>
          </SwimlaneHeader>
          <div className="bg-white p-4">Documents content goes here.</div>
        </div>
      </Story.Section>
    </Story>
  );
};
SwimlaneHeaderStory.storyTitle = 'Swimlane Header';
