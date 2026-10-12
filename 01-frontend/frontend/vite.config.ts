import { URL, fileURLToPath } from 'node:url';

import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';

import { tanstackRouter } from '@tanstack/router-plugin/vite';

const env = loadEnv('development', process.cwd(), '');

const DEFAULT_APP_BASE_PATH = '/app';
const apiProxyTarget = env.VITE_API_URL || '';
type ApiProxyService = {
  prefix: string;
  localTarget: string;
};

function normalizeAppBasePath(value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return DEFAULT_APP_BASE_PATH;
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '') || DEFAULT_APP_BASE_PATH;
}

function getProxyRewritePrefix(service: ApiProxyService): string {
  const targetPath = new URL(service.localTarget).pathname.replace(
    /\/openapi\.json$/,
    '',
  );
  const preservedPrefix = service.prefix.startsWith('/api')
    ? service.prefix
    : '';

  if (!targetPath || targetPath === '/') {
    return preservedPrefix;
  }

  return `${targetPath}${preservedPrefix}`;
}

function createApiProxyConfig(
  apiMode: string,
  apiProxyServices: ApiProxyService[],
) {
  const proxy: Record<string, ProxyOptions> = {};

  if (apiMode === 'testing') {
    return proxy;
  }

  for (const service of apiProxyServices) {
    if (!service.localTarget) {
      throw new Error(
        `You need to set ${service.prefix} in your environment variables. See vite.config.ts`,
      );
    }

    const proxyConfig: ProxyOptions = {
      target: new URL(service.localTarget).origin,
      changeOrigin: true,
      configure(proxyServer) {
        proxyServer.on('proxyReq', (proxyReq) => {
          proxyReq.removeHeader('authorization');
          if (apiMode === 'session-proxy') {
            proxyReq.removeHeader('origin');
          }
        });
      },
    };

    proxyConfig.rewrite = (requestPath: string) =>
      requestPath.replace(
        new RegExp(`^${service.prefix}`),
        getProxyRewritePrefix(service),
      );

    proxy[service.prefix] = proxyConfig;
  }

  return proxy;
}

const apiProxyServices: ApiProxyService[] = [
  {
    prefix: '/api/agent-orchestration/v1',
    localTarget: env.API_AOM_ORIGIN || apiProxyTarget,
  },
  {
    prefix: '/api/plausibility-notes/v1',
    localTarget: env.API_PNS_ORIGIN || apiProxyTarget,
  },
  {
    prefix: '/api/supplementary-requests/v1',
    localTarget: env.API_SUPPLEMENTARY_REQUESTS_ORIGIN || apiProxyTarget,
  },
  {
    prefix: '/api/internal/workflows',
    localTarget: env.API_TEMPORAL_JOBS_ORIGIN || apiProxyTarget,
  },
  {
    prefix: '/api/examination/v1',
    localTarget: env.API_EXAMINATION_ORIGIN || apiProxyTarget,
  },
  {
    prefix: '/api/feedback/v1',
    localTarget: env.API_FEEDBACK_ORIGIN || apiProxyTarget,
  },
  {
    prefix: '/api/comment/v1',
    localTarget: env.API_COMMENTS_ORIGIN || apiProxyTarget,
  },
  {
    prefix: '/api/protocol/v1',
    localTarget: env.API_PROTOCOL_ORIGIN || apiProxyTarget,
  },
  {
    prefix: '/api/temporal',
    localTarget: env.API_TEMPORAL_JOBS_ORIGIN || apiProxyTarget,
  },
  {
    prefix: '/api/identity',
    localTarget: env.API_IDENTITY_MANAGEMENT_ORIGIN || apiProxyTarget,
  },
  {
    prefix: '/api/fpp/v1',
    localTarget: env.API_FPP_ORIGIN || apiProxyTarget,
  },
  {
    prefix: '/api/dms/v1',
    localTarget: env.API_DMS_ORIGIN || apiProxyTarget,
  },
  {
    prefix: '/api/fcs/v1',
    localTarget: env.API_FCS_ORIGIN || apiProxyTarget,
  },
  {
    prefix: '/api/oms/v1',
    localTarget: env.API_OMS_ORIGIN || apiProxyTarget,
  },
  {
    prefix: '/api/pls/v1',
    localTarget: apiProxyTarget,
  },
  {
    prefix: '/api/vae/v1',
    localTarget: env.API_VAE_ORIGIN || apiProxyTarget,
  },
  {
    prefix: '/api',
    localTarget: apiProxyTarget,
  },
  {
    prefix: '/law-changes/v1',
    localTarget: env.VITE_LAW_CHANGES_OPENAPI_URL || '',
  },
];

export default defineConfig(({ command }) => {
  const apiMode = (env.VITE_DEV_API_MODE || 'port-forwarding').toLowerCase();
  const appBasePath = normalizeAppBasePath(env.VITE_APP_BASE_PATH);
  const appBasePathWithTrailingSlash = `${appBasePath}/`;
  const proxy =
    command === 'build'
      ? undefined
      : createApiProxyConfig(apiMode, apiProxyServices);

  return {
    base: appBasePathWithTrailingSlash,
    build:
      command === 'build'
        ? {
            rolldownOptions: {
              output: {
                minify: {
                  compress: {
                    dropConsole: true,
                    dropDebugger: true,
                  },
                },
              },
            },
          }
        : undefined,
    server: proxy === undefined ? undefined : { proxy },
    preview: proxy === undefined ? undefined : { proxy },
    envPrefix: ['VITE_', 'ALLOW_DEV_MODE'],
    plugins: [
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
      }),
      viteReact(),
      babel({
        presets: [reactCompilerPreset()],
      }),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        components: fileURLToPath(new URL('./src/features', import.meta.url)),
        ui: fileURLToPath(new URL('./src/features/ui', import.meta.url)),
      },
    },
  };
});
