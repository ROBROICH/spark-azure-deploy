import type {
  NodePayloadByType,
  NodeRefByType,
  NodeTypeLiteral,
} from '@/db/nodes/types';
import { useDescendantNodes } from '@/db/nodes/hooks/useDescendantNodes';
import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import { LawChangeIndicator } from '@/features/project/law-changes/ui/LawChangeIndicator';
import { Alert, AlertDescription, AlertTitle } from '@/features/ui/alert/Alert';
import { Button } from '@/features/ui/button/Button';
import { SplitButton } from '@/features/ui/button/SplitButton';
import { SwimlaneHeaderPortal } from '@/features/ui/swimlanes/SwimlaneHeaderPortal';
import { useNode } from '@/db/nodes/hooks/useNodes';
import { getRouteApi, Link } from '@tanstack/react-router';
import { AlertCircle, ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AiTopicNormProvider,
  useKiTopicNormState,
} from '../../rechtsgrundlage/AiTopicNormContext';
import { formatSatzTitle } from '../../shared/formatSatzTitle';
import { AiSatzDetailSections } from './AiSatzDetailSections';
import {
  getBestimmteRechtsbegriffe,
  getRechtsfolgeBadges,
  getRechtsmethodikHeaderTitle,
  getSentenceTypeBadges,
  getTatbestandsmerkmale,
  getUnbestimmteRechtsbegriffe,
  getVerweise,
} from './aiSatzDetailViewModel';

const route = getRouteApi('/verfahren/$verfahrenId/rpb');

type BackToNormButtonProps = {
  verfahrenId: string;
};

const BackToNormButton = (props: BackToNormButtonProps) => {
  const { verfahrenId } = props;
  const { t } = useTranslation('Rpb');

  return (
    <Button
      asChild
      iconOnly
      variant="secondary"
      aria-label={t('aiAssistance.backToNorm')}
    >
      <Link
        to="/verfahren/$verfahrenId/rpb"
        params={{ verfahrenId }}
        search={(prev) => ({
          ...prev,
          rechtsmethodikSatzId: undefined,
        })}
        resetScroll={false}
        aria-label={t('aiAssistance.backToNorm')}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Link>
    </Button>
  );
};

const createNodeRef = <T extends NodeTypeLiteral>(
  id: string | null | undefined,
  nodeType: T,
) => {
  if (!id) {
    return null;
  }

  return {
    id,
    nodeType: nodeType,
  } satisfies NodeRefByType<T>;
};

type AiSatzDetailErrorStateProps = {
  headerTitle: string;
  headerTrailing?: ReactNode;
  showBackButton: boolean;
  verfahrenId: string;
};

const AiSatzDetailErrorState = (props: AiSatzDetailErrorStateProps) => {
  const { headerTitle, headerTrailing, showBackButton, verfahrenId } = props;
  const { t } = useTranslation('Rpb');

  return (
    <>
      <SwimlaneHeaderPortal>
        {showBackButton ? <BackToNormButton verfahrenId={verfahrenId} /> : null}
        <span className="min-w-0 flex-1 text-[13px] leading-[18px] font-medium tracking-[-0.13px] text-brand-950">
          {headerTitle}
        </span>
        {headerTrailing}
      </SwimlaneHeaderPortal>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>
            {t('aiAssistance.rechtsmethodikLoadErrorTitle')}
          </AlertTitle>
          <AlertDescription>
            {t('aiAssistance.rechtsmethodikLoadErrorDescription')}
          </AlertDescription>
        </Alert>
      </div>
    </>
  );
};

type SentenceCheckButtonProps = {
  satzId: string;
};

const SentenceCheckButton = (props: SentenceCheckButtonProps) => {
  const { satzId } = props;
  const { t } = useTranslation('Rpb');
  const { getSatzReviewStatus, isSatzChecked, toggleSatzChecked, topicNorm } =
    useKiTopicNormState();

  const satzReviewStatus = getSatzReviewStatus(satzId);
  const isChecked = isSatzChecked(satzId);
  const needsRevision = satzReviewStatus === 'needs_revision';

  return (
    <SplitButton
      size="md"
      checked={isChecked}
      disabled={topicNorm === null}
      checkedLabel={t('aiAssistance.sentenceChecked')}
      uncheckedLabel={t(
        needsRevision
          ? 'aiAssistance.sentenceNeedsRevision'
          : 'aiAssistance.checkSentence',
      )}
      onCheckedChange={() => toggleSatzChecked(satzId)}
    />
  );
};

type AiSatzDetailViewContentProps = {
  headerTrailing?: ReactNode;
};

const hasMultipleSaetzeInAbsatz = (saetze: NodePayloadByType<'satz'>[]) => {
  return new Set(saetze.map((satz) => satz.satzNr)).size > 1;
};

/**
 * Keeps the selected Satz, norm hierarchy, and legal-method descendants in one
 * Suspense read boundary so the header and sections use the same node snapshot.
 */
const AiSatzDetailViewContent = (props: AiSatzDetailViewContentProps) => {
  const { headerTrailing } = props;
  const { t } = useTranslation('Rpb');
  const { verfahrenId } = route.useParams();
  const { rechtsmethodikSatzId, topicNormId } = route.useSearch({
    select: (search) => ({
      rechtsmethodikSatzId: search.rechtsmethodikSatzId,
      topicNormId: search.topicNormId,
    }),
  });
  const navigate = route.useNavigate();
  const satzRef = createNodeRef(rechtsmethodikSatzId, 'satz');
  const { data: satz } = useNode(satzRef);
  const absatzRef = createNodeRef(satz?.absatzId, 'absatz');
  const { data: absatz } = useNode(absatzRef);
  const normRef = createNodeRef(absatz?.normId, 'norm');
  const { data: norm } = useNode(normRef);
  const gesetzRef = createNodeRef(norm?.gesetzId, 'gesetz');
  const { data: gesetz } = useNode(gesetzRef);
  const { data: saetze } = useDescendantNodes('satz', absatzRef);
  const absatzRefs = useDescendants('absatz', normRef);
  const { data: atomareTbms } = useDescendantNodes('atomares_tbm', satzRef);
  const { data: rechtsfolgen } = useDescendantNodes('rechtsfolge', satzRef);
  const { data: ermessensspielraeume } = useDescendantNodes(
    'ermessensspielraum',
    satzRef,
  );
  const { data: ermessensarten } = useDescendantNodes('ermessensart', satzRef);
  const { data: sollensanordnungen } = useDescendantNodes(
    'sollensanordnungen',
    satzRef,
  );
  const { data: bestimmteRechtsbegriffe } = useDescendantNodes(
    'bestimmter_rechtsbegriff',
    satzRef,
  );
  const { data: legaldefinitionen } = useDescendantNodes(
    'legaldefinition',
    satzRef,
  );
  const { data: unbestimmteRechtsbegriffe } = useDescendantNodes(
    'unbestimmter_rechtsbegriff',
    satzRef,
  );
  const { data: auslegungsvorschlaege } = useDescendantNodes(
    'auslegungsvorschlag',
    satzRef,
  );
  const { data: expliziteVerweise } = useDescendantNodes(
    'expliziter_verweis',
    satzRef,
  );

  const headerTitle = getRechtsmethodikHeaderTitle(gesetz, norm);
  const lawChangeIndicator =
    gesetz && norm ? (
      <LawChangeIndicator
        jurabk={gesetz.jurabk}
        paragraphNr={norm.paragraphNr}
        onOpen={(lawChange) => {
          navigate({
            to: '.',
            search: (prev) => ({
              ...prev,
              lawChangeId: lawChange.id,
            }),
            replace: true,
            resetScroll: false,
          });
        }}
      />
    ) : null;

  if (!rechtsmethodikSatzId || !satz || !absatz || !norm || !gesetz) {
    return (
      <AiSatzDetailErrorState
        headerTitle={headerTitle || t('aiAssistance.rechtsmethodikTitle')}
        headerTrailing={headerTrailing}
        showBackButton={Boolean(topicNormId)}
        verfahrenId={verfahrenId}
      />
    );
  }

  const sentenceTitle =
    formatSatzTitle(t, absatz, satz, {
      hasMultipleAbsaetze: absatzRefs.length > 1,
      hasMultipleSaetze: hasMultipleSaetzeInAbsatz(saetze),
    }) || t('aiAssistance.rechtsmethodikTitle');
  const typeBadges = getSentenceTypeBadges(satz);
  const tbmItems = getTatbestandsmerkmale(atomareTbms);
  const bestimmteBegriffe = getBestimmteRechtsbegriffe(
    bestimmteRechtsbegriffe,
    legaldefinitionen,
  );
  const unbestimmteBegriffe = getUnbestimmteRechtsbegriffe(
    unbestimmteRechtsbegriffe,
    auslegungsvorschlaege,
  );
  const rechtsfolgeBadges = getRechtsfolgeBadges(
    sollensanordnungen,
    ermessensspielraeume,
    ermessensarten,
  );
  const verweise = getVerweise(t, expliziteVerweise);
  const hasTatbestandsSection =
    tbmItems.length > 0 ||
    Boolean(satz.formel?.trim() || satz.wennDann?.trim());
  const logicSummary = satz.formel?.trim() || satz.wennDann?.trim() || null;

  return (
    <>
      <SwimlaneHeaderPortal>
        {topicNormId ? <BackToNormButton verfahrenId={verfahrenId} /> : null}
        <span className="min-w-0 flex-1 truncate text-[13px] leading-[18px] font-medium tracking-[-0.13px] text-brand-950">
          {headerTitle}
        </span>
        {lawChangeIndicator}
        {headerTrailing}
      </SwimlaneHeaderPortal>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
        <AiSatzDetailSections
          viewModel={{
            bestimmteBegriffe,
            hasTatbestandsSection,
            logicSummary,
            rechtsfolgen,
            rechtsfolgeBadges,
            sentenceText: satz.text,
            sentenceTitle,
            tbmItems,
            typeBadges,
            unbestimmteBegriffe,
            verweise,
          }}
        />
      </div>
    </>
  );
};

export const AiSatzDetailView = () => {
  const { rechtsmethodikSatzId, topicNormId } = route.useSearch({
    select: (search) => ({
      rechtsmethodikSatzId: search.rechtsmethodikSatzId,
      topicNormId: search.topicNormId,
    }),
  });
  const topicNormRef = createNodeRef(topicNormId, 'topic_norm');

  if (!rechtsmethodikSatzId || !topicNormRef) {
    return <AiSatzDetailViewContent />;
  }

  return (
    <AiTopicNormProvider topicNormRef={topicNormRef}>
      <AiSatzDetailViewContent
        headerTrailing={<SentenceCheckButton satzId={rechtsmethodikSatzId} />}
      />
    </AiTopicNormProvider>
  );
};
