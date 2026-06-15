import { Story } from '../story/Story';
import type { StoryComponentType } from '../story/Story';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

export const TabsStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Tabs"
      description="Tabs toggle between related content panes."
    >
      <Story.Section title="Default">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="disabled" disabled>
              Disabled
            </TabsTrigger>
          </TabsList>
          <TabsContent value="overview">Overview content</TabsContent>
          <TabsContent value="details">Details content</TabsContent>
          <TabsContent value="history">History content</TabsContent>
        </Tabs>
      </Story.Section>

      <Story.Section title="Segmented">
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a" variant="segmented">
              Option A
            </TabsTrigger>
            <TabsTrigger value="b" variant="segmented">
              Option B
            </TabsTrigger>
            <TabsTrigger value="c" variant="segmented">
              Option C
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </Story.Section>
    </Story>
  );
};
TabsStory.storyTitle = 'Tabs';
