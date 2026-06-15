import { ArrowUpDown, FileText, ListFilter, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { FilterPillMultiSelect } from './FilterPillMultiSelect';
import { FilterPillSelect } from './FilterPillSelect';

type StatusFilter = 'open' | 'inProgress';
type SortValue = 'status' | 'titleDesc' | 'coverageDesc';
type DocumentFilter = 'application' | 'statement' | 'longDocument';
type AssigneeFilter = 'anna' | 'ben' | 'carla';

const statusOptions = [
  { value: 'all', label: 'Alle', queryValue: undefined },
  { value: 'open', label: 'Offen', queryValue: 'open' },
  {
    value: 'inProgress',
    label: 'In Bearbeitung',
    queryValue: 'inProgress',
  },
] satisfies ReadonlyArray<{
  value: 'all' | StatusFilter;
  label: string;
  queryValue: StatusFilter | undefined;
}>;

const sortOptions = [
  { value: 'status', label: 'Status' },
  { value: 'titleDesc', label: 'Titel Z-A' },
  { value: 'coverageDesc', label: 'Abdeckung' },
] satisfies ReadonlyArray<{ value: SortValue; label: string }>;

const documentOptions = [
  { value: 'application', label: 'Antragsunterlagen' },
  { value: 'statement', label: 'Stellungnahmen' },
  {
    value: 'longDocument',
    label: (
      <span>
        Sehr lange Unterlagenbezeichnung mit Abschnitt und Aktenzeichen
      </span>
    ),
  },
] satisfies ReadonlyArray<{ value: DocumentFilter; label: ReactNode }>;

const assigneeOptions = [
  { value: 'anna', label: 'Anna Muster' },
  { value: 'ben', label: 'Ben Beispiel' },
  { value: 'carla', label: 'Carla Mustermann' },
] satisfies ReadonlyArray<{ value: AssigneeFilter; label: string }>;

export const FilterPillSelectStory: StoryComponentType = (props) => {
  const { id } = props;
  const [status, setStatus] = useState<StatusFilter | undefined>('open');
  const [sort, setSort] = useState<SortValue | undefined>('status');
  const [documents, setDocuments] = useState<DocumentFilter[]>([
    'application',
    'longDocument',
  ]);
  const [assignees, setAssignees] = useState<AssigneeFilter[]>([]);

  return (
    <Story
      id={id}
      title="Filter Pill Select"
      description="Compact dropdown triggers for filter and sort URL-state controls."
    >
      <Story.Section title="Single select">
        <FilterPillSelect
          icon={<ListFilter className="size-4" />}
          fallbackLabel="Status"
          value={status}
          onValueChange={setStatus}
          options={statusOptions}
        />

        <FilterPillSelect
          icon={<ArrowUpDown className="size-4" />}
          fallbackLabel="Sortierung"
          value={sort}
          onValueChange={setSort}
          options={sortOptions}
          clearable={false}
        />

        <FilterPillSelect
          icon={<ListFilter className="size-4" />}
          label="Bearbeiter"
          labelMode="static"
          options={[]}
          disabled
        />
      </Story.Section>

      <Story.Section title="Multi select">
        <FilterPillMultiSelect
          icon={<FileText className="size-4" />}
          label="Unterlagen"
          value={documents}
          onValueChange={setDocuments}
          options={documentOptions}
        />

        <FilterPillMultiSelect
          icon={<UserRound className="size-4" />}
          label="Person"
          value={assignees}
          onValueChange={setAssignees}
          options={assigneeOptions}
        />

        <FilterPillMultiSelect
          icon={<ListFilter className="size-4" />}
          label="Status"
          value={[]}
          options={[]}
          emptyLabel="Keine Optionen"
        />

        <FilterPillMultiSelect
          icon={<UserRound className="size-4" />}
          label="Person"
          value={['anna']}
          options={assigneeOptions}
          disabled
        />
      </Story.Section>
    </Story>
  );
};

FilterPillSelectStory.storyTitle = 'Filter Pill Select';
