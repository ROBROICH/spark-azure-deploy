import { useControllableState } from '@/features/ui/state/useControllableState';
import { memo, useEffect, useRef } from 'react';
import { SearchInput } from './SearchInput';

export type DebouncedSearchInputProps = Omit<
  Parameters<typeof SearchInput>[0],
  'value' | 'onChange' | 'onClear'
> & {
  value: string;
  onChange: (value: string) => void;
  debounceMs?: number;
};

export const DebouncedSearchInput = memo((props: DebouncedSearchInputProps) => {
  const { value, onChange, debounceMs = 400, ...searchInputProps } = props;
  const [draftValue, setDraftValue] = useControllableState(value);
  const timeoutRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // eslint-disable-next-line no-restricted-syntax -- Debounced upstream reporting requires timeout cleanup across renders.
  useEffect(() => {
    if (draftValue === value) {
      return;
    }

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      onChangeRef.current(draftValue);
    }, debounceMs);

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [debounceMs, draftValue, value]);

  const handleChange = (nextValue: string) => {
    if (nextValue === draftValue && timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      onChangeRef.current(nextValue);
      return;
    }

    setDraftValue(nextValue);
  };

  const handleClear = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setDraftValue('');
    onChangeRef.current('');
  };
  return (
    <SearchInput
      {...searchInputProps}
      value={draftValue}
      onChange={handleChange}
      onClear={handleClear}
    />
  );
});

DebouncedSearchInput.displayName = 'DebouncedSearchInput';
