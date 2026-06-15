import { Story } from '../story/Story';
import type { StoryComponentType } from '../story/Story';
import { Input } from '../input/Input';
import { Label } from './Label';

export const LabelStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Label"
      description="Labels describe inputs and improve accessibility."
    >
      <Story.Section
        title="Basic labels"
        contentClassName="flex flex-col gap-6"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="first-name">First name</Label>
          <Input id="first-name" placeholder="Jane" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email address</Label>
          <Input id="email" type="email" placeholder="name@example.com" />
        </div>
      </Story.Section>
      <Story.Section
        title="Inline label"
        contentClassName="flex flex-col gap-4"
      >
        <Label htmlFor="notifications">
          <input id="notifications" type="checkbox" className="size-4" />
          Enable notifications
        </Label>
      </Story.Section>
    </Story>
  );
};
LabelStory.storyTitle = 'Label';
