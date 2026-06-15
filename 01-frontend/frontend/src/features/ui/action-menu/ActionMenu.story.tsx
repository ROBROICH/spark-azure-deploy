import {
  Check,
  FileText,
  LayoutGrid,
  MoreVertical,
  Pencil,
  Trash2,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '../button/Button';
import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import {
  ActionMenu,
  ActionMenuCheckboxItem,
  ActionMenuContent,
  ActionMenuGroup,
  ActionMenuLabel,
  ActionMenuItem,
  ActionMenuSeparator,
  ActionMenuTrigger,
} from './ActionMenu';

const ThreeDotTrigger = (props: { label?: string }) => {
  const { label = 'Open actions' } = props;
  return (
    <ActionMenuTrigger asChild>
      <Button variant="ghost-light" iconOnly size="xs" aria-label={label}>
        <MoreVertical aria-hidden="true" />
      </Button>
    </ActionMenuTrigger>
  );
};

const CheckboxDemo = () => {
  const USERS = [
    { id: 'u1', name: 'Synthetic Alpha' },
    { id: 'u2', name: 'Synthetic Beta' },
    { id: 'u3', name: 'Synthetic Gamma' },
  ];
  const [selected, setSelected] = useState<Set<string>>(new Set(['u1']));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <ActionMenu>
      <ActionMenuTrigger asChild>
        <Button variant="ghost-light" size="sm" aria-label="Filter by assignee">
          <Users aria-hidden="true" />
          Assignees ({selected.size})
        </Button>
      </ActionMenuTrigger>
      <ActionMenuContent align="start">
        <ActionMenuLabel>Filter by assignee</ActionMenuLabel>
        {USERS.map((user) => {
          const checked = selected.has(user.id);
          return (
            <ActionMenuCheckboxItem
              key={user.id}
              checked={checked}
              onSelect={(e) => {
                e.preventDefault();
                toggle(user.id);
              }}
            >
              {checked ? (
                <Check className="size-3" aria-hidden="true" />
              ) : (
                <span className="size-3" />
              )}
              {user.name}
            </ActionMenuCheckboxItem>
          );
        })}
      </ActionMenuContent>
    </ActionMenu>
  );
};

export const ActionMenuStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Action Menu"
      description={[
        'Dark overflow menu for actions (edit, delete, export). Use when the trigger does not reflect a persisted value.',
        'The trigger label stays the same regardless of what the user picks — if it needs to update to show the current choice, use SelectMenu instead.',
        'Keyboard: Arrow keys navigate, Enter/Space activate, Escape closes and returns focus to the trigger.',
      ].join(' ')}
    >
      <Story.Section
        title="Basic — edit and delete"
        description="Standard three-dot menu on a card or table row. Destructive actions go below a separator."
      >
        <ActionMenu>
          <ThreeDotTrigger />
          <ActionMenuContent align="end">
            <ActionMenuItem>
              <Pencil aria-hidden="true" /> Bearbeiten
            </ActionMenuItem>
            <ActionMenuSeparator />
            <ActionMenuItem variant="destructive">
              <Trash2 aria-hidden="true" /> Löschen
            </ActionMenuItem>
          </ActionMenuContent>
        </ActionMenu>
      </Story.Section>

      <Story.Section
        title="With icon items and separator"
        description="Icons are optional but help scanability. Use ActionMenuSeparator to group related actions."
      >
        <ActionMenu>
          <ThreeDotTrigger />
          <ActionMenuContent align="end">
            <ActionMenuItem>
              <FileText aria-hidden="true" /> Nachfordern
            </ActionMenuItem>
            <ActionMenuItem>
              <LayoutGrid aria-hidden="true" /> Normtext anzeigen
            </ActionMenuItem>
            <ActionMenuSeparator />
            <ActionMenuItem variant="destructive">
              <Trash2 aria-hidden="true" /> Norm entfernen
            </ActionMenuItem>
          </ActionMenuContent>
        </ActionMenu>
      </Story.Section>

      <Story.Section
        title="With disabled item"
        description="Disabled items are visible but not interactive. Use sparingly — prefer hiding unavailable actions when context is clear."
      >
        <ActionMenu>
          <ThreeDotTrigger />
          <ActionMenuContent align="end">
            <ActionMenuItem>
              <Pencil aria-hidden="true" /> Bearbeiten
            </ActionMenuItem>
            <ActionMenuItem disabled>
              <Trash2 aria-hidden="true" /> Löschen (nicht möglich)
            </ActionMenuItem>
          </ActionMenuContent>
        </ActionMenu>
      </Story.Section>

      <Story.Section
        title="With group labels"
        description="ActionMenuGroup + ActionMenuLabel create named sections. Screen readers announce the label before each group's items."
      >
        <ActionMenu>
          <ThreeDotTrigger />
          <ActionMenuContent align="end" className="w-48">
            <ActionMenuGroup>
              <ActionMenuLabel>Dokument</ActionMenuLabel>
              <ActionMenuItem>
                <FileText aria-hidden="true" /> Nachfordern
              </ActionMenuItem>
              <ActionMenuItem>
                <LayoutGrid aria-hidden="true" /> Normtext anzeigen
              </ActionMenuItem>
            </ActionMenuGroup>
            <ActionMenuSeparator />
            <ActionMenuGroup>
              <ActionMenuLabel>Gefahr</ActionMenuLabel>
              <ActionMenuItem variant="destructive">
                <Trash2 aria-hidden="true" /> Norm entfernen
              </ActionMenuItem>
            </ActionMenuGroup>
          </ActionMenuContent>
        </ActionMenu>
      </Story.Section>

      <Story.Section
        title="Multi-select with checkboxes"
        description="ActionMenuCheckboxItem renders role='menuitemcheckbox'. Call e.preventDefault() in onSelect to keep the menu open. Render your own check icon inside the item children."
      >
        <CheckboxDemo />
      </Story.Section>
    </Story>
  );
};

ActionMenuStory.storyTitle = 'Action Menu';
