import { cn } from '@/features/ui/style/cn';
import {
  Close as PopoverClosePrimitive,
  Content as PopoverContentPrimitive,
  Portal as PopoverPortal,
  Root as PopoverRoot,
  Trigger as PopoverTriggerPrimitive,
} from '@radix-ui/react-popover';
import * as React from 'react';
import {
  POPUP_CONTENT_CLASSES,
  POPUP_CONTENT_STYLE,
} from '../style/popupStyles';

function Popover(props: React.ComponentProps<typeof PopoverRoot>) {
  return <PopoverRoot data-slot="popover" {...props} />;
}

function PopoverTrigger(
  props: React.ComponentProps<typeof PopoverTriggerPrimitive>,
) {
  return <PopoverTriggerPrimitive data-slot="popover-trigger" {...props} />;
}

function PopoverContent(
  props: React.ComponentProps<typeof PopoverContentPrimitive> & {
    container?: React.ComponentProps<typeof PopoverPortal>['container'];
  },
) {
  const {
    className,
    style,
    align = 'start',
    sideOffset = 4,
    container,
    ...rest
  } = props;

  return (
    <PopoverPortal container={container}>
      <PopoverContentPrimitive
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(POPUP_CONTENT_CLASSES, className)}
        style={{ ...POPUP_CONTENT_STYLE, ...style }}
        {...rest}
      />
    </PopoverPortal>
  );
}

function PopoverClose(
  props: React.ComponentProps<typeof PopoverClosePrimitive>,
) {
  return <PopoverClosePrimitive data-slot="popover-close" {...props} />;
}

export { Popover, PopoverClose, PopoverContent, PopoverTrigger };
