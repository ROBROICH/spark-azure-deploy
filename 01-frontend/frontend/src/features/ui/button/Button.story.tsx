import { MoreVertical, Search } from 'lucide-react';
import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { Button } from './Button';

export const ButtonStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Button"
      description="Shared button component with variants, sizes, loading state, and icon support."
    >
      <Story.Section title="Primary">
        <Button variant="primary">Speichern</Button>
        <Button variant="primary" withIcon>
          <Search />
          Suche
        </Button>
        <Button variant="primary" iconOnly aria-label="Search">
          <Search />
        </Button>
        <Button variant="primary" disabled>
          Speichern
        </Button>
        <Button variant="primary" withIcon disabled>
          <Search />
          Suche
        </Button>
        <Button variant="primary" iconOnly aria-label="Search" disabled>
          <Search />
        </Button>
      </Story.Section>
      <Story.Section title="Secondary">
        <Button variant="secondary">Speichern</Button>
        <Button variant="secondary" withIcon>
          <Search />
          Suche
        </Button>
        <Button variant="secondary" iconOnly aria-label="Search">
          <Search />
        </Button>
        <Button variant="secondary" disabled>
          Speichern
        </Button>
        <Button variant="secondary" withIcon disabled>
          <Search />
          Suche
        </Button>
        <Button variant="secondary" iconOnly aria-label="Search" disabled>
          <Search />
        </Button>
      </Story.Section>
      <Story.Section title="Ghost (Tertiary)">
        <Button variant="ghost">Zurücksetzen</Button>
        <Button variant="ghost" withIcon>
          <Search />
          Suche
        </Button>
        <Button variant="ghost" iconOnly aria-label="Search">
          <Search />
        </Button>
        <Button variant="ghost" disabled>
          Zurücksetzen
        </Button>
        <Button variant="ghost" withIcon disabled>
          <Search />
          Suche
        </Button>
        <Button variant="ghost" iconOnly aria-label="Search" disabled>
          <Search />
        </Button>
      </Story.Section>
      <Story.Section title="Danger">
        <Button variant="danger">Löschen</Button>
        <Button variant="danger" withIcon>
          <Search />
          Löschen
        </Button>
        <Button variant="danger" iconOnly aria-label="Delete">
          <Search />
        </Button>
        <Button variant="danger" disabled>
          Löschen
        </Button>
        <Button variant="danger" withIcon disabled>
          <Search />
          Löschen
        </Button>
        <Button variant="danger" iconOnly aria-label="Delete" disabled>
          <Search />
        </Button>
      </Story.Section>
      <Story.Section
        title="Ghost Light"
        description="Not in figma button design system. Useful for small icon-only buttons, like three dot menu in cards, where there should be no background on hover."
      >
        <Button variant="ghost-light" iconOnly size="xs" aria-label="more">
          <MoreVertical aria-hidden="true" />
        </Button>
      </Story.Section>
      <Story.Section title="Sizes">
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="default">Default</Button>
        <Button size="lg">Large</Button>
      </Story.Section>
      <Story.Section title="States">
        <Button disabled>Disabled Primary</Button>
        <Button loading>Saving</Button>
        <Button variant="secondary" disabled>
          Disabled Secondary
        </Button>
      </Story.Section>
      <Story.Section title="Icon Only">
        <Button iconOnly aria-label="Search" size="sm">
          <Search />
        </Button>
        <Button iconOnly aria-label="Search" size="md">
          <Search />
        </Button>
        <Button iconOnly aria-label="Search" size="default">
          <Search />
        </Button>
        <Button iconOnly aria-label="Search" size="lg">
          <Search />
        </Button>
        <Button variant="ghost" iconOnly aria-label="Search">
          <Search />
        </Button>
        <Button variant="secondary" iconOnly aria-label="Search">
          <Search />
        </Button>
      </Story.Section>
    </Story>
  );
};
ButtonStory.storyTitle = 'Button';
