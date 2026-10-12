import { Button } from '@/features/ui/button/Button';
import { useTranslation } from 'react-i18next';

export type CatalogInitCardProps = {
  projectTypeName: string;
  isPending: boolean;
  persistError: string | null;
  onCreate: () => void;
};

export function CatalogInitCard(props: CatalogInitCardProps) {
  const { projectTypeName, isPending, persistError, onCreate } = props;
  const { t } = useTranslation('Administration');

  return (
    <section
      className="flex flex-col items-start gap-3 rounded-lg border-[0.5px] border-border-secondary bg-neutral-white p-4"
      aria-labelledby="catalog-init-heading"
    >
      <h2
        id="catalog-init-heading"
        className="text-base font-medium tracking-tight text-text-primary"
      >
        {t('catalog.init.title')}
      </h2>
      <p className="text-sm text-text-secondary">
        {t('catalog.init.description', { name: projectTypeName })}
      </p>
      {persistError ? (
        <p role="alert" className="text-sm text-error-900">
          {persistError}
        </p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={isPending}
        disabled={isPending}
        onClick={onCreate}
      >
        {t('catalog.init.createButton')}
      </Button>
    </section>
  );
}
