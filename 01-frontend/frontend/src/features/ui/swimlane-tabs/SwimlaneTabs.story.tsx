import { Content as TabsContent } from '@radix-ui/react-tabs';
import { FileText, Maximize2, Search } from 'lucide-react';
import { Button } from '../button/Button';
import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { SwimlaneTabs } from './SwimlaneTabs';

export const SwimlaneTabsStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Swimlane Tabs"
      description="Tab header bar for swimlane layouts. Each tab represents a lane and can carry an optional action slot."
    >
      <Story.Section title="Default" contentClassName="flex-col">
        <SwimlaneTabs
          items={[
            { value: 'documents', label: 'Dokumente', icon: FileText },
            { value: 'findings', label: 'Fundstellen', icon: Search },
          ]}
          defaultValue="documents"
        >
          <TabsContent value="documents" className="bg-white p-4">
            Documents content goes here.
          </TabsContent>
          <TabsContent value="findings" className="bg-white p-4">
            Findings content goes here.
          </TabsContent>
        </SwimlaneTabs>
      </Story.Section>
      <Story.Section
        title="With Action Slot"
        description="Each tab can include an action element (e.g. a maximize button). The action should call event.stopPropagation() to avoid switching tabs."
        contentClassName="flex-col"
      >
        <SwimlaneTabs
          items={[
            {
              value: 'documents',
              label: 'Dokumente',
              icon: FileText,
              action: (
                <Button
                  variant="ghost"
                  size="md"
                  iconOnly
                  aria-label="Maximize documents lane"
                  asChild
                >
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Maximize2 />
                  </span>
                </Button>
              ),
            },
            {
              value: 'findings',
              label: 'Fundstellen',
              icon: Search,
              action: (
                <Button
                  variant="ghost"
                  size="md"
                  iconOnly
                  aria-label="Maximize findings lane"
                  asChild
                >
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Maximize2 />
                  </span>
                </Button>
              ),
            },
          ]}
          defaultValue="documents"
        >
          <TabsContent value="documents" className="bg-white p-4">
            Documents with maximize action.
          </TabsContent>
          <TabsContent value="findings" className="bg-white p-4">
            Findings with maximize action.
          </TabsContent>
        </SwimlaneTabs>
      </Story.Section>
      <Story.Section
        title="With Border Container"
        description="Wrapped in a bordered container, matching the swimlane panel design."
        contentClassName="flex-col"
      >
        <div className="overflow-hidden rounded-lg border border-border-primary">
          <SwimlaneTabs
            items={[
              {
                value: 'documents',
                label: 'Dokumente',
                icon: FileText,
                action: (
                  <Button
                    variant="ghost"
                    size="md"
                    iconOnly
                    aria-label="Maximize documents lane"
                    asChild
                  >
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <Maximize2 />
                    </span>
                  </Button>
                ),
              },
              {
                value: 'findings',
                label: 'Fundstellen',
                icon: Search,
                action: (
                  <Button
                    variant="ghost"
                    size="md"
                    iconOnly
                    aria-label="Maximize findings lane"
                    asChild
                  >
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <Maximize2 />
                    </span>
                  </Button>
                ),
              },
            ]}
            defaultValue="documents"
          >
            <TabsContent value="documents" className="bg-white p-4">
              Documents content goes here.
            </TabsContent>
            <TabsContent value="findings" className="bg-white p-4">
              Findings content goes here.
            </TabsContent>
          </SwimlaneTabs>
        </div>
      </Story.Section>
      <Story.Section
        title="Three Tabs"
        description="Works with any number of tabs."
        contentClassName="flex-col"
      >
        <SwimlaneTabs
          items={[
            { value: 'documents', label: 'Dokumente', icon: FileText },
            { value: 'findings', label: 'Fundstellen', icon: Search },
            { value: 'preview', label: 'Vorschau', icon: FileText },
          ]}
          defaultValue="findings"
        >
          <TabsContent value="documents" className="bg-white p-4">
            Documents content.
          </TabsContent>
          <TabsContent value="findings" className="bg-white p-4">
            Findings content.
          </TabsContent>
          <TabsContent value="preview" className="bg-white p-4">
            Preview content.
          </TabsContent>
        </SwimlaneTabs>
      </Story.Section>
    </Story>
  );
};
SwimlaneTabsStory.storyTitle = 'Swimlane Tabs';
