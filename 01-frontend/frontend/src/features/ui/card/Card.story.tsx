import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { Button } from '../button/Button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './Card';

export const CardStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Card"
      description="Cards group related content in a contained surface."
    >
      <Story.Section
        title="Basic card"
        contentClassName="flex-col items-stretch max-w-md"
      >
        <Card>
          <CardHeader>
            <CardTitle>Card title</CardTitle>
            <CardDescription>A short description of the card.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-body">This is the card body content area.</p>
          </CardContent>
          <CardFooter>
            <Button size="sm">Action</Button>
          </CardFooter>
        </Card>
      </Story.Section>
      <Story.Section
        title="With Header"
        description="Card with title and description"
        contentClassName="flex-col items-start"
      >
        <Card className="w-80">
          <CardHeader>
            <CardTitle>Card Title</CardTitle>
            <CardDescription>
              A brief description of the card content.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>Card content goes here.</p>
          </CardContent>
        </Card>
      </Story.Section>
      <Story.Section
        title="With action"
        contentClassName="flex-col items-stretch max-w-md"
      >
        <Card>
          <CardHeader>
            <CardTitle>Card with action</CardTitle>
            <CardDescription>Header includes an action slot.</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm">
                Edit
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <p>Content with an action button in the header.</p>
          </CardContent>
        </Card>
      </Story.Section>

      <Story.Section
        title="With Footer"
        description="Card with footer actions"
        contentClassName="flex-col items-start"
      >
        <Card className="w-80">
          <CardHeader>
            <CardTitle>Confirm Action</CardTitle>
            <CardDescription>Are you sure you want to proceed?</CardDescription>
          </CardHeader>
          <CardContent>
            <p>This action cannot be undone.</p>
          </CardContent>
          <CardFooter className="gap-2">
            <Button variant="secondary">Cancel</Button>
            <Button>Confirm</Button>
          </CardFooter>
        </Card>
      </Story.Section>

      <Story.Section
        title="Full Example"
        description="Card with all components"
        contentClassName="flex-col items-start"
      >
        <Card className="w-96">
          <CardHeader className="border-b">
            <CardTitle>Complete Card</CardTitle>
            <CardDescription>
              This card demonstrates all available sub-components working
              together.
            </CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm">
                Options
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p>Main content area with multiple paragraphs.</p>
              <p className="text-sm text-slate-600">
                Secondary information displayed in a smaller size.
              </p>
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2 border-t">
            <Button variant="ghost">Cancel</Button>
            <Button>Save Changes</Button>
          </CardFooter>
        </Card>
      </Story.Section>
    </Story>
  );
};

CardStory.storyTitle = 'Card';
