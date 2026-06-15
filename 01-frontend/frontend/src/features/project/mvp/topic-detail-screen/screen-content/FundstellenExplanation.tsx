import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FundstellenSelectionBadge } from './FundstellenSelectionBadge';

type FundstellenExplanationProps = {
  selection:
    | { mode: 'empty' }
    | { mode: 'document'; documentLabel: string }
    | { mode: 'norm'; normLabel: string }
    | { mode: 'documentAndNorm'; documentLabel: string; normLabel: string };
  onClearDocument: () => void;
  onClearNorm: () => void;
};

export function FundstellenStateMessage(props: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border-primary px-4 py-6 text-[13px] leading-[18px] text-text-secondary">
      {props.children}
    </div>
  );
}

export function FundstellenExplanation(props: FundstellenExplanationProps) {
  const { selection, onClearDocument, onClearNorm } = props;
  const { t } = useTranslation('MvpRedesign');

  if (selection.mode === 'documentAndNorm') {
    const documentBadge = (
      <FundstellenSelectionBadge
        kind="document"
        label={selection.documentLabel}
        onRemove={onClearDocument}
      />
    );
    const normBadge = (
      <FundstellenSelectionBadge
        kind="norm"
        label={selection.normLabel}
        onRemove={onClearNorm}
      />
    );

    return (
      <div className="space-y-2 text-[13px] leading-[18px] text-text-secondary">
        <p className="flex flex-wrap items-center gap-y-1">
          <span>
            {t('FundstellenTabContent.selectedDocumentAndNorm.line2Start')}
          </span>
          <span className="mx-1">{normBadge}</span>
          <span>
            {t('FundstellenTabContent.selectedDocumentAndNorm.line2Middle')}
          </span>
          <span className="mr-0.5 ml-1">{documentBadge}</span>
          <span>
            {t('FundstellenTabContent.selectedDocumentAndNorm.line2End')}
          </span>
        </p>
      </div>
    );
  }

  if (selection.mode === 'document') {
    return (
      <div className="space-y-2 text-[13px] leading-[18px] text-text-secondary">
        <p className="flex flex-wrap items-center gap-y-1">
          <FundstellenSelectionBadge
            kind="document"
            label={selection.documentLabel}
            onRemove={onClearDocument}
          />
          <span className="ml-1">
            {t('FundstellenTabContent.selectedDocument.line1End')}
          </span>
        </p>
        <p>{t('FundstellenTabContent.selectedDocument.line2')}</p>
        <p>{t('FundstellenTabContent.selectedDocument.line3')}</p>
      </div>
    );
  }

  if (selection.mode === 'norm') {
    return (
      <div className="space-y-2 text-[13px] leading-[18px] text-text-secondary">
        <p className="flex flex-wrap items-center gap-y-1">
          <FundstellenSelectionBadge
            kind="norm"
            label={selection.normLabel}
            onRemove={onClearNorm}
          />
          <span className="ml-1">
            {t('FundstellenTabContent.selectedNorm.line1End')}
          </span>
        </p>
        <p>{t('FundstellenTabContent.selectedNorm.line2')}</p>
        <p>{t('FundstellenTabContent.selectedNorm.line3')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-[13px] leading-[18px] text-slate-800">
      <p>{t('FundstellenTabContent.empty.line1')}</p>
      <p>{t('FundstellenTabContent.empty.line2')}</p>
      <p>{t('FundstellenTabContent.empty.line3')}</p>
    </div>
  );
}
