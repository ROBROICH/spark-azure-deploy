import type { ComponentProps, ReactNode } from 'react';

type RouterLinkProps = ComponentProps<'a'> & {
  params?: unknown;
  resetScroll?: boolean;
  search?: unknown;
  to: string;
};

type NavigateOptions<TCurrentSearch extends object, TNextSearch> = {
  replace?: boolean;
  resetScroll?: boolean;
  search: (currentSearch: TCurrentSearch) => TNextSearch;
};

type NavigateMock = {
  mock: {
    calls: unknown[][];
  };
};

export const MockRouterLink = (props: RouterLinkProps) => {
  const {
    children,
    params: _params,
    resetScroll: _resetScroll,
    search: _search,
    to,
    ...anchorProps
  } = props;

  return (
    <a href={to} {...anchorProps}>
      {children}
    </a>
  );
};

export const MockAlert = (props: ComponentProps<'div'>) => (
  <div>{props.children}</div>
);

export const MockAlertDescription = (props: ComponentProps<'div'>) => (
  <div>{props.children}</div>
);

export const MockAlertTitle = (props: ComponentProps<'div'>) => (
  <div>{props.children}</div>
);

export const MockButton = (
  props: ComponentProps<'button'> & {
    asChild?: boolean;
    iconOnly?: boolean;
    variant?: string;
  },
) => {
  const {
    asChild,
    children,
    iconOnly: _iconOnly,
    type = 'button',
    variant: _variant,
    ...buttonProps
  } = props;

  if (asChild) {
    return <>{children}</>;
  }

  return (
    <button type={type} {...buttonProps}>
      {children}
    </button>
  );
};

export const MockSwimlaneHeaderPortal = (props: { children: ReactNode }) => (
  <header>{props.children}</header>
);

export const createActionMenuMock = () => ({
  ActionMenu: (props: { children: ReactNode }) => <div>{props.children}</div>,
  ActionMenuContent: (props: { children: ReactNode }) => (
    <div>{props.children}</div>
  ),
  ActionMenuItem: (
    props: ComponentProps<'button'> & {
      variant?: string;
    },
  ) => {
    const { children, variant: _variant, ...buttonProps } = props;

    return (
      <button type="button" {...buttonProps}>
        {children}
      </button>
    );
  },
  ActionMenuTrigger: (props: { asChild?: boolean; children: ReactNode }) => (
    <>{props.children}</>
  ),
});

export const createLawChangeIndicatorMock = (lawChangeId: string) => {
  const LawChangeIndicator = (props: {
    jurabk: string;
    onOpen: (lawChange: { id: string }) => void;
    paragraphNr?: string | null;
  }) => (
    <button
      type="button"
      data-jurabk={props.jurabk}
      data-paragraph-nr={props.paragraphNr}
      onClick={() => props.onOpen({ id: lawChangeId })}
    >
      Rechtsänderung anzeigen
    </button>
  );

  return LawChangeIndicator;
};

export const createLawChangeIndicatorViewMock = (lawChangeId: string) => {
  const LawChangeIndicatorView = (props: {
    onOpen: (lawChange: { id: string }) => void;
  }) => (
    <button
      type="button"
      data-testid="law-change-indicator"
      onClick={() => props.onOpen({ id: lawChangeId })}
    >
      Law change
    </button>
  );

  return LawChangeIndicatorView;
};

export const getFirstNavigateSearch = <
  TCurrentSearch extends object,
  TNextSearch,
>(
  navigateMock: NavigateMock,
  currentSearch: TCurrentSearch,
) => {
  const navigateOptions = navigateMock.mock.calls[0]?.[0] as
    | NavigateOptions<TCurrentSearch, TNextSearch>
    | undefined;

  if (!navigateOptions) {
    throw new Error('Expected navigation options');
  }

  return {
    navigateOptions,
    nextSearch: navigateOptions.search(currentSearch),
  };
};
