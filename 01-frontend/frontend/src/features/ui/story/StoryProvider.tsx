import { slugify } from '@/features/ui/story/slugify';
import type { ReactElement, ReactNode } from 'react';
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { StoryComponentType, StoryControllerProps } from './Story';
import { StorySideNav } from './StorySideNav';

const isScrollable = (value: string) =>
  value === 'auto' || value === 'scroll' || value === 'overlay';

const getScrollContainer = (node: HTMLElement | null): HTMLElement | Window => {
  if (!node) {
    return window;
  }

  let current = node.parentElement;
  while (current) {
    const styles = window.getComputedStyle(current);
    if (isScrollable(styles.overflowY) || isScrollable(styles.overflow)) {
      return current;
    }
    current = current.parentElement;
  }

  return window;
};

/**
 * Tracks the visible story from scroll and resize events in the nearest scroll container.
 *
 * @param storyIds - Ordered story element ids to track.
 * @param scrollContainer - Resolved container, or window when no nested scroller exists.
 * @returns The currently active story id.
 */
function useScrollSpy(
  storyIds: string[],
  scrollContainer: HTMLElement | Window | null,
): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Justification: Subscribes to scroll/resize events to compute the active story in an imperative API.
  /* eslint-disable react-you-might-not-need-an-effect/no-pass-live-state-to-parent -- activeId is internal UI state derived from scroll position. */
  // eslint-disable-next-line no-restricted-syntax -- scroll and resize subscriptions require an effect-based lifecycle.
  useEffect(() => {
    if (storyIds.length === 0) {
      return;
    }

    const container = scrollContainer ?? window;
    const isWindow = container === window;
    const containerElement = isWindow ? null : (container as HTMLElement);

    /**
     * Computes active story state from measured scroll position and viewport bounds.
     */
    const handleScroll = () => {
      const scrollY = isWindow
        ? window.scrollY
        : (containerElement?.scrollTop ?? 0);
      const viewportHeight = isWindow
        ? window.innerHeight
        : (containerElement?.clientHeight ?? 0);
      const documentHeight = isWindow
        ? document.documentElement.scrollHeight
        : (containerElement?.scrollHeight ?? 0);
      const headerOffset = 100;

      if (scrollY < 50) {
        setActiveId(storyIds.at(0) ?? null);
        return;
      }

      if (scrollY + viewportHeight >= documentHeight - 50) {
        setActiveId(storyIds.at(-1) ?? null);
        return;
      }

      let closestId = storyIds.at(0) ?? null;
      let closestDistance = Infinity;

      for (const id of storyIds) {
        const element = document.getElementById(id);
        if (!element) {
          continue;
        }

        const rect = element.getBoundingClientRect();
        const containerTop = containerElement
          ? containerElement.getBoundingClientRect().top
          : 0;
        const relativeTop = rect.top - containerTop;
        const distanceFromTop = Math.abs(relativeTop - headerOffset);

        if (relativeTop <= headerOffset && distanceFromTop < closestDistance) {
          closestDistance = distanceFromTop;
          closestId = id;
        }
      }

      setActiveId(closestId);
    };

    let timeoutId: number;
    const debouncedScroll = () => {
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(handleScroll, 10);
    };

    const scrollTarget = isWindow ? window : containerElement;
    scrollTarget?.addEventListener('scroll', debouncedScroll, {
      passive: true,
    });
    window.addEventListener('resize', debouncedScroll);
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-adjust-state-on-prop-change -- the initial active story depends on measured scroll position after listeners are installed.
    handleScroll();

    return () => {
      scrollTarget?.removeEventListener('scroll', debouncedScroll);
      window.removeEventListener('resize', debouncedScroll);
      clearTimeout(timeoutId);
    };
  }, [storyIds, scrollContainer]);
  /* eslint-enable react-you-might-not-need-an-effect/no-pass-live-state-to-parent */

  return activeId;
}

type StoryChildElement = ReactElement<StoryControllerProps>;

type StoryLayoutSectionProps = {
  title: string;
  description?: ReactNode;
  children: StoryChildElement | StoryChildElement[];
};

type StoryLayoutSectionElement = ReactElement<
  StoryLayoutSectionProps,
  typeof StoryLayoutSection
>;

type StoryLayoutProps = {
  children: StoryLayoutSectionElement | StoryLayoutSectionElement[];
};

type DerivedStory = {
  id: string;
  title: string;
  element: StoryChildElement;
};

type DerivedSection = {
  key: string;
  title: string;
  description?: ReactNode;
  stories: DerivedStory[];
};

const StoryLayoutSection = (props: StoryLayoutSectionProps) => {
  const { children } = props;
  return <>{children}</>;
};

const isSectionElement = (
  child: ReactNode,
): child is StoryLayoutSectionElement =>
  isValidElement(child) && child.type === StoryLayoutSection;

const isStoryChildElement = (child: ReactNode): child is StoryChildElement =>
  isValidElement(child) &&
  typeof child.type !== 'string' &&
  typeof child.type !== 'symbol' &&
  typeof (child.type as StoryComponentType).storyTitle === 'string';

/**
 * Builds the design-system story shell from declarative sections and keeps side navigation in sync.
 *
 * @param props - Story layout sections rendered as direct children.
 * @returns Story content with synchronized in-page navigation.
 */
const StoryLayoutComponent = (props: StoryLayoutProps) => {
  const { children } = props;
  const layoutRef = useRef<HTMLDivElement>(null);
  const [scrollContainer, setScrollContainer] = useState<
    HTMLElement | Window | null
  >(null);

  // eslint-disable-next-line no-restricted-syntax -- derived story metadata is shared by scroll-spy and navigation logic, so stable identities avoid resubscribing those effects on unrelated renders.
  const derivedSections: DerivedSection[] = useMemo(
    () =>
      Children.toArray(children).map((child, sectionIndex) => {
        if (!isSectionElement(child)) {
          throw new Error(
            'StoryLayout expects children created with StoryLayout.Section',
          );
        }
        const storyElements = Children.toArray(child.props.children).map(
          (storyChild, storyIndex) => {
            if (!isStoryChildElement(storyChild)) {
              throw new Error(
                'StoryLayout.Section expects direct Story children',
              );
            }
            const StoryComponent = storyChild.type as StoryComponentType;
            const storyTitle = StoryComponent.storyTitle;
            const computedId =
              storyChild.props.id ??
              `story-${slugify(
                `${child.props.title}-${storyTitle}-${sectionIndex}-${storyIndex}`,
              )}`;
            const enhancedStory = cloneElement(storyChild, {
              id: computedId,
            });
            return {
              id: computedId,
              title: storyTitle,
              element: enhancedStory,
            };
          },
        );

        return {
          key: `${child.props.title}-${sectionIndex}`,
          title: child.props.title,
          description: child.props.description,
          stories: storyElements,
        };
      }),
    [children],
  );

  // eslint-disable-next-line no-restricted-syntax -- scroll-spy subscriptions depend on this derived id list, so stable identity avoids unnecessary listener churn.
  const storyIds = useMemo(
    () =>
      derivedSections.flatMap((section) => section.stories.map((s) => s.id)),
    [derivedSections],
  );

  const activeStoryId = useScrollSpy(storyIds, scrollContainer);

  // Justification: Requires DOM measurement after mount to resolve the scroll container.
  // eslint-disable-next-line no-restricted-syntax -- DOM reads to find the scroll container can only happen after mount.
  useEffect(() => {
    if (!layoutRef.current) {
      return;
    }
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-initialize-state -- DOM read only possible after mount.
    setScrollContainer(getScrollContainer(layoutRef.current));
  }, []);

  const firstStoryId = derivedSections[0]?.stories[0]?.id ?? null;
  const resolvedActiveStoryId = activeStoryId ?? firstStoryId;

  const navSections = derivedSections.map((section) => ({
    title: section.title,
    stories: section.stories.map((story) => ({
      id: story.id,
      title: story.title,
    })),
  }));

  const handleNavigate = (storyId: string) => {
    const target = document.getElementById(storyId);
    if (!target) {
      return;
    }

    window.history.replaceState(null, '', `#${storyId}`);

    const container = scrollContainer;
    if (!container || container === window) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const containerEl = container as HTMLElement;
    const targetRect = target.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();
    const scrollMargin = 96;

    containerEl.scrollTo({
      top:
        targetRect.top -
        containerRect.top +
        containerEl.scrollTop -
        scrollMargin,
      behavior: 'smooth',
    });
  };

  return (
    <div ref={layoutRef} className="bg-slate-50 py-10">
      <div className="mx-auto flex w-full max-w-container flex-col gap-8 px-4 lg:flex-row lg:gap-12 lg:px-6">
        <StorySideNav
          sections={navSections}
          activeStoryId={resolvedActiveStoryId}
          onNavigate={handleNavigate}
        />
        <div className="flex-1 space-y-12 pb-[600px]">
          {derivedSections.map((section) => (
            <section key={section.key} className="space-y-6">
              <div className="space-y-1">
                <h2 className="text-overline">{section.title}</h2>
                {section.description ? (
                  <p className="text-body text-slate-600">
                    {section.description}
                  </p>
                ) : null}
              </div>
              <div className="space-y-8">
                {section.stories.map((story) => (
                  <div key={story.id}>{story.element}</div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};

const StoryLayout = Object.assign(StoryLayoutComponent, {
  Section: StoryLayoutSection,
});

export { StoryLayout };
