import { Input } from '@/features/ui/input/Input';
import { cn } from '@/features/ui/style/cn';
import { Search, X } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

const SEARCH_INPUT_MAX_LENGTH = 100;

export type SearchInputProps = {
  placeholder?: string;
  value?: string;
  onChange?: (query: string) => void;
  onClear?: () => void;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  inputLabel: string;
  searchOnEnter?: boolean;
  'aria-describedby'?: string;
};

export function SearchInput(props: SearchInputProps) {
  const { t } = useTranslation('shared');
  const {
    placeholder,
    value: controlledValue,
    onChange,
    onClear,
    className,
    inputClassName,
    disabled = false,
    inputLabel,
    searchOnEnter = true,
    'aria-describedby': ariaDescribedby,
  } = props;
  const [internalQuery, setInternalQuery] = React.useState('');

  const isControlled = controlledValue !== undefined;
  const query = isControlled ? controlledValue : internalQuery;

  const handleChange = (nextValue: string) => {
    if (!isControlled) {
      setInternalQuery(nextValue);
    }

    onChange?.(nextValue);
  };

  const handleClear = () => {
    if (!isControlled) {
      setInternalQuery('');
    }

    onChange?.('');
    onClear?.();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && searchOnEnter) {
      event.preventDefault();
      onChange?.(query);
    }
  };

  return (
    <div className={cn('relative flex-1', className)}>
      <Search
        className={cn(
          'absolute top-4.5 left-3 size-4 -translate-y-1/2',
          query ? 'text-brand-950' : 'text-text-secondary',
        )}
        strokeWidth={2.5}
        aria-hidden
      />
      <Input
        type="text"
        value={query}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
          handleChange(event.target.value)
        }
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={SEARCH_INPUT_MAX_LENGTH}
        className={cn('pr-9 pl-9', inputClassName)}
        aria-label={inputLabel}
        aria-describedby={ariaDescribedby}
      />
      {query && !disabled ? (
        <button
          type="button"
          onClick={handleClear}
          className="focus-ring absolute top-4.5 right-3 -translate-y-1/2 cursor-pointer rounded"
          aria-label={t('searchInput.deleteSearch')}
        >
          <X
            className="size-4 text-brand-950 transition-colors hover:text-brand-950"
            strokeWidth={2.5}
            aria-hidden
          />
        </button>
      ) : null}
    </div>
  );
}
