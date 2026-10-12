import { Button, type ButtonProps } from '@/features/ui/button/Button';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export type AdministrationDeleteButtonProps = {
  'aria-label': string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  iconOnly?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
  withIcon?: boolean;
};

export function AdministrationDeleteButton(
  props: AdministrationDeleteButtonProps,
) {
  const {
    'aria-label': ariaLabel,
    children,
    className,
    disabled,
    iconOnly = false,
    loading,
    onConfirm,
    size,
    variant = 'ghost',
    withIcon,
  } = props;
  const { t } = useTranslation('Administration');
  // eslint-disable-next-line no-restricted-syntax -- confirmation is ephemeral per-button interaction state that resets on blur
  const [confirmationRequested, setConfirmationRequested] = useState(false);

  if (confirmationRequested) {
    return (
      <Button
        type="button"
        variant="danger"
        size={size}
        className={className}
        disabled={disabled}
        loading={loading}
        aria-label={t('actions.confirmDelete')}
        onBlur={() => setConfirmationRequested(false)}
        onClick={() => {
          setConfirmationRequested(false);
          onConfirm();
        }}
      >
        {t('actions.confirmDelete')}
      </Button>
    );
  }

  if (iconOnly) {
    return (
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={disabled}
        loading={loading}
        iconOnly
        aria-label={ariaLabel}
        onClick={() => setConfirmationRequested(true)}
      >
        {children}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={disabled}
      loading={loading}
      withIcon={withIcon}
      aria-label={ariaLabel}
      onClick={() => setConfirmationRequested(true)}
    >
      {children}
    </Button>
  );
}
