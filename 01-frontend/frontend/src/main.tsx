import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import { configureClients } from './integrations/api-clients/configureClients.ts';
import { isMaintenanceModeEnabled } from './features/shared/config/maintenanceMode.ts';
import { MaintenanceModePage } from './features/shared/error-states/MaintenanceModePage.tsx';
import './i18n/config';
import './i18n/types';
import {
  TanStackQueryProviderContext,
  router,
} from './integrations/router/router.tsx';
import { initSentry } from './integrations/sentry/initSentry.ts';
import * as TanStackQueryProvider from './integrations/tanstack-query/root-provider.tsx';
import './styles.css';

configureClients();
initSentry();

const maintenanceModeEnabled = isMaintenanceModeEnabled();

const rootElement = document.getElementById('app');
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      {maintenanceModeEnabled ? (
        <MaintenanceModePage />
      ) : (
        <TanStackQueryProvider.Provider {...TanStackQueryProviderContext}>
          <RouterProvider router={router} />
        </TanStackQueryProvider.Provider>
      )}
    </StrictMode>,
  );
}
