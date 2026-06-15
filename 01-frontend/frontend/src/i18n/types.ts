import 'react-i18next';
import type { resources } from './resources';

// Extend react-i18next module with custom types for full TypeScript support
declare module 'react-i18next' {
  interface CustomTypeOptions {
    defaultNS: 'shared';
    resources: (typeof resources)['de'];
  }
}
