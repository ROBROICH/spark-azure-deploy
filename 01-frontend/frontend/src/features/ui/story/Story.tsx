import type { FC, PropsWithChildren, ReactElement, ReactNode } from 'react';
import { cn } from '@/features/ui/style/cn';
import { slugify } from '@/features/ui/story/slugify';

type StorySectionProps = PropsWithChildren<{
  title: string;
  description?: ReactNode;
  className?: string;
  contentClassName?: string;
}>;

const StorySection = (props: StorySectionProps) => {
  const { title, description, children, className, contentClassName } = props;

  return (
    <section className={cn('space-y-4', className)}>
      <div className="space-y-1">
        <h4 className="text-heading-sm">{title}</h4>
        {description ? (
          <p className="text-body-s text-slate-600">{description}</p>
        ) : null}
      </div>
      <div
        className={cn('flex flex-wrap items-center gap-4', contentClassName)}
      >
        {children}
      </div>
    </section>
  );
};

StorySection.displayName = 'StorySection';

type StorySectionElement = ReactElement<StorySectionProps, typeof StorySection>;

type StoryProps = {
  title: string;
  description?: ReactNode;
  id?: string;
  className?: string;
  children?: StorySectionElement | StorySectionElement[];
};

export type StoryControllerProps = Pick<StoryProps, 'id'>;

export type StoryComponentType = FC<StoryControllerProps> & {
  storyTitle: string;
};

const StoryComponent = (props: StoryProps) => {
  const { title, description, className, children, id } = props;
  const generatedId = id ?? `story-${slugify(title)}`;

  return (
    <article
      id={generatedId}
      className={cn(
        'scroll-mt-24 space-y-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm',
        className,
      )}
    >
      <header className="space-y-2">
        <h3 className="text-heading-xl">{title}</h3>
        {description ? (
          <p className="text-body text-slate-600">{description}</p>
        ) : null}
      </header>
      <div className="space-y-8">{children}</div>
    </article>
  );
};

type StoryComponentFn = (props: StoryProps) => ReactElement;

type StoryCompoundComponent = StoryComponentFn & {
  Section: typeof StorySection;
};

const StoryWithSections = StoryComponent as StoryCompoundComponent;
StoryWithSections.Section = StorySection;

export const Story = StoryWithSections;
export type { StoryProps, StorySectionProps };
