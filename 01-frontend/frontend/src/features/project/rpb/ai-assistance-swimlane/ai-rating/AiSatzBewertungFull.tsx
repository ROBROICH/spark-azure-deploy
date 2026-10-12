import { useDescendantNodes } from '@/db/nodes/hooks/useDescendantNodes';
import type { NodePayloadByType, NodeRefByType } from '@/db/nodes/types';
import { usePdfPopout } from '@/features/project/pdf-popout/PdfPopoutWorkspaceContext';
import { Skeleton } from '@/features/ui/skeleton/Skeleton';
import { InjectReferenceLinks } from '@/features/ui/inject-reference-links/InjectReferenceLinks';
import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import { useNode } from '@/db/nodes/hooks/useNodes';
import { getRouteApi } from '@tanstack/react-router';
import { Scale } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AiBewertungReferencesCard,
  AiBewertungReferencesCardSkeleton,
} from './AiBewertungReferencesCard';
import {
  openBewertungReference,
  type ClickedKiReference,
} from './aiReferenceLinks';
import { formatSatzTitle } from '../shared/formatSatzTitle';
import { useBewertungReferencesData } from './useBewertungReferencesData';
import { useOpenRpbPreviewDocument } from '../shared/useOpenRpbPreviewDocument';

const route = getRouteApi('/verfahren/$verfahrenId/rpb');

const markdownContentClassName =
  'px-1 text-[13px] leading-[18px] font-normal tracking-[-0.13px] text-brand-950 [&_code]:rounded-md [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_em]:italic [&_h1]:mt-5 [&_h1]:mb-3 [&_h1]:text-[17px] [&_h1]:leading-6 [&_h1]:font-semibold [&_h1:first-child]:mt-0 [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-[15px] [&_h2]:leading-[22px] [&_h2]:font-semibold [&_h2:first-child]:mt-0 [&_h3]:mt-3 [&_h3]:mb-2 [&_h3]:text-[14px] [&_h3]:leading-5 [&_h3]:font-semibold [&_h3:first-child]:mt-0 [&_hr]:my-4 [&_hr]:border-border-primary [&_li]:ml-4 [&_li]:list-disc [&_ol]:mb-4 [&_ol]:space-y-1 [&_ol]:pl-5 [&_p]:mb-4 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:mb-4 [&_ul]:space-y-1 [&_ul]:pl-5';

const chapterTitleClassName =
  'px-1 text-[13px] leading-[18px] font-semibold tracking-[-0.13px] text-brand-950';

const satzTitleClassName =
  'mr-2 text-[13px] leading-[18px] font-medium tracking-[-0.13px] text-brand-950';

const satzTextClassName =
  'px-1 text-[13px] leading-[18px] font-normal tracking-[-0.13px] text-brand-950';

type AiSatzBewertungFullProps = {
  bewertungRef: NodeRefByType<'bewertung'>;
  summaryText: string;
};

const sortBewertungKapitel = (
  bewertungKapitel: NodePayloadByType<'bewertung_kapitel'>[],
) => {
  return [...bewertungKapitel].sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }

    return left.id.localeCompare(right.id);
  });
};

/**
 * Binds assessment markdown and reference cards to one selected Satz so inline
 * reference links and card actions share the same PDF popout behavior.
 */
export const AiSatzBewertungFull = (props: AiSatzBewertungFullProps) => {
  const { bewertungRef, summaryText } = props;
  const { t } = useTranslation('Rpb');
  const satzId = route.useSearch({
    select: (search) => search.satzId,
  });
  const { openConnectedFile, jumpToConnectedFilePage } = usePdfPopout();
  const openPreviewDocument = useOpenRpbPreviewDocument();
  const satzRef = satzId
    ? ({
        id: satzId,
        nodeType: 'satz',
      } satisfies NodeRefByType<'satz'>)
    : null;
  const { data: satz } = useNode(satzRef);
  const absatzRef = satz?.absatzId
    ? ({
        id: satz.absatzId,
        nodeType: 'absatz',
      } satisfies NodeRefByType<'absatz'>)
    : null;
  const { data: absatz } = useNode(absatzRef);
  const normRef = absatz?.normId
    ? ({
        id: absatz.normId,
        nodeType: 'norm',
      } satisfies NodeRefByType<'norm'>)
    : null;
  const satzRefs = useDescendants('satz', absatzRef);
  const absatzRefs = useDescendants('absatz', normRef);
  const { data: bewertungKapitel } = useDescendantNodes(
    'bewertung_kapitel',
    bewertungRef,
  );
  const sortedBewertungKapitel = sortBewertungKapitel(bewertungKapitel);
  const { documents, groups, references } = useBewertungReferencesData(
    bewertungRef,
    [summaryText, ...sortedBewertungKapitel.map((kapitel) => kapitel.markdown)],
  );

  const handleReferenceClick = (clickedReference: ClickedKiReference) => {
    openBewertungReference(
      clickedReference,
      documents,
      openPreviewDocument,
      jumpToConnectedFilePage,
      openConnectedFile,
    );
  };

  const satzTitle = formatSatzTitle(t, absatz, satz, {
    hasMultipleAbsaetze: absatzRefs.length > 1,
    hasMultipleSaetze: satzRefs.length > 1,
  });
  const satzText = satz?.text ?? '';
  const satzContextSection =
    satzTitle || satzText ? (
      <section className="space-y-1">
        {satzTitle ? (
          <div className="flex items-center gap-0.5 px-1">
            <p className={satzTitleClassName}>{satzTitle}</p>
            <Scale
              className="size-4 shrink-0 text-slate-600"
              aria-hidden="true"
            />
          </div>
        ) : null}
        {satzText ? <p className={satzTextClassName}>{satzText}</p> : null}
      </section>
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      {satzContextSection ? <hr className="border-border-primary" /> : null}
      {satzContextSection}
      {satzContextSection ? <hr className="border-border-primary" /> : null}
      <h3 className={chapterTitleClassName}>
        {t('aiAssistance.assessmentSummaryTitle')}
      </h3>
      <section className="space-y-2">
        <article className={markdownContentClassName}>
          <InjectReferenceLinks
            references={references}
            text={summaryText}
            format="text"
            onReferenceClick={handleReferenceClick}
          />
        </article>
      </section>
      <hr className="border-border-primary" />
      <h3 className={chapterTitleClassName}>
        {t('aiAssistance.assessmentDetailTitle')}
      </h3>
      {sortedBewertungKapitel.map((kapitel) => (
        <section key={kapitel.id} className="space-y-2">
          <article className={markdownContentClassName}>
            <InjectReferenceLinks
              references={references}
              text={kapitel.markdown}
              onReferenceClick={handleReferenceClick}
            />
          </article>
        </section>
      ))}
      {groups.length > 0 ? (
        <Suspense fallback={<AiBewertungReferencesCardSkeleton />}>
          <AiBewertungReferencesCard bewertungRef={bewertungRef} />
        </Suspense>
      ) : null}
    </div>
  );
};

export const AiSatzBewertungFullSkeleton = () => {
  return (
    <div className="space-y-4 px-1" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-10/12" />
        <Skeleton className="h-4 w-9/12" />
      </div>
      <AiBewertungReferencesCardSkeleton />
    </div>
  );
};
