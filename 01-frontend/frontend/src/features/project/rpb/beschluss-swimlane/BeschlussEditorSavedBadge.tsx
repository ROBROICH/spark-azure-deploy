import { useTranslation } from 'react-i18next';

export const BeschlussEditorSavedBadge = () => {
  const { t } = useTranslation('Rpb');

  return (
    <div
      role="status"
      className="flex h-6 items-center rounded border-[0.5px] border-green-600 bg-green-50 px-2"
    >
      <span className="text-[11px] leading-[14px] font-medium tracking-[0.02em] text-green-800">
        {t('beschluss.savedBadge')}
      </span>
    </div>
  );
};
