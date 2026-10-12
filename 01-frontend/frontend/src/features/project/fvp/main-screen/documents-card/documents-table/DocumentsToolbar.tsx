import { DOCUMENT_STATUS } from '@/features/project/data/document-tree/documentTree.types';
import { useAvailableDocumentTypes } from '@/features/project/fvp/main-screen/data/read-model/useRequiredDocuments';
import {
  FilterPillSelect,
  type FilterPillSelectOption,
} from '@/features/ui/filter-pill-select/FilterPillSelect';
import { DebouncedSearchInput } from '@/features/ui/search-input/DebouncedSearchInput';
import { getRouteApi } from '@tanstack/react-router';
import { ListFilter } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const route = getRouteApi('/verfahren/$verfahrenId/fvp/documents/');

const STATUS_FILTER_OPTIONS = [
  {
    value: DOCUMENT_STATUS.assigned,
    labelKey: 'DocumentsCard.toolbar.statusFilter.assigned',
  },
  {
    value: DOCUMENT_STATUS.unassigned,
    labelKey: 'DocumentsCard.toolbar.statusFilter.unassigned',
  },
  {
    value: DOCUMENT_STATUS.onRequestList,
    labelKey: 'DocumentsCard.toolbar.statusFilter.onRequestList',
  },
] as const;

type DocumentsToolbarProps = {
  disabled?: boolean;
};

type StatusFilterValue = (typeof STATUS_FILTER_OPTIONS)[number]['value'];

/** Route-backed search and status/document-type filter controls for the FVP documents table. */
export const DocumentsToolbar = (props: DocumentsToolbarProps) => {
  const { disabled = false } = props;
  const { t } = useTranslation('FormalCompletenessCheck');
  const {
    search = '',
    statusFilter,
    documentTypeFilter,
  } = route.useSearch({
    select: (routeSearch) => ({
      search: routeSearch.search,
      statusFilter: routeSearch.statusFilter,
      documentTypeFilter: routeSearch.documentTypeFilter,
    }),
  });
  const navigate = route.useNavigate();
  const { verfahrenId } = route.useParams();
  const { documentTypes: availableDocumentTypes } =
    useAvailableDocumentTypes(verfahrenId);

  const statusOptions: FilterPillSelectOption<StatusFilterValue>[] =
    STATUS_FILTER_OPTIONS.map((option) => ({
      value: option.value,
      label: t(option.labelKey),
    }));

  const documentTypeOptions: FilterPillSelectOption<string>[] =
    availableDocumentTypes.map((docType) => ({
      value: docType.id,
      label: docType.name,
    }));

  const selectedStatusLabel = statusOptions.find(
    (option) => option.value === statusFilter,
  )?.label;
  const selectedDocumentTypeLabel = documentTypeOptions.find(
    (option) => option.value === documentTypeFilter,
  )?.label;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DebouncedSearchInput
        value={search}
        inputLabel={t('redesign.documentsCard.searchInputLabel')}
        onChange={(value) => {
          navigate({
            search: (prev) => ({
              ...prev,
              search: value || undefined,
            }),
            replace: true,
            resetScroll: false,
          });
        }}
        placeholder={t('redesign.documentsCard.searchPlaceholder')}
        disabled={disabled}
        className="max-w-[540px] min-w-[280px]"
      />
      <div className="ml-auto flex items-center gap-4">
        <FilterPillSelect
          icon={<ListFilter className="size-4" />}
          label={t('DocumentsCard.toolbar.status')}
          labelMode="static"
          triggerAriaLabel={
            selectedStatusLabel
              ? t('redesign.documentsCard.toolbar.statusAriaLabelWithValue', {
                  value: selectedStatusLabel,
                })
              : t('DocumentsCard.toolbar.status')
          }
          clearAriaLabel={t('redesign.documentsCard.toolbar.clearStatusFilter')}
          options={statusOptions}
          value={statusFilter as StatusFilterValue | undefined}
          onValueChange={(next) => {
            navigate({
              search: (prev) => ({
                ...prev,
                statusFilter: next,
              }),
              replace: true,
              resetScroll: false,
            });
          }}
          align="end"
          disabled={disabled}
        />
        <FilterPillSelect
          icon={<ListFilter className="size-4" />}
          label={t('DocumentsCard.toolbar.documentType')}
          labelMode="static"
          triggerAriaLabel={
            selectedDocumentTypeLabel
              ? t(
                  'redesign.documentsCard.toolbar.documentTypeAriaLabelWithValue',
                  { value: selectedDocumentTypeLabel },
                )
              : t('DocumentsCard.toolbar.documentType')
          }
          clearAriaLabel={t(
            'redesign.documentsCard.toolbar.clearDocumentTypeFilter',
          )}
          options={documentTypeOptions}
          value={documentTypeFilter}
          onValueChange={(next) => {
            navigate({
              search: (prev) => ({
                ...prev,
                documentTypeFilter: next,
              }),
              replace: true,
              resetScroll: false,
            });
          }}
          align="end"
          disabled={disabled}
        />
      </div>
    </div>
  );
};
