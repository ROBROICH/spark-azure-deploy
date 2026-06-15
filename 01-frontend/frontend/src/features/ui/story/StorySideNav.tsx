import { cn } from '@/features/ui/style/cn';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

type StorySideNavSection = {
  title: string;
  stories: {
    id: string;
    title: string;
  }[];
};

type StorySideNavProps = {
  sections: StorySideNavSection[];
  activeStoryId: string | null;
  onNavigate: (id: string) => void;
};

type StoryNavLinkProps = {
  story: StorySideNavSection['stories'][number];
  isActive: boolean;
  onNavigate: (id: string) => void;
};

const findActiveSectionIndex = (
  sections: StorySideNavSection[],
  activeStoryId: string | null,
): number => {
  if (!activeStoryId) {
    return 0;
  }
  return sections.findIndex((section) =>
    section.stories.some((story) => story.id === activeStoryId),
  );
};

const StoryNavLink = (props: StoryNavLinkProps) => {
  const { story, isActive, onNavigate } = props;

  return (
    <a
      href={`#${story.id}`}
      aria-current={isActive ? 'location' : undefined}
      className={cn(
        'focus-ring block rounded-md px-3 py-1.5 text-sm font-semibold transition-colors',
        isActive
          ? 'rainbow-animated-text font-bold'
          : 'text-slate-500 hover:text-slate-800',
      )}
      onClick={(event) => {
        event.preventDefault();
        onNavigate(story.id);
      }}
    >
      {story.title}
    </a>
  );
};

/**
 * Renders desktop and mobile story navigation tied to the active scroll-spy item.
 *
 * @param props - Navigation sections, active story id, and navigation handler.
 * @returns Responsive design-system story navigation.
 */
export const StorySideNav = (props: StorySideNavProps) => {
  const { sections, activeStoryId, onNavigate } = props;

  const activeSectionIndex = findActiveSectionIndex(sections, activeStoryId);
  const [expandedIndex, setExpandedIndex] = useState(activeSectionIndex);
  const [expandedActiveSectionIndex, setExpandedActiveSectionIndex] =
    useState(activeSectionIndex);
  let resolvedExpandedIndex = expandedIndex;
  if (
    activeSectionIndex >= 0 &&
    expandedActiveSectionIndex !== activeSectionIndex
  ) {
    resolvedExpandedIndex = activeSectionIndex;
    setExpandedActiveSectionIndex(activeSectionIndex);
    setExpandedIndex(activeSectionIndex);
  }

  if (sections.length === 0) {
    return null;
  }

  const handleSectionClick = (index: number) => {
    const section = sections[index];
    if (!section) {
      return;
    }

    if (resolvedExpandedIndex === index) {
      const firstStory = section.stories.at(0);
      if (firstStory) {
        onNavigate(firstStory.id);
      }
      return;
    }
    setExpandedIndex(index);

    const firstStory = section.stories.at(0);
    if (firstStory) {
      onNavigate(firstStory.id);
    }
  };

  return (
    <>
      <aside className="hidden w-64 shrink-0 lg:block">
        <nav
          aria-label="Design system stories"
          className="sticky top-24 space-y-1"
        >
          {sections.map((section, index) => {
            const isExpanded = resolvedExpandedIndex === index;
            const isActiveSection = activeSectionIndex === index;
            const panelId = `story-side-nav-section-${index}`;

            return (
              <div key={section.title}>
                <button
                  type="button"
                  className={cn(
                    'focus-ring flex w-full items-center gap-1.5 rounded-md px-1 py-2 text-left transition-colors',
                    isActiveSection
                      ? 'text-slate-900'
                      : 'text-slate-500 hover:text-slate-700',
                  )}
                  onClick={() => handleSectionClick(index)}
                  aria-expanded={isExpanded}
                  aria-controls={panelId}
                >
                  <ChevronRight
                    className={cn(
                      'size-4 shrink-0 transition-transform duration-200',
                      isExpanded && 'rotate-90',
                    )}
                    aria-hidden
                  />
                  <span className="text-overline-s">{section.title}</span>
                </button>
                {isExpanded && (
                  <div id={panelId} className="ml-2 space-y-0.5 pb-1">
                    {section.stories.map((story) => (
                      <StoryNavLink
                        key={story.id}
                        story={story}
                        isActive={story.id === activeStoryId}
                        onNavigate={onNavigate}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      <nav
        aria-label="Design system stories"
        className="flex snap-x gap-3 overflow-x-auto py-3 lg:hidden"
      >
        {sections
          .flatMap((section) => section.stories)
          .map((story) => (
            <button
              key={story.id}
              type="button"
              className={cn(
                'focus-ring snap-start rounded-md px-4 py-2 text-sm font-medium transition-colors',
                story.id === activeStoryId
                  ? 'bg-slate-900 text-white'
                  : 'bg-white/70 text-slate-600',
              )}
              aria-current={story.id === activeStoryId ? 'location' : undefined}
              onClick={() => {
                onNavigate(story.id);
              }}
            >
              {story.title}
            </button>
          ))}
      </nav>
    </>
  );
};
