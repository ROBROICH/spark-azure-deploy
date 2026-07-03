import { useState } from 'react';
import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import type { SelectMenuItem } from './SelectMenu';
import { SelectMenu } from './SelectMenu';

// ─── Shared mock data ────────────────────────────────────────────────────────

const TOPIC_ITEMS: SelectMenuItem[] = [
  { value: 'artenschutz', label: 'Artenschutz' },
  { value: 'umweltvertraeglichkeit', label: 'Umweltverträglichkeit' },
  { value: 'energiewirtschaft', label: 'Energiewirtschaft' },
  { value: 'notwendigkeit', label: 'Notwendigkeit Planfeststellungsverfahren' },
  {
    value: 'planrechtfertigung',
    label: 'Planrechtfertigung und Abschnittsbildung',
  },
  { value: 'naturschutz', label: 'Naturschutz Eingriffsregelung' },
  { value: 'disabled-item', label: 'Nicht verfügbar', disabled: true },
];

const VERSION_ITEMS: SelectMenuItem[] = [
  { value: '1', label: 'Version 1' },
  { value: '2', label: 'Version 2' },
  { value: '3', label: 'Version 3 (aktuell)' },
];

const DOCUMENT_ITEMS: SelectMenuItem[] = [
  {
    value: 'doc-1',
    label: 'Beispieldokument 01.pdf',
  },
  { value: 'doc-2', label: 'Beispieldokument 02.pdf' },
  { value: 'doc-3', label: 'Beispieldokument 03.pdf' },
  { value: 'doc-4', label: 'Beispieldokument 04.pdf' },
];

const PROJECT_TYPES: SelectMenuItem[] = [
  { value: 'bundesfernstrasse', label: 'Bundesfernstraße' },
  { value: 'bundeswasserstrasse', label: 'Bundeswasserstraße' },
  { value: 'schienenwege', label: 'Schienenwege des Bundes' },
];

// ─── Simple base demos ───────────────────────────────────────────────────────

function DefaultDemo() {
  const [value, setValue] = useState('artenschutz');
  return (
    <SelectMenu
      items={TOPIC_ITEMS}
      value={value}
      onChange={setValue}
      ariaLabel="Thema"
    />
  );
}

function DisabledDemo() {
  return (
    <SelectMenu
      items={TOPIC_ITEMS}
      value="artenschutz"
      onChange={() => {}}
      ariaLabel="Thema (disabled)"
      disabled
    />
  );
}

function PlaceholderDemo() {
  const [value, setValue] = useState('');
  return (
    <SelectMenu
      items={TOPIC_ITEMS.filter((i) => !i.disabled)}
      value={value}
      onChange={setValue}
      placeholder="Thema auswählen…"
      ariaLabel="Thema"
    />
  );
}

// ─── Real-world usage pattern demos ──────────────────────────────────────────
//
// Each demo below mirrors an actual caller in the codebase.
// The aim is to show whether customisations are load-bearing or could be
// consolidated into the component's default styles or a named variant.

/**
 * ReadOnlyDocumentsCard — compact green badge/pill trigger.
 *
 * What the custom classes achieve:
 *   triggerClassName: switches bg from neutral-700 → green-100, border from
 *     white/20 → green-200, rounds to full pill, reduces height to h-6, adds
 *     hover state.
 *   valueClassName: locks in the exact type ramp and green text.
 *   chevronClassName: shrinks chevron from size-4 → size-3, matches green text.
 *
 * Verdict: heavily custom — three className props needed. Could become a named
 * prop (e.g. size="sm") if a compact trigger is common enough.
 */
function VersionBadgeDemo() {
  const [value, setValue] = useState('3');
  return (
    <SelectMenu
      items={VERSION_ITEMS}
      value={value}
      onChange={setValue}
      ariaLabel="Dokumentversion"
      triggerClassName="inline-flex h-6 items-center gap-1 rounded-full border border-green-200 bg-green-100 px-2 text-green-700 hover:bg-green-200"
      valueClassName="text-[11px] leading-[14px] tracking-[0.02em] text-green-700"
      chevronClassName="size-3 text-green-700"
    />
  );
}

/**
 * OccurrenceSelect (ContradictionCardExpanded) — full-width trigger with
 * absolutely-positioned chevron so long labels don't get clipped by the icon.
 *
 * What the custom classes achieve:
 *   triggerClassName: full width, fixed height h-8, overflow-hidden to clip
 *     long labels, relative positioning so the absolute chevron works, pr-8
 *     keeps text from sliding under the chevron.
 *   valueClassName: left-aligns the text (default is neutral; left is explicit
 *     for predictability).
 *   chevronClassName: takes the icon out of the flex flow via absolute
 *     positioning so it always sits at the right edge regardless of label length.
 *
 * Verdict: chevronClassName="absolute ..." is the only way to achieve this
 * layout — it cannot be replicated with triggerClassName alone. This is the
 * main reason chevronClassName exists.
 */
function OccurrenceOverflowDemo() {
  const [value, setValue] = useState('doc-1');
  return (
    <div className="w-72">
      <SelectMenu
        items={DOCUMENT_ITEMS}
        value={value}
        onChange={setValue}
        ariaLabel="Fundstelle"
        className="max-h-80 overflow-y-auto"
        triggerClassName="relative h-8 w-full justify-start overflow-hidden rounded-lg pr-8 pl-1 shadow-[0px_4px_16px_0px_rgba(2,6,23,0.1),0px_2px_4px_0px_rgba(2,6,23,0.1)]"
        valueClassName="text-left"
        chevronClassName="absolute right-1 top-1/2 -translate-y-1/2"
      />
    </div>
  );
}

/**
 * ProjectDetailsEditForm — form field usage with label association and
 * invalid state. The trigger uses default styles; `triggerClassName="w-full"`
 * is the only override needed in a form context.
 */
function FormSelectDemo() {
  const [value, setValue] = useState('bundesfernstrasse');
  const [invalid, setInvalid] = useState(false);
  const labelId = 'form-select-demo-label';
  return (
    <div className="flex w-64 flex-col gap-2">
      <label
        id={labelId}
        htmlFor="form-select-demo"
        className="text-sm font-medium text-slate-300"
      >
        Vorhabentyp *
      </label>
      <SelectMenu
        items={PROJECT_TYPES}
        value={value}
        onChange={setValue}
        id="form-select-demo"
        invalid={invalid}
        placeholder="Typ auswählen"
        ariaLabelledBy={labelId}
        triggerClassName="w-full"
      />
      <button
        type="button"
        className="self-start text-xs text-slate-500 underline"
        onClick={() => setInvalid((v) => !v)}
      >
        Toggle invalid state
      </button>
    </div>
  );
}

// ─── Story export ─────────────────────────────────────────────────────────────

export const SelectMenuStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Select Menu"
      description="Dark single-select built on Radix Select — full keyboard and screen reader support. Uses role=combobox + role=listbox (correct for value picking), not role=menu (correct for action menus). For multi-select, use ActionMenu with checkbox items."
    >
      <Story.Section title="Default">
        <DefaultDemo />
      </Story.Section>

      <Story.Section title="Placeholder / empty">
        <PlaceholderDemo />
      </Story.Section>

      <Story.Section title="Disabled">
        <DisabledDemo />
      </Story.Section>

      <Story.Section title="Pattern: compact badge trigger for document cards">
        <VersionBadgeDemo />
      </Story.Section>

      <Story.Section title="Pattern: full-width with absolute chevron">
        <OccurrenceOverflowDemo />
      </Story.Section>

      <Story.Section title="Pattern: form-input style">
        <FormSelectDemo />
      </Story.Section>
    </Story>
  );
};
SelectMenuStory.storyTitle = 'Select Menu';
