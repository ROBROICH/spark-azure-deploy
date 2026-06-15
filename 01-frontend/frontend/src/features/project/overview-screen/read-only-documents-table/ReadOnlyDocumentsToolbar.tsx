import { DebouncedSearchInput } from '@/features/ui/search-input/DebouncedSearchInput';
import { getRouteApi } from '@tanstack/react-router';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

const route = getRouteApi('/verfahren/$verfahrenId/');

type ReadOnlyDocumentsToolbarProps = {
  actions?: ReactNode;
};

export const ReadOnlyDocumentsToolbar = (
  props: ReadOnlyDocumentsToolbarProps,
) => {
  const { actions } = props;
  const { t } = useTranslation('Project');
  const search = route.useSearch({
    select: (currentSearch) => currentSearch.search ?? '',
  });
  const navigate = route.useNavigate();
  return (
    <div className="flex items-center gap-4">
      <div className="max-w-xl flex-1">
        <DebouncedSearchInput
          value={search}
          inputLabel={t('Documents.searchInputLabel')}
          onChange={(value) => {
            navigate({
              search: (prev) => ({
                ...prev,
                search: value || undefined,
              }),
              resetScroll: false,
              replace: true,
            });
          }}
          placeholder={t('Documents.searchPlaceholder')}
        />
      </div>
      {actions && <div className="ml-auto">{actions}</div>}
    </div>
  );
};
