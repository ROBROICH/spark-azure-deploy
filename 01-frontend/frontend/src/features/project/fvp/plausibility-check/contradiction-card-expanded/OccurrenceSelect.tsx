import type { ContradictionOccurrence } from '@/api-clients/pns-module';
import { SelectMenu } from '@/features/ui/select-menu/SelectMenu';

type OccurrenceSelectProps = {
  occurrences: ContradictionOccurrence[];
  selectedOccurrenceIndex: number;
  disabledOccurrenceIndex?: number;
  label: string;
  onChange: (occurrenceIndex: number) => void;
  getOccurrenceLabel: (occurrenceIndex: number) => string;
  getDocumentName: (occurrence: ContradictionOccurrence) => string;
};

export const OccurrenceSelect = (props: OccurrenceSelectProps) => {
  const {
    occurrences,
    selectedOccurrenceIndex,
    disabledOccurrenceIndex,
    label,
    onChange,
    getOccurrenceLabel,
    getDocumentName,
  } = props;

  const items = occurrences.map((occurrence, occurrenceIndex) => ({
    value: String(occurrenceIndex),
    label: getOccurrenceLabel(occurrenceIndex),
    ariaLabel: `${getOccurrenceLabel(occurrenceIndex)} · ${getDocumentName(occurrence)}`,
    disabled: occurrenceIndex === disabledOccurrenceIndex,
  }));
  const selectedItem = items[selectedOccurrenceIndex] ?? items.at(0);
  if (!selectedItem) {
    return null;
  }

  return (
    <SelectMenu
      items={items}
      value={selectedItem.value}
      onChange={(value: string) => {
        onChange(Number(value));
      }}
      ariaLabel={`${label}: ${selectedItem.ariaLabel}`}
      align="start"
      className="max-h-80 overflow-y-auto"
      triggerClassName="relative h-8 w-full justify-start overflow-hidden rounded-lg pr-8 pl-1 shadow-[0px_4px_16px_0px_rgba(2,6,23,0.1),0px_2px_4px_0px_rgba(2,6,23,0.1)]"
      valueClassName="text-left"
      chevronClassName="absolute right-1 top-1/2 -translate-y-1/2"
    />
  );
};
