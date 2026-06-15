import { Info, Lock, RefreshCw, TriangleAlert } from 'lucide-react';
import { AiStatusChip } from '../ai/AiStatusChip';
import { Button } from '../button/Button';
import { IconChip } from '../icon-chip/IconChip';
import { InfoTooltip } from '../info-tooltip/InfoTooltip';
import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { TooltipWrapper } from '../tooltip/TooltipWrapper';
import { OverflowTooltip } from './Tooltip';

// ---------------------------------------------------------------------------
// Tooltip System — Component Catalogue
//
// Style: dark only (bg-slate-800, #1E293B). No light variant.
//
// Components:
//   TooltipWrapper   — behaviour wrapper, no visual output
//   OverflowTooltip  — shows only when child text overflows
//   InfoTooltip      — self-contained ? icon button
//   IconChip         — bordered icon chip, optional tooltip
//   AI status chip   — IconChip with purple sparkles
//
// Trigger rules:
//   • <button>                — trigger performs an action
//   • role="img" + tabIndex=0 — trigger is purely informational
//   • Never a plain <span>/<div> with no tabIndex
// ---------------------------------------------------------------------------

export const TooltipStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Tooltip System"
      description="All tooltip-providing components in one place. Every tooltip uses the dark style (bg-slate-800). Each section shows one component with all its valid usage patterns."
    >
      <Story.Section
        title="Tooltip Wrapper"
        description="Adds tooltip behaviour to any focusable child. No visual output of its own. The child IS the trigger."
      >
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-medium text-slate-500">
            button trigger
          </span>
          <TooltipWrapper content="Externe Norm – mehr erfahren">
            <button
              type="button"
              aria-label="Externe Norm"
              className="focus-ring inline-flex items-center justify-center rounded-full p-1 text-slate-500 hover:bg-slate-100"
            >
              <Info aria-hidden="true" className="size-4" />
            </button>
          </TooltipWrapper>
        </div>

        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-medium text-slate-500">
            Button component
          </span>
          <TooltipWrapper content="Aktualisieren" side="bottom">
            <Button type="button" aria-label="Aktualisieren" iconOnly>
              <RefreshCw aria-hidden="true" className="size-4" />
            </Button>
          </TooltipWrapper>
        </div>

        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-medium text-slate-500">
            role=img trigger
          </span>
          <TooltipWrapper content="Diese Norm hat eine KI-Bewertung">
            <span
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- tooltip trigger anchor; role="img" is intentional for a status indicator, tabIndex makes it keyboard-reachable
              tabIndex={0}
              role="img"
              aria-label="KI-Bewertung vorhanden"
              className="focus-ring inline-flex cursor-default items-center gap-1 rounded-[4px] bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-800"
            >
              ✦ KI
            </span>
          </TooltipWrapper>
        </div>
      </Story.Section>

      <Story.Section
        title="Overflow Tooltip"
        description="Tooltip appears only when child text is clipped by CSS truncation. Child must be focusable. Functionally identical to TooltipWrapper with onlyWhenOverflowing."
      >
        <div className="w-40">
          <OverflowTooltip
            content="Sehr langer Dateiname der nicht in die Spalte passt.pdf"
            side="top"
          >
            <span
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- tooltip trigger anchor inside TooltipTrigger asChild; tabIndex makes truncated text keyboard-accessible
              tabIndex={0}
              className="focus-ring block truncate rounded text-sm"
            >
              Sehr langer Dateiname der nicht in die Spalte passt.pdf
            </span>
          </OverflowTooltip>
        </div>
      </Story.Section>

      <Story.Section
        title="Info Tooltip"
        description="Renders its own <button> with a ? icon. No trigger decision needed — always accessible out of the box."
      >
        <InfoTooltip
          ariaLabel="Was sind Pflichtdokumente?"
          content="Pflichtdokumente müssen für die formelle Vollständigkeit hochgeladen werden."
        />

        <InfoTooltip
          ariaLabel="Was ist die Plausibilitätsprüfung?"
          content="Die Plausibilitätsprüfung analysiert die Dokumente auf inhaltliche Widersprüche. Das Ergebnis ist ein Hinweis, keine rechtliche Bewertung."
          tooltipMaxWidthClassName="max-w-[28rem]"
        />
      </Story.Section>

      <Story.Section
        title="Icon Chip"
        description='Bordered 25×25px icon chip with optional tooltip. Use as="button" for actions. Use as="span" + tabIndex={0} for status indicators.'
      >
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-medium text-slate-500">
            action + tooltip
          </span>
          <IconChip
            ariaLabel="Rechtsänderung öffnen"
            className="border-red-600 bg-red-50 text-red-800"
            icon={<TriangleAlert />}
            tooltip="Rechtsänderung betrifft diese Norm"
            onClick={() => {}}
          />
        </div>

        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-medium text-slate-500">
            action, no tooltip
          </span>
          <IconChip
            ariaLabel="Rechtsänderung anzeigen"
            className="border-red-600 bg-red-50 text-red-800"
            icon={<TriangleAlert />}
            onClick={() => {}}
          />
        </div>

        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-medium text-slate-500">
            status indicator
          </span>
          <IconChip
            as="span"
            ariaLabel="Schreibgeschützt"
            className="border-slate-400 bg-slate-50 text-slate-700"
            icon={<Lock />}
            tooltip="Nur Lesezugriff auf dieses Thema"
            tabIndex={0}
          />
        </div>
      </Story.Section>

      <Story.Section
        title="AI Status Chip"
        description="Icon chip pre-styled with purple sparkles gradient. Used as a status indicator with a tooltip, or as an interactive trigger when onClick is provided."
      >
        <AiStatusChip
          ariaLabel="KI-Unterstützung"
          tooltip="Dieses Thema verfügt über KI-Unterstützung"
        />
      </Story.Section>
    </Story>
  );
};

TooltipStory.storyTitle = 'Tooltip';
