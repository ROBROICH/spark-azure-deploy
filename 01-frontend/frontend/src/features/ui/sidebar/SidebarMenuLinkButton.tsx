import {
  SidebarMenuButton,
  type SidebarMenuButtonVariantProps,
  type SidebarMenuTooltipProps,
} from './sidebar-menu-primitives';
import { createLink, type LinkComponent } from '@tanstack/react-router';
import * as React from 'react';

type SidebarMenuLinkButtonProps = React.ComponentPropsWithoutRef<'a'> & {
  isActive?: boolean;
  tooltip?: SidebarMenuTooltipProps;
} & SidebarMenuButtonVariantProps;

const SidebarMenuLinkButtonComponent = React.forwardRef<
  HTMLAnchorElement,
  SidebarMenuLinkButtonProps
>(function SidebarMenuLinkButtonComponent(props, ref) {
  const {
    children,
    isActive = false,
    tooltip,
    variant = 'default',
    color = 'default',
    size = 'default',
    className,
    ...anchorProps
  } = props;

  return (
    <SidebarMenuButton
      asChild
      isActive={isActive}
      tooltip={tooltip}
      variant={variant}
      color={color}
      size={size}
      className={className}
    >
      <a ref={ref} {...anchorProps}>
        {children}
      </a>
    </SidebarMenuButton>
  );
});

const CreatedSidebarMenuLinkButton = createLink(SidebarMenuLinkButtonComponent);

export const SidebarMenuLinkButton: LinkComponent<
  typeof SidebarMenuLinkButtonComponent
> = (props) => {
  return (
    <CreatedSidebarMenuLinkButton
      preload="intent"
      activeProps={{}}
      {...props}
    />
  );
};
