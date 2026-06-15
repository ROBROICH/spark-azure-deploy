import { SplitButton } from '@/features/ui/button/SplitButton';
import { useTranslation } from 'react-i18next';

type TopicDocumentReviewButtonProps = {
  checked: boolean;
  className?: string;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export const TopicDocumentReviewButton = (
  props: TopicDocumentReviewButtonProps,
) => {
  const { checked, className, disabled, onCheckedChange } = props;
  const { t } = useTranslation('MvpRedesign');

  return (
    <SplitButton
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      uncheckedLabel={t('DocumentItem.sichten')}
      checkedLabel={t('DocumentItem.gesichtet')}
      className={className}
    />
  );
};
