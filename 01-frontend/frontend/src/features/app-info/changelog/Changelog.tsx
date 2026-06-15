import { Card } from '@/features/ui/card/Card';
import { SafeMarkdown } from '@/features/ui/safe-markdown/SafeMarkdown';
import { useTranslation } from 'react-i18next';
import deChangelogMarkdown from './deChangelog.md?raw';
import enChangelogMarkdown from './enChangelog.md?raw';

const changelogContentClassName =
  'text-body max-w-none text-text-primary [&_blockquote]:border-l-4 [&_blockquote]:border-border-highlight [&_blockquote]:pl-4 [&_blockquote]:text-text-secondary [&_code]:rounded-md [&_code]:bg-bg-secondary [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.95em] [&_em]:italic [&_h1]:mb-6 [&_h1]:text-heading-xl [&_h1]:font-extrabold [&_h1]:text-text-primary [&_h1:first-child]:mt-0 [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:text-heading-l [&_h2]:font-extrabold [&_h2]:tracking-tight [&_h2]:text-text-primary [&_h2:first-child]:mt-0 [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:text-heading [&_h3]:font-bold [&_h3:first-child]:mt-0 [&_hr]:my-8 [&_hr]:border-border-primary [&_li]:mb-2 [&_ol]:mb-5 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-4 [&_strong]:font-semibold [&_ul]:mb-5 [&_ul]:list-disc [&_ul]:pl-6';

export function Changelog() {
  const { t, i18n } = useTranslation('Changelog');
  const changelogMarkdown = i18n.resolvedLanguage?.startsWith('en')
    ? enChangelogMarkdown
    : deChangelogMarkdown;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8 lg:px-12">
      <header className="space-y-2">
        <h1 className="text-heading-2xl text-text-primary">{t('title')}</h1>
        <p className="text-body text-text-secondary">{t('description')}</p>
      </header>

      <Card className="rounded-2xl border border-border-primary bg-bg-primary p-6 shadow-sm md:p-8">
        <SafeMarkdown
          as="article"
          className={changelogContentClassName}
          hrefMode="escape"
        >
          {changelogMarkdown}
        </SafeMarkdown>
      </Card>
    </main>
  );
}
