import type {
  MvpCardColorConfig,
  MvpCardStatus,
} from '@/features/project/mvp/mvpTypes';

export const CARD_COLORS_BY_STATUS = {
  inProgress: {
    cardBg: 'bg-blue-50',
    cardBorder: 'border-blue-600',
    headerBg: 'bg-blue-100',
    textColor: 'text-blue-900',
    metricColor: 'text-blue-900',
  },
  complete: {
    cardBg: 'bg-green-50',
    cardBorder: 'border-green-600',
    headerBg: 'bg-green-100',
    textColor: 'text-green-900',
    metricColor: 'text-green-900',
  },
  open: {
    cardBg: 'bg-white',
    cardBorder: 'border-slate-400',
    headerBg: 'bg-slate-100',
    textColor: 'text-slate-600',
    metricColor: 'text-slate-600',
  },
} satisfies Record<MvpCardStatus, MvpCardColorConfig>;
