# Translate Inside Feature Components

- Do not pass translated strings as props to feature components.
- Call `useTranslation` inside the feature component that renders the text.
- Keep translation keys close to where the text is displayed.
- Do not add label-prop plumbing like `fooLabel={t('...')}` just because a feature subcomponent was extracted; that extracted feature component should usually translate its own UI text.
- Generic components in `src/features/ui/` or `src/features/shared/` may still accept label props.

## Bad Example

```tsx
<NormCardItemMenu
  moreActionsLabel={t('NormCardItem.moreActions')}
  nachfordernLabel={t('NormCardItem.nachfordern')}
  addCommentLabel={t('NormCardItem.addComment')}
/>
```

## Good Example

```tsx
const NormCardItemMenu = (props: NormCardItemMenuProps) => {
  const { t } = useTranslation('MvpRedesign');

  return <ActionMenuItem>{t('NormCardItem.addComment')}</ActionMenuItem>;
};
```
