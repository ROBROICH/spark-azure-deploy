import type { NodePayloadByType } from '@/db/nodes/types';
import { Badge } from '@/features/ui/badge/Badge';
import { Accordion } from '@/features/ui/accordion/Accordion';
import { BookMarked } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  type RechtsmethodikVerweis,
  type RechtsmethodikBestimmterBegriff,
  type RechtsmethodikUnbestimmterBegriff,
} from './aiSatzDetailViewModel';
import { AiSatzDetailRechtsbegriffeSections } from './AiSatzDetailRechtsbegriffeSections';
import {
  ExpandableSectionText,
  RechtsmethodikAccordionSection,
  sectionBodyTextClassName,
  sectionBadgeClassName,
  sectionCardTitleClassName,
  sentenceTextClassName,
  sentenceTitleClassName,
} from './AiSatzDetailSectionShared';
import { NormTypeBadge } from './NormTypeBadge';
import type { NormTypeBadgeDescriptor } from './normTypeBadgeLabels';

type AiSatzDetailSectionsProps = {
  viewModel: {
    bestimmteBegriffe: RechtsmethodikBestimmterBegriff[];
    hasTatbestandsSection: boolean;
    logicSummary: string | null;
    rechtsfolgen: NodePayloadByType<'rechtsfolge'>[];
    rechtsfolgeBadges: string[];
    sentenceText: string;
    sentenceTitle: string;
    tbmItems: string[];
    typeBadges: NormTypeBadgeDescriptor[];
    unbestimmteBegriffe: RechtsmethodikUnbestimmterBegriff[];
    verweise: RechtsmethodikVerweis[];
  };
};

const SentenceIntroSection = (props: {
  sentenceTitle: string;
  sentenceText: string;
}) => {
  const { sentenceText, sentenceTitle } = props;

  return (
    <section className="space-y-3">
      <p className={sentenceTitleClassName}>{sentenceTitle}</p>
      <p className={sentenceTextClassName}>{sentenceText}</p>
    </section>
  );
};

const TypeSection = (props: { typeBadges: NormTypeBadgeDescriptor[] }) => {
  const { typeBadges } = props;
  const { t } = useTranslation('Rpb');

  if (typeBadges.length === 0) {
    return null;
  }

  return (
    <RechtsmethodikAccordionSection
      value="type"
      title={t('aiAssistance.typeSectionTitle')}
    >
      <div className="flex flex-wrap gap-1">
        {typeBadges.map((badge) => (
          <NormTypeBadge key={`${badge.kind}-${badge.value}`} badge={badge} />
        ))}
      </div>
    </RechtsmethodikAccordionSection>
  );
};

const TatbestandsmerkmaleSection = (props: {
  hasTatbestandsSection: boolean;
  logicSummary: string | null;
  tbmItems: string[];
}) => {
  const { hasTatbestandsSection, logicSummary, tbmItems } = props;
  const { t } = useTranslation('Rpb');

  if (!hasTatbestandsSection) {
    return null;
  }

  return (
    <RechtsmethodikAccordionSection
      value="tatbestandsmerkmale"
      title={t('aiAssistance.sectionCount', {
        count: tbmItems.length,
        label: t('aiAssistance.tatbestandsmerkmaleSectionTitle'),
      })}
    >
      <div className="space-y-1.5">
        {tbmItems.map((item) => (
          <p key={item} className={sectionBodyTextClassName}>
            {item}
          </p>
        ))}
        {logicSummary ? (
          <p className={`${sectionBodyTextClassName} pt-1`}>
            {t('aiAssistance.logicSummaryLabel', { logic: logicSummary })}
          </p>
        ) : null}
      </div>
    </RechtsmethodikAccordionSection>
  );
};

const RechtsfolgeSection = (props: {
  rechtsfolgen: NodePayloadByType<'rechtsfolge'>[];
  rechtsfolgeBadges: string[];
}) => {
  const { rechtsfolgen, rechtsfolgeBadges } = props;
  const { t } = useTranslation('Rpb');

  if (rechtsfolgen.length === 0 && rechtsfolgeBadges.length === 0) {
    return null;
  }

  return (
    <RechtsmethodikAccordionSection
      value="rechtsfolge"
      title={t('aiAssistance.rechtsfolgeSectionTitle')}
    >
      <div className="space-y-3">
        {rechtsfolgeBadges.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {rechtsfolgeBadges.map((badgeLabel) => (
              <Badge
                key={badgeLabel}
                variant="neutral"
                size="small"
                className={sectionBadgeClassName}
              >
                {badgeLabel}
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="space-y-2">
          {rechtsfolgen.map((rechtsfolge) => (
            <article
              key={rechtsfolge.id}
              className="flex items-center gap-2 rounded-lg bg-neutral-50 p-1"
            >
              <span className="inline-flex shrink-0 rounded-sm p-1 text-slate-700">
                <BookMarked className="size-4" aria-hidden="true" />
              </span>
              <p className={sectionCardTitleClassName}>{rechtsfolge.text}</p>
            </article>
          ))}
        </div>
      </div>
    </RechtsmethodikAccordionSection>
  );
};

const VerweiseSection = (props: { verweise: RechtsmethodikVerweis[] }) => {
  const { verweise } = props;
  const { t } = useTranslation('Rpb');

  if (verweise.length === 0) {
    return null;
  }

  return (
    <RechtsmethodikAccordionSection
      value="verweise"
      title={t('aiAssistance.sectionCount', {
        count: verweise.length,
        label: t('aiAssistance.verweiseSectionTitle'),
      })}
    >
      <div className="space-y-2">
        {verweise.map((verweis) => (
          <article
            key={verweis.id}
            className="flex items-center gap-2 rounded-lg bg-neutral-50 p-1"
          >
            <span className="inline-flex shrink-0 rounded-sm p-1 text-slate-700">
              <BookMarked className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <ExpandableSectionText
                text={verweis.label}
                textClassName={sectionCardTitleClassName}
              />
            </div>
          </article>
        ))}
      </div>
    </RechtsmethodikAccordionSection>
  );
};

export const AiSatzDetailSections = (props: AiSatzDetailSectionsProps) => {
  const {
    bestimmteBegriffe,
    hasTatbestandsSection,
    logicSummary,
    rechtsfolgen,
    rechtsfolgeBadges,
    sentenceText,
    sentenceTitle,
    tbmItems,
    typeBadges,
    unbestimmteBegriffe,
    verweise,
  } = props.viewModel;

  return (
    <div className="flex flex-col gap-4">
      <SentenceIntroSection
        sentenceTitle={sentenceTitle}
        sentenceText={sentenceText}
      />
      <Accordion
        type="multiple"
        defaultValue={[
          'type',
          ...(hasTatbestandsSection ? ['tatbestandsmerkmale'] : []),
          ...(rechtsfolgen.length > 0 || rechtsfolgeBadges.length > 0
            ? ['rechtsfolge']
            : []),
          ...(bestimmteBegriffe.length > 0 ? ['bestimmte-rechtsbegriffe'] : []),
          ...(unbestimmteBegriffe.length > 0
            ? ['unbestimmte-rechtsbegriffe']
            : []),
          ...(verweise.length > 0 ? ['verweise'] : []),
        ]}
        className="flex flex-col"
      >
        <TypeSection typeBadges={typeBadges} />
        <TatbestandsmerkmaleSection
          hasTatbestandsSection={hasTatbestandsSection}
          logicSummary={logicSummary}
          tbmItems={tbmItems}
        />
        <RechtsfolgeSection
          rechtsfolgen={rechtsfolgen}
          rechtsfolgeBadges={rechtsfolgeBadges}
        />
        <AiSatzDetailRechtsbegriffeSections
          bestimmteBegriffe={bestimmteBegriffe}
          unbestimmteBegriffe={unbestimmteBegriffe}
        />
        <VerweiseSection verweise={verweise} />
      </Accordion>
    </div>
  );
};
