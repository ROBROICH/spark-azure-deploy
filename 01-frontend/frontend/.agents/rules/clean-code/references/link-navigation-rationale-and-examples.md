---
ruleId: clean-code/references/link-navigation-rationale-and-examples
---

# Link Navigation Rationale And Examples

## Why This Is Beneficial

- TanStack Router documents that `LinkOptions` extend `NavigateOptions` with extra anchor-oriented capabilities like `target`, `activeOptions`, and `preload`, so `<Link>` exposes navigation features that imperative `navigate()` calls do not surface at the element boundary. Source: [TanStack Router `LinkOptions` type](https://tanstack.com/router/latest/docs/framework/react/api/router/LinkOptionsType)
- TanStack Router also documents built-in `<Link>` preloading strategies such as `intent`, `viewport`, and `render`; intent preloading uses hover and touch start on `<Link>` components, which improves perceived navigation speed for likely next routes. Source: [TanStack Router preloading guide](https://tanstack.com/router/latest/docs/framework/react/guide/preloading)
- TanStack Router documents that `replace` swaps the current browser history entry instead of pushing a new one, making it the right fit for transient URL refinements that should not force users to step backward through every intermediate state. Source: [TanStack Router `NavigateOptions` type](https://tanstack.com/router/v1/docs/framework/react/api/router/NavigateOptionsType)
- MDN documents that `replaceState()` updates the current history entry while `pushState()` adds a new one, and shows that replaced entries are skipped by later Back navigation. Source: [MDN `History.replaceState()`](https://developer.mozilla.org/en-US/docs/Web/API/History/replaceState), [MDN History API guide](https://developer.mozilla.org/en-US/docs/Web/API/History_API/Working_with_the_History_API)
- MDN documents that real anchors activate with keyboard `Enter` and warns that fake click-driven links break expected behaviors like copying, dragging, opening in a new tab/window, and bookmarking, while also conveying the wrong semantics to assistive tech. Source: [MDN `<a>` element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a)

## Bad Example

```tsx
import { Link, useNavigate } from '@tanstack/react-router';

type ProjectFiltersProps = {
  projectId: string;
};

export function ProjectFilters(props: ProjectFiltersProps) {
  const navigate = useNavigate();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          navigate({
            to: '/projects/$projectId',
            params: { projectId: props.projectId },
          });
        }}
      >
        Open project
      </button>

      <Link
        to="/projects/$projectId/history"
        params={{ projectId: props.projectId }}
        replace
      >
        View history
      </Link>
    </>
  );
}
```

## Good Example

```tsx
import { Link } from '@tanstack/react-router';

type ProjectNavigationProps = {
  projectId: string;
};

export function ProjectNavigation(props: ProjectNavigationProps) {
  return (
    <>
      <Link
        to="/projects/$projectId"
        params={{ projectId: props.projectId }}
        preload="intent"
      >
        Open project
      </Link>

      <Link
        to="/projects"
        search={(prev) => ({ ...prev, status: 'open' })}
        replace
      >
        Open only
      </Link>

      <Link
        to="/projects/$projectId/history"
        params={{ projectId: props.projectId }}
      >
        View history
      </Link>
    </>
  );
}
```
