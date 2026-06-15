import { useState } from 'react';
import { Label } from '../label/Label';
import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { DebouncedSearchInput } from '../search-input/DebouncedSearchInput';
import { SearchInput } from '../search-input/SearchInput';
import { Field, FieldLabel } from '../form/field';
import { Input } from './Input';

export const InputStory: StoryComponentType = (props) => {
  const { id } = props;
  const [query, setQuery] = useState('Bodenschutz');
  const [debouncedQuery, setDebouncedQuery] = useState('Naturschutz');

  return (
    <Story
      id={id}
      title="Inputs"
      description="Labels, text inputs, and search inputs."
    >
      <Story.Section
        title="Label"
        contentClassName="flex flex-col gap-4 max-w-sm"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="label-name">First name</Label>
          <Input id="label-name" placeholder="Jane" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="label-email">Email address</Label>
          <Input id="label-email" type="email" placeholder="name@example.com" />
        </div>
      </Story.Section>

      <Story.Section title="States" contentClassName="flex-col max-w-sm">
        <Field>
          <FieldLabel htmlFor="input-default">Default</FieldLabel>
          <Input id="input-default" placeholder="Default" />
        </Field>
        <Field>
          <FieldLabel htmlFor="input-disabled">Disabled</FieldLabel>
          <Input id="input-disabled" placeholder="Disabled" disabled />
        </Field>
        <Field data-invalid="true">
          <FieldLabel htmlFor="input-invalid">Invalid</FieldLabel>
          <Input
            id="input-invalid"
            placeholder="Invalid"
            aria-invalid="true"
            aria-describedby="input-invalid-error"
          />
          <p id="input-invalid-error" className="text-sm text-error-900">
            This field is invalid.
          </p>
        </Field>
        <Field>
          <FieldLabel htmlFor="input-with-value">With value</FieldLabel>
          <Input id="input-with-value" defaultValue="With value" />
        </Field>
      </Story.Section>

      <Story.Section
        title="Search Input"
        contentClassName="flex-col items-stretch gap-6"
      >
        <div className="flex flex-col gap-2">
          <p className="text-body-s text-text-secondary">Immediate</p>
          <SearchInput
            value={query}
            onChange={setQuery}
            onClear={() => setQuery('')}
            placeholder="Themen durchsuchen"
            inputLabel="Themen durchsuchen"
            className="max-w-[32rem]"
          />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-body-s text-text-secondary">Debounced</p>
          <DebouncedSearchInput
            value={debouncedQuery}
            onChange={setDebouncedQuery}
            placeholder="Dokumente durchsuchen"
            inputLabel="Dokumente durchsuchen"
            className="max-w-[32rem]"
          />
        </div>
      </Story.Section>
    </Story>
  );
};
InputStory.storyTitle = 'Inputs';
