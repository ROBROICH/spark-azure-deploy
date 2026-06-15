import {
  ActionMenu,
  ActionMenuContent,
  ActionMenuItem,
  ActionMenuTrigger,
} from '@/features/ui/action-menu/ActionMenu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/features/ui/tooltip/Tooltip';
import { SidebarLabel } from '@/features/ui/sidebar/Sidebar';
import { cn } from '@/features/ui/style/cn';
import { CheckIcon, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type LanguageSwitcherProps = {
  className?: string;
  showLabel?: boolean;
};

const base = import.meta.env.BASE_URL;

const languages = [
  { code: 'de', name: 'Deutsch', flag: `${base}deutsch.svg` },
  { code: 'en', name: 'English', flag: `${base}english.svg` },
] as const;

export const LanguageSwitcher = (props: LanguageSwitcherProps) => {
  const { className = '', showLabel = false } = props;
  const { i18n, t } = useTranslation('shared');

  const currentLanguage =
    languages.find((lang) => lang.code === i18n.language) || languages[0];

  const trigger = (
    <ActionMenuTrigger
      className={cn(
        'focus-ring flex min-h-8 w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-left text-sm leading-[18px] font-medium text-slate-600 transition-[width,height,background-color,color,box-shadow,gap] duration-200 ease-linear hover:bg-neutral-white/70 hover:text-slate-900',
        'group-data-[theme=dark]:rounded-lg group-data-[theme=dark]:text-slate-300 group-data-[theme=dark]:hover:bg-slate-700/70 group-data-[theme=dark]:hover:text-white',
        'group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:gap-0 group-data-[side=left]:group-data-[collapsible=icon]:mr-auto group-data-[side=right]:group-data-[collapsible=icon]:mx-auto',
      )}
      aria-label={t('languageSwitcher.currentLanguage', {
        language: currentLanguage.name,
      })}
    >
      <img
        src={currentLanguage.flag}
        alt=""
        aria-hidden="true"
        width={16}
        height={16}
        className="size-4 shrink-0 rounded-full object-cover"
      />
      {showLabel ? <SidebarLabel>{currentLanguage.name}</SidebarLabel> : null}
      {showLabel ? (
        <span
          aria-hidden="true"
          className="ml-auto flex shrink-0 overflow-hidden transition-opacity duration-150 ease-linear group-data-[collapsible=icon]:opacity-0"
        >
          <ChevronDown className="size-4 shrink-0" />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="ml-auto flex shrink-0 overflow-hidden transition-opacity duration-150 ease-linear group-data-[collapsible=icon]:opacity-0"
        />
      )}
    </ActionMenuTrigger>
  );

  return (
    <div className={className}>
      <ActionMenu>
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right" align="center">
            {currentLanguage.name}
          </TooltipContent>
        </Tooltip>
        <ActionMenuContent align="end" className="z-9999 min-w-[150px]">
          {languages.map((lang) => {
            const isSelected = i18n.language === lang.code;
            return (
              <ActionMenuItem
                key={lang.code}
                className="gap-3"
                onSelect={() => i18n.changeLanguage(lang.code)}
                aria-label={
                  isSelected
                    ? t('languageSwitcher.selectedLanguage', {
                        language: lang.name,
                      })
                    : lang.name
                }
              >
                <img
                  src={lang.flag}
                  alt=""
                  aria-hidden="true"
                  width={16}
                  height={16}
                  className="size-4 rounded-full object-cover"
                />
                <span className="text-[11px] leading-[14px] font-medium tracking-[0.02em]">
                  {lang.name}
                </span>
                {isSelected && (
                  <CheckIcon size={12} className="ml-auto" aria-hidden="true" />
                )}
              </ActionMenuItem>
            );
          })}
        </ActionMenuContent>
      </ActionMenu>
    </div>
  );
};
