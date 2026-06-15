import { FileClock, FileUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/features/ui/checkbox/Checkbox';

type DiffPanelHeaderBaseProps = {
  variant: 'old' | 'new';
};

type DiffPanelHeaderNewExtras = {
  selectableTotal: number;
  checkedState: boolean | 'mixed';
  onToggleAll: () => void;
};

type DiffPanelHeaderProps =
  | (DiffPanelHeaderBaseProps & { variant: 'old' })
  | (DiffPanelHeaderBaseProps & { variant: 'new' } & DiffPanelHeaderNewExtras);

const toCheckboxChecked = (
  checked: boolean | 'mixed',
): 'checked' | 'unchecked' | 'indeterminate' => {
  if (checked === 'mixed') {
    return 'indeterminate';
  }
  return checked ? 'checked' : 'unchecked';
};

/**
 * Renders the toolbar of one diff panel: title with icon, sort/filter
 * affordances, and on the new-side variant a select-all tri-state checkbox.
 *
 * @param props Variant flag plus, on the new variant, selection totals and the toggle-all callback.
 * @returns The header bar above one diff panel tree.
 */
export const DiffPanelHeader = (props: DiffPanelHeaderProps) => {
  const { t } = useTranslation('Project');
  const { variant } = props;

  const titleKey =
    variant === 'old'
      ? 'Documents.updateDocuments.diff.previousDocuments'
      : 'Documents.updateDocuments.diff.newDocuments';

  const HeaderIcon = variant === 'old' ? FileClock : FileUp;

  return (
    <div className="flex items-center gap-2 border-b border-slate-200 p-2">
      <span className="flex shrink-0 items-center justify-center rounded-lg bg-slate-200 p-2">
        <HeaderIcon aria-hidden className="size-4 text-slate-700" />
      </span>
      <h3 className="min-w-0 flex-1 truncate text-[13px] leading-[18px] font-medium tracking-[-0.01em] text-brand-navy">
        {t(titleKey)}
      </h3>
      {variant === 'new' && (
        <div className="ml-1 shrink-0">
          <Checkbox
            ariaLabel={t(
              props.checkedState === true
                ? 'Documents.updateDocuments.diff.deselectAll'
                : 'Documents.updateDocuments.diff.toggleAll',
            )}
            checked={toCheckboxChecked(props.checkedState)}
            disabled={props.selectableTotal === 0}
            onCheckedChange={props.onToggleAll}
          />
        </div>
      )}
    </div>
  );
};
