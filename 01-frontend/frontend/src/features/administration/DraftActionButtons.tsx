import { Button } from '@/features/ui/button/Button';
import { useTranslation } from 'react-i18next';

export type DraftActionButtonsProps = {
  discardDisabled: boolean;
  saveDisabled: boolean;
  isSaving: boolean;
  onDiscard: () => void;
  onSave: () => void;
};

/**
 * Renders the shared discard and save controls used above and below the long
 * administration editors.
 */
export function DraftActionButtons(props: DraftActionButtonsProps) {
  const { discardDisabled, saveDisabled, isSaving, onDiscard, onSave } = props;
  const { t } = useTranslation('Administration');

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={discardDisabled}
        onClick={onDiscard}
      >
        {t('catalog.discard')}
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={saveDisabled}
        loading={isSaving}
        onClick={onSave}
      >
        {t('catalog.save')}
      </Button>
    </>
  );
}
