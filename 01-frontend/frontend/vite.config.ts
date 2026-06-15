import { URL, fileURLToPath } from 'node:url';

import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

import { tanstackRouter } from '@tanstack/router-plugin/vite';

const env = loadEnv('development', process.cwd(), '');

const DEFAULT_APP_BASE_PATH = '/app';
type ApiProxyService = {
  prefix: string;
  localTarget: string | undefined;
  stripPrefix?: boolean;
};

function normalizeAppBasePath(value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return DEFAULT_APP_BASE_PATH;
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '') || DEFAULT_APP_BASE_PATH;
}

/**
 * Creates Vite proxy rules for local port-forwarding mode.
 *
 * Requests are forwarded to local service ports.
 */
function createApiProxyConfig(
  apiMode: string,
  apiProxyServices: ApiProxyService[],
) {
  const proxy: Record<string, any> = {};

  for (const service of apiProxyServices) {
    if (apiMode === 'testing') {
      continue;
    }

    if (!service.localTarget) {
      throw new Error(
        `You need to set ${service.prefix} in your environment variables. See vite.config.ts`,
      );
    }

    const proxyConfig: Record<string, unknown> = {
      target: new URL(service.localTarget).origin,
      changeOrigin: true,
      configure(proxyServer: any) {
        proxyServer.on('proxyReq', (proxyReq: any) => {
          proxyReq.removeHeader('authorization');
        });
      },
    };

    if (service.stripPrefix !== false) {
      proxyConfig.rewrite = (requestPath: string) =>
        requestPath.replace(new RegExp(`^${service.prefix}`), '');
    }

    proxy[service.prefix] = proxyConfig;
  }

  return proxy;
}

const apiProxyServices: ApiProxyService[] = [
  { prefix: '/pls/v1', localTarget: env.VITE_PLS_OPENAPI_URL || '' },
  { prefix: '/dms/v1', localTarget: env.VITE_DMS_OPENAPI_URL || '' },
  { prefix: '/fcs/v1', localTarget: env.VITE_FCS_OPENAPI_URL || '' },
  {
    prefix: '/agent-orchestration/v1',
    localTarget: env.VITE_AOM_OPENAPI_URL || '',
  },
  {
    prefix: '/temporal',
    localTarget: env.VITE_TEMPORAL_JOBS_OPENAPI_URL || '',
    stripPrefix: false,
  },
  {
    prefix: '/plausibility-notes/v1',
    localTarget: env.VITE_PNS_OPENAPI_URL || '',
  },
  { prefix: '/oms/v1', localTarget: env.VITE_OMS_OPENAPI_URL || '' },
  {
    prefix: '/supplementary-requests/v1',
    localTarget: env.VITE_SUPPLEMENTARY_REQUESTS_OPENAPI_URL || '',
  },
  {
    prefix: '/comment/v1',
    localTarget: env.VITE_COMMENTS_OPENAPI_URL || '',
  },
  {
    prefix: '/examination/v1',
    localTarget: env.VITE_EXAMINATION_OPENAPI_URL || '',
  },
  {
    prefix: '/vae/v1',
    localTarget: env.VITE_VAE_OPENAPI_URL || '',
  },
  {
    prefix: '/law-changes/v1',
    localTarget: env.VITE_LAW_CHANGES_OPENAPI_URL || '',
  },
  {
    prefix: '/identity',
    localTarget: env.VITE_IDENTITY_MANAGEMENT_OPENAPI_URL || '',
  },
  {
    prefix: '/feedback/v1',
    localTarget: env.VITE_FEEDBACK_OPENAPI_URL || '',
  },
  {
    prefix: '/protocol/v1',
    localTarget: env.VITE_PROTOCOL_OPENAPI_URL || '',
  },
];

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  const apiMode = (env.VITE_DEV_API_MODE || 'port-forwarding').toLowerCase();
  const appBasePath = normalizeAppBasePath(env.VITE_APP_BASE_PATH);
  const appBasePathWithTrailingSlash = `${appBasePath}/`;

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
    server:
      command === 'build'
        ? undefined
        : {
            proxy: createApiProxyConfig(apiMode, apiProxyServices),
          },
    preview:
      command === 'build'
        ? undefined
        : {
            proxy: createApiProxyConfig(apiMode, apiProxyServices),
          },
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
