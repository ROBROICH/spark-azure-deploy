import type React from 'react';
import { cn } from '@/features/ui/style/cn';
import {
  BODY_CLASSES,
  BODY_SUCCESS_TEXT_CLASSES,
  BODY_TEXT_COLOR,
  CARD_CLASSES,
  CARD_DEFAULT_CLASSES,
  CARD_SUCCESS_CLASSES,
  FOOTER_CLASSES,
  HEADER_CLASSES,
  HEADER_SUCCESS_CLASSES,
  HEADING_CLASSES,
  MENU_CLASSES,
  TITLE_TRUNCATE_CLASSES,
} from '../cardStyles';

type ArgumentCardVariant = 'default' | 'success';

type ArgumentCardProps = {
  variant?: ArgumentCardVariant;
  className?: string;
  children: React.ReactNode;
};

/**
 * Card shell for argument entries with variant-driven styling.
 *
 * Uses `data-variant` on the root and Tailwind `group-data-*` selectors
 * so child sub-components can react to the active variant without props.
 */
const ArgumentCard = (props: ArgumentCardProps) => {
  const { variant = 'default', className, children } = props;

  return (
    <div
      data-slot="argument-card"
      data-variant={variant}
      className={cn(
        CARD_CLASSES,
        CARD_DEFAULT_CLASSES,
        CARD_SUCCESS_CLASSES,
        className,
      )}
    >
      {children}
    </div>
  );
};

type ArgumentCardHeaderProps = {
  className?: string;
  children: React.ReactNode;
};

const ArgumentCardHeader = (props: ArgumentCardHeaderProps) => {
  const { className, children } = props;

  return (
    <div
      data-slot="argument-card-header"
      className={cn(
        HEADER_CLASSES,
        'pr-1 pl-3',
        HEADER_SUCCESS_CLASSES,
        className,
      )}
    >
      {children}
    </div>
  );
};

type ArgumentCardBadgeProps = {
  className?: string;
  children: React.ReactNode;
};

const ArgumentCardBadge = (props: ArgumentCardBadgeProps) => {
  const { className, children } = props;

  return (
    <span
      data-slot="argument-card-badge"
      className={cn('flex shrink-0 items-center justify-center', className)}
    >
      {children}
    </span>
  );
};

type ArgumentCardTitleProps = {
  className?: string;
  children: React.ReactNode;
};

// a11y: renders as <span> because the correct heading level depends on page context.
// Consumers should wrap the title in a heading element (<h2>, <h3>, etc.) if the card
// appears in a landmark where heading navigation is expected.
const ArgumentCardTitle = (props: ArgumentCardTitleProps) => {
  const { className, children } = props;

  return (
    <span
      data-slot="argument-card-title"
      className={cn(
        TITLE_TRUNCATE_CLASSES,
        HEADING_CLASSES,
        'bg-linear-to-b from-[rgba(147,51,234,1)] to-[rgba(88,28,135,1)] bg-clip-text text-transparent group-data-[variant=success]:bg-none group-data-[variant=success]:text-green-900',
        className,
      )}
    >
      {children}
    </span>
  );
};

type ArgumentCardMenuProps = {
  className?: string;
  children: React.ReactNode;
};

const ArgumentCardMenu = (props: ArgumentCardMenuProps) => {
  const { className, children } = props;

  return (
    <div data-slot="argument-card-menu" className={cn(MENU_CLASSES, className)}>
      {children}
    </div>
  );
};

type ArgumentCardBodyProps = {
  className?: string;
  children: React.ReactNode;
};

const ArgumentCardBody = (props: ArgumentCardBodyProps) => {
  const { className, children } = props;

  return (
    <div
      data-slot="argument-card-body"
      className={cn(
        'px-3 py-2',
        BODY_CLASSES,
        BODY_TEXT_COLOR,
        BODY_SUCCESS_TEXT_CLASSES,
        className,
      )}
    >
      {children}
    </div>
  );
};

type ArgumentCardMetadataProps = {
  className?: string;
  children: React.ReactNode;
};

const ArgumentCardMetadata = (props: ArgumentCardMetadataProps) => {
  const { className, children } = props;

  return (
    <div
      data-slot="argument-card-metadata"
      className={cn('flex h-8 items-center gap-2 px-1', className)}
    >
      {children}
    </div>
  );
};

type ArgumentCardTagsProps = {
  className?: string;
  children: React.ReactNode;
};

const ArgumentCardTags = (props: ArgumentCardTagsProps) => {
  const { className, children } = props;

  return (
    <div
      data-slot="argument-card-tags"
      className={cn('flex items-center gap-1', className)}
    >
      {children}
    </div>
  );
};

type ArgumentCardFooterProps = {
  className?: string;
  children: React.ReactNode;
};

const ArgumentCardFooter = (props: ArgumentCardFooterProps) => {
  const { className, children } = props;

  return (
    <div
      data-slot="argument-card-footer"
      className={cn(
        'flex items-center justify-between gap-2 px-1 py-1 *:only:ml-auto',
        FOOTER_CLASSES,
        className,
      )}
    >
      {children}
    </div>
  );
};

export {
  ArgumentCard,
  ArgumentCardHeader,
  ArgumentCardBadge,
  ArgumentCardTitle,
  ArgumentCardMenu,
  ArgumentCardBody,
  ArgumentCardMetadata,
  ArgumentCardTags,
  ArgumentCardFooter,
};
export type {
  ArgumentCardVariant,
  ArgumentCardProps,
  ArgumentCardHeaderProps,
  ArgumentCardBadgeProps,
  ArgumentCardTitleProps,
  ArgumentCardMenuProps,
  ArgumentCardBodyProps,
  ArgumentCardMetadataProps,
  ArgumentCardTagsProps,
  ArgumentCardFooterProps,
};
