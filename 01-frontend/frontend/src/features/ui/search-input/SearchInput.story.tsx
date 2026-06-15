import { useState } from 'react';
import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { DebouncedSearchInput } from './DebouncedSearchInput';
import { SearchInput } from './SearchInput';

export const SearchInputStory: StoryComponentType = (props) => {
  const { id } = props;
  const [query, setQuery] = useState('Bodenschutz');
  const [debouncedQuery, setDebouncedQuery] = useState('Naturschutz');
  const [committedQuery, setCommittedQuery] = useState('Naturschutz');

  return (
    <Story
      id={id}
      title="Search Input"
      description="Compact search field with immediate and debounced variants."
    >
      <Story.Section
        title="Immediate"
        contentClassName="flex-col items-stretch"
      >
        <SearchInput
          value={query}
          onChange={setQuery}
          onClear={() => setQuery('')}
          placeholder="Themen durchsuchen"
          inputLabel="Themen durchsuchen"
          className="max-w-[32rem]"
        />
        <p className="text-body-s text-slate-600">Aktueller Wert: {query}</p>
      </Story.Section>

      <Story.Section
        title="Debounced"
        contentClassName="flex-col items-stretch"
      >
        <DebouncedSearchInput
          value={debouncedQuery}
          onChange={(value) => {
            setDebouncedQuery(value);
            setCommittedQuery(value);
          }}
          placeholder="Dokumente durchsuchen"
          inputLabel="Dokumente durchsuchen"
          className="max-w-[32rem]"
        />
        <p className="text-body-s text-slate-600">
          Debounced commit: {committedQuery}
        </p>
      </Story.Section>
    </Story>
  );
};

SearchInputStory.storyTitle = 'Search Input';
