import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { Skeleton, SkeletonList } from './Skeleton';

export const SkeletonStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Skeleton"
      description="Skeletons indicate loading content with a pulsing placeholder."
    >
      <Story.Section title="Shapes">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="size-12 rounded-full" />
      </Story.Section>
      <Story.Section title="Composed layout" contentClassName="flex-col">
        <div className="flex items-center gap-4">
          <Skeleton className="size-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </Story.Section>
      <Story.Section title="List cascade">
        <SkeletonList
          className="space-y-2"
          role="status"
          aria-label="Loading items"
        >
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          ))}
        </SkeletonList>
      </Story.Section>
    </Story>
  );
};
SkeletonStory.storyTitle = 'Skeleton';
