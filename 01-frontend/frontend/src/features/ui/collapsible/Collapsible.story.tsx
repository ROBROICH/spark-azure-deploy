import { ChevronsUpDown } from 'lucide-react';
import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { Button } from '../button/Button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './Collapsible';

export const CollapsibleStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Collapsible"
      description="Collapsibles toggle the visibility of a content section."
    >
      <Story.Section title="Default" contentClassName="flex-col">
        <Collapsible className="w-full max-w-sm space-y-2">
          <div className="flex items-center justify-between rounded-md border px-4 py-2">
            <span className="text-body font-medium">Toggle section</span>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" iconOnly aria-label="Toggle">
                <ChevronsUpDown />
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="space-y-2">
            <div className="text-body rounded-md border px-4 py-2">
              Collapsible content line 1
            </div>
            <div className="text-body rounded-md border px-4 py-2">
              Collapsible content line 2
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Story.Section>
      <Story.Section title="Default open" contentClassName="flex-col">
        <Collapsible defaultOpen className="w-full max-w-sm space-y-2">
          <div className="flex items-center justify-between rounded-md border px-4 py-2">
            <span className="text-body font-medium">Open by default</span>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" iconOnly aria-label="Toggle">
                <ChevronsUpDown />
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="space-y-2">
            <div className="text-body rounded-md border px-4 py-2">
              This section starts expanded.
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Story.Section>
    </Story>
  );
};
CollapsibleStory.storyTitle = 'Collapsible';
