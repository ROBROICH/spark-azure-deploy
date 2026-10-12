import { Button } from '@/features/ui/button/Button';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { getCatalogApiErrorMessage } from '../catalog/catalogApiError';
import { catalogUsecaseQueryOptions } from '../catalog/usecaseQueries';
import { catalogExportPayload, downloadYamlFile } from './downloadYamlFile';
import { serializeYaml } from './yamlSerialize';

export type CatalogExportButtonProps = {
  projectTypeId: string;
};

/**
 * Downloads the latest four catalog documents as one YAML file from the
 * administration tab bar.
 */
export function CatalogExportButton(props: CatalogExportButtonProps) {
  const { projectTypeId } = props;
  const { t } = useTranslation('Administration');
  const catalogQuery = useQuery(catalogUsecaseQueryOptions(projectTypeId));
  const isMissing = catalogQuery.data?.kind === 'missing';
  const isBusy = catalogQuery.isFetching;

  const handleExport = async () => {
    const result = await catalogQuery.refetch();
    if (result.error) {
      toast.error(getCatalogApiErrorMessage(result.error) ?? t('export.error'));
      return;
    }

    const data = result.data;
    if (!data || data.kind !== 'ready') {
      toast.error(t('export.error'));
      return;
    }

    const yaml = serializeYaml(catalogExportPayload(data.usecase));
    downloadYamlFile(
      t('export.filename', { name: data.usecase.projekttyp.name }),
      yaml,
    );
    toast.success(t('export.success'));
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      iconOnly
      aria-label={t('export.button')}
      title={t('export.button')}
      disabled={catalogQuery.isPending || isMissing}
      loading={isBusy && catalogQuery.isFetched}
      onClick={() => {
        void handleExport();
      }}
    >
      <Download aria-hidden />
    </Button>
  );
}
