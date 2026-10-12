export function getProductAppLink(href: string) {
  const domain = [
    window.__APP_CONFIG__?.VITE_PRODUCT_DOMAIN,
    import.meta.env.VITE_PRODUCT_DOMAIN,
  ]
    .map((value) => value?.trim())
    .find((value) => value && !value.startsWith('__'));
  const url = new URL(href);
  const suffix = `.${domain}`;
  const host =
    domain && url.hostname.endsWith(suffix)
      ? /^(dashboard|ewms)(\.test|\.staging)?$/.exec(
          url.hostname.slice(0, -suffix.length),
        )
      : null;
  if (!host) {
    return null;
  }

  const product = host[1] === 'dashboard' ? 'ewms' : 'spark';
  url.hostname = `${product === 'ewms' ? 'ewms' : 'dashboard'}${host[2] ?? ''}${suffix}`;
  return { href: url.href, product };
}
