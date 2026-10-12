import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProductAppLink } from './productAppLink';

describe('counterpart deployment links', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PRODUCT_DOMAIN', 'example.com');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([
    ['dashboard.test', 'ewms.test', 'ewms'],
    ['ewms.test', 'dashboard.test', 'spark'],
    ['dashboard.staging', 'ewms.staging', 'ewms'],
    ['ewms.staging', 'dashboard.staging', 'spark'],
    ['dashboard', 'ewms', 'ewms'],
    ['ewms', 'dashboard', 'spark'],
  ])('links %s to %s without changing the route', (source, target, product) => {
    const route = '/app/verfahren/p%201/mvp?topic=a%2Fb&view=details#section-2';
    expect(getProductAppLink(`https://${source}.example.com${route}`)).toEqual({
      href: `https://${target}.example.com${route}`,
      product,
    });
  });

  it.each([
    'http://localhost:5198/app/',
    'https://dashboard.preview.example.com/app/',
    'https://dashboard.test.example.com.evil.example/app/',
    'https://dashboard.test.other.example/app/',
  ])('does not guess an environment for %s', (href) => {
    expect(getProductAppLink(href)).toBeNull();
  });

  it('prefers the domain injected at container start', () => {
    vi.stubGlobal('__APP_CONFIG__', {
      VITE_PRODUCT_DOMAIN: 'deployed.example',
    });
    expect(
      getProductAppLink('https://dashboard.deployed.example/app/'),
    ).toEqual({
      href: 'https://ewms.deployed.example/app/',
      product: 'ewms',
    });
  });

  it('offers no link when no product domain is configured', () => {
    vi.stubEnv('VITE_PRODUCT_DOMAIN', '');
    vi.stubGlobal('__APP_CONFIG__', {
      VITE_PRODUCT_DOMAIN: '__VITE_PRODUCT_DOMAIN__',
    });
    expect(getProductAppLink('https://dashboard.example.com/app/')).toBeNull();
  });
});
