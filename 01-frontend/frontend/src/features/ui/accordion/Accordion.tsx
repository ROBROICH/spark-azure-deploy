import { cn } from '@/features/ui/style/cn';
import {
  Content as AccordionContentPrimitive,
  Header as AccordionHeader,
  Item as AccordionItemPrimitive,
  Root as AccordionRoot,
  Trigger as AccordionTriggerPrimitive,
} from '@radix-ui/react-accordion';
import { ChevronRight } from 'lucide-react';

const DEFAULT_INDENT_PX = 16;

type AccordionMultipleProps = {
  type?: 'multiple';
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
} & Omit<
  React.ComponentProps<typeof AccordionRoot>,
  'type' | 'value' | 'defaultValue' | 'onValueChange'
>;

type AccordionSingleProps = {
  type: 'single';
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  collapsible?: boolean;
} & Omit<
  React.ComponentProps<typeof AccordionRoot>,
  'type' | 'value' | 'defaultValue' | 'onValueChange' | 'collapsible'
>;

type AccordionProps = AccordionMultipleProps | AccordionSingleProps;

function Accordion(props: AccordionProps) {
  const { type = 'multiple', ...rest } = props;

  // Radix uses a discriminated union on `type` that prevents spreading the
  // full props object directly. We branch on the literal type so each
  // render path satisfies the union without losing runtime safety.
  if (type === 'single') {
    return (
      <AccordionRoot
        data-slot="accordion"
        type="single"
        {...(rest as Omit<AccordionSingleProps, 'type'>)}
      />
    );
  }

  return (
    <AccordionRoot
      data-slot="accordion"
      type="multiple"
      {...(rest as Omit<AccordionMultipleProps, 'type'>)}
    />
  );
}

type AccordionItemProps = React.ComponentProps<
  typeof AccordionItemPrimitive
> & {
  /** Nesting depth. Adds `level * 16px` of left padding. Defaults to 0. */
  level?: number;
};

function AccordionItem(props: AccordionItemProps) {
  const { className, level = 0, style, ...rest } = props;

  return (
    <AccordionItemPrimitive
      data-slot="accordion-item"
      className={cn('group/accordion-item', className)}
      style={
        level > 0 ? { paddingLeft: level * DEFAULT_INDENT_PX, ...style } : style
      }
      {...rest}
    />
  );
}

function AccordionTrigger(
  props: React.ComponentProps<typeof AccordionTriggerPrimitive>,
) {
  const { className, ...rest } = props;

  return (
    <AccordionHeader data-slot="accordion-header" className="flex" asChild>
      <div>
        <AccordionTriggerPrimitive
          data-slot="accordion-trigger"
          className={cn(
            'focus-ring cursor-pointer rounded-sm disabled:pointer-events-none disabled:opacity-50',
            className,
          )}
          {...rest}
        />
      </div>
    </AccordionHeader>
  );
}

function AccordionContent(
  props: React.ComponentProps<typeof AccordionContentPrimitive>,
) {
  const { className, children, ...rest } = props;

  return (
    <AccordionContentPrimitive
      data-slot="accordion-content"
      className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
      {...rest}
    >
      <div data-slot="accordion-content-inner" className={cn(className)}>
        {children}
      </div>
    </AccordionContentPrimitive>
  );
}

function AccordionChevron(props: React.ComponentProps<'span'>) {
  const { className, ...rest } = props;

  return (
    <span
      data-slot="accordion-chevron"
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 transition-transform duration-200 group-data-[state=open]/accordion-item:rotate-90',
        className,
      )}
      {...rest}
    >
      <ChevronRight className="size-4" />
    </span>
  );
}

export {
  Accordion,
  AccordionChevron,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
};
