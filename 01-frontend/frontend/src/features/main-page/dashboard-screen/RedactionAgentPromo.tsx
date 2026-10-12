import { AiButton } from '@/features/ui/ai/AiButton';
import { FileLock2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type RedactionAgentPromoProps = {
  onTryNow: () => void;
};

/** Promotional banner that links to the redaction agent (Schwärzungsagent). */
export const RedactionAgentPromo = (props: RedactionAgentPromoProps) => {
  const { onTryNow } = props;
  const { t } = useTranslation('Dashboard');

  return (
    <div className="-mx-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-[var(--effect-gradient-ai-fill-primary-hover)] px-4 py-3">
        <span
          aria-hidden="true"
          className="bg-ai-gradient rounded-lg border-[0.5px] border-[var(--effect-gradient-ai-border-secondary)] p-2 shadow-elevated"
        >
          <FileLock2
            className="size-4 text-[var(--effect-gradient-ai-text-icon-primary)]"
            aria-hidden="true"
          />
        </span>
        <h2 className="text-ai-gradient flex-1 text-base leading-5 font-medium tracking-[-0.01em]">
          {t('schwarzagent')}
        </h2>
        <AiButton label={t('tryNow')} onClick={onTryNow} />
      </div>
    </div>
  );
};
