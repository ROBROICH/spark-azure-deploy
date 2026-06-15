import { Badge } from '@/features/ui/badge/Badge';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/features/ui/tabs/Tabs';
import { useTranslation } from 'react-i18next';
import {
  RechtsmethodikAccordionSection,
  sectionBodyTextClassName,
  sectionBadgeClassName,
  sectionEyebrowClassName,
  sentenceTextClassName,
} from './AiSatzDetailSectionShared';
import {
  getLegalDefinitionSourceLabel,
  type RechtsmethodikBestimmterBegriff,
  type RechtsmethodikUnbestimmterBegriff,
} from './aiSatzDetailViewModel';

const rechtsbegriffTitleClassName = `${sentenceTextClassName} font-semibold`;

type BestimmteRechtsbegriffeSectionProps = {
  bestimmteBegriffe: RechtsmethodikBestimmterBegriff[];
};

const BestimmteRechtsbegriffeSection = (
  props: BestimmteRechtsbegriffeSectionProps,
) => {
  const { bestimmteBegriffe } = props;
  const { t } = useTranslation('Rpb');

  if (bestimmteBegriffe.length === 0) {
    return null;
  }

  return (
    <RechtsmethodikAccordionSection
      value="bestimmte-rechtsbegriffe"
      title={t('aiAssistance.sectionCount', {
        count: bestimmteBegriffe.length,
        label: t('aiAssistance.bestimmteRechtsbegriffeSectionTitle'),
      })}
    >
      <div className="space-y-4">
        {bestimmteBegriffe.map((entry) => {
          const sourceLabel = entry.definition
            ? getLegalDefinitionSourceLabel(t, entry.definition)
            : null;

          return (
            <article key={entry.term.id} className="space-y-2">
              <p className={rechtsbegriffTitleClassName}>
                {entry.term.begriff}
              </p>
              {entry.definition ? (
                <>
                  <p className={sectionBodyTextClassName}>
                    {entry.definition.definition}
                  </p>
                  {sourceLabel ? (
                    <Badge
                      variant="neutral"
                      size="small"
                      className={sectionBadgeClassName}
                    >
                      {sourceLabel}
                    </Badge>
                  ) : null}
                </>
              ) : null}
            </article>
          );
        })}
      </div>
    </RechtsmethodikAccordionSection>
  );
};

type UnbestimmteRechtsbegriffeSectionProps = {
  unbestimmteBegriffe: RechtsmethodikUnbestimmterBegriff[];
};

const UnbestimmteRechtsbegriffeSection = (
  props: UnbestimmteRechtsbegriffeSectionProps,
) => {
  const { unbestimmteBegriffe } = props;
  const { t } = useTranslation('Rpb');

  if (unbestimmteBegriffe.length === 0) {
    return null;
  }

  return (
    <RechtsmethodikAccordionSection
      value="unbestimmte-rechtsbegriffe"
      title={t('aiAssistance.sectionCount', {
        count: unbestimmteBegriffe.length,
        label: t('aiAssistance.unbestimmteRechtsbegriffeSectionTitle'),
      })}
    >
      <div className="space-y-4">
        {unbestimmteBegriffe.map((entry) => (
          <article key={entry.term.id} className="space-y-2">
            <p className={rechtsbegriffTitleClassName}>{entry.term.begriff}</p>
            {entry.methoden.length > 0 ? (
              <Tabs defaultValue={entry.methoden.at(0)?.id} className="gap-3">
                <div className="space-y-3 rounded-lg bg-neutral-50 p-3">
                  <TabsList
                    aria-label={entry.term.begriff}
                    className="w-full justify-start"
                  >
                    {entry.methoden.map((methode) => (
                      <TabsTrigger
                        key={methode.id}
                        value={methode.id}
                        variant="segmented"
                      >
                        {methode.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {entry.methoden.map((methode) => (
                    <TabsContent
                      key={methode.id}
                      value={methode.id}
                      className="space-y-3"
                    >
                      <div className="flex items-start gap-2">
                        <p
                          className={`min-w-0 flex-1 ${sectionBodyTextClassName}`}
                        >
                          {methode.text}
                        </p>
                        <span
                          className="h-10 w-1 shrink-0 rounded-full bg-slate-300"
                          aria-hidden="true"
                        />
                      </div>
                    </TabsContent>
                  ))}
                </div>
                {entry.gesamtauslegung ? (
                  <div className="space-y-2">
                    <p className={sectionEyebrowClassName}>
                      {t('aiAssistance.derivedInterpretationTitle')}
                    </p>
                    <p className={sectionBodyTextClassName}>
                      {entry.gesamtauslegung}
                    </p>
                  </div>
                ) : null}
              </Tabs>
            ) : null}
          </article>
        ))}
      </div>
    </RechtsmethodikAccordionSection>
  );
};

type AiSatzDetailRechtsbegriffeSectionsProps = {
  bestimmteBegriffe: RechtsmethodikBestimmterBegriff[];
  unbestimmteBegriffe: RechtsmethodikUnbestimmterBegriff[];
};

export const AiSatzDetailRechtsbegriffeSections = (
  props: AiSatzDetailRechtsbegriffeSectionsProps,
) => {
  const { bestimmteBegriffe, unbestimmteBegriffe } = props;

  return (
    <>
      <BestimmteRechtsbegriffeSection bestimmteBegriffe={bestimmteBegriffe} />
      <UnbestimmteRechtsbegriffeSection
        unbestimmteBegriffe={unbestimmteBegriffe}
      />
    </>
  );
};
