import { describe, expect, it } from 'vitest';
import { getEwmsLoadingPredictionDurationMs } from './ewmsLoadingPrediction';

const MS_PER_MINUTE = 60_000;

describe('getEwmsLoadingPredictionDurationMs', () => {
  it('estimates 30 minutes per 100 EWMS files', () => {
    expect(getEwmsLoadingPredictionDurationMs(100)).toBe(30 * MS_PER_MINUTE);
    expect(getEwmsLoadingPredictionDurationMs(250)).toBe(75 * MS_PER_MINUTE);
  });

  it('uses at least one file for the prediction duration', () => {
    expect(getEwmsLoadingPredictionDurationMs(0)).toBe(0.3 * MS_PER_MINUTE);
  });
});
