import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';
import { useTranslation } from 'react-i18next';

const HEADER_CELL_CLASSES =
  'px-3 py-[11px] text-left text-[13px] font-medium leading-[18px] tracking-[-0.01em] text-text-primary';

export const DocumentsTableSkeleton = () => {
  const { t } = useTranslation('FormalCompletenessCheck');

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      <table className="w-full table-fixed border-collapse">
        <thead className="bg-slate-100">
          <tr className="border-b border-slate-200">
            <th scope="col" className={HEADER_CELL_CLASSES}>
              {t('redesign.documentsCard.headers.tableOfContents')}
            </th>
            <th scope="col" className={HEADER_CELL_CLASSES}>
              {t('redesign.documentsCard.headers.status')}
            </th>
            <th scope="col" className={HEADER_CELL_CLASSES}>
              {t('redesign.documentsCard.headers.documentType')}
            </th>
            <th scope="col" className={HEADER_CELL_CLASSES}>
              {t('redesign.documentsCard.headers.topic')}
            </th>
          </tr>
        </thead>
        <tbody {...skeletonListProps}>
          {Array.from({ length: 5 }, (_, index) => (
            <tr
              key={index}
              className="border-b border-slate-200 bg-neutral-white last:border-b-0"
            >
              <td className="px-3 py-2">
                <Skeleton className="h-5 w-5/6" />
              </td>
              <td className="px-3 py-2">
                <Skeleton className="h-5 w-24" />
              </td>
              <td className="px-3 py-2">
                <Skeleton className="h-5 w-32" />
              </td>
              <td className="px-3 py-2">
                <Skeleton className="h-5 w-28" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
