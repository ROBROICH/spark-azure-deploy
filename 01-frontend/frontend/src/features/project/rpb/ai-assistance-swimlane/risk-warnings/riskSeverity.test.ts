import { describe, expect, it } from 'vitest';
import { getRiskSeverityInfo } from './riskSeverity';

describe('getRiskSeverityInfo', () => {
  it('maps severity >= 7 to the high tier', () => {
    expect(getRiskSeverityInfo(10).tier).toBe('high');
    expect(getRiskSeverityInfo(7).tier).toBe('high');
  });

  it('maps severity 4..6 to the medium tier', () => {
    expect(getRiskSeverityInfo(6).tier).toBe('medium');
    expect(getRiskSeverityInfo(4).tier).toBe('medium');
  });

  it('maps severity < 4 to the low tier', () => {
    expect(getRiskSeverityInfo(3).tier).toBe('low');
    expect(getRiskSeverityInfo(0).tier).toBe('low');
  });

  it('pairs badge variant and translation key with the tier', () => {
    expect(getRiskSeverityInfo(8).badgeVariant).toBe('riskHigh');
    expect(getRiskSeverityInfo(5).badgeVariant).toBe('riskMedium');
    expect(getRiskSeverityInfo(1).badgeVariant).toBe('riskLow');

    expect(getRiskSeverityInfo(8).labelKey).toBe('riskWarnings.severity.high');
    expect(getRiskSeverityInfo(5).labelKey).toBe(
      'riskWarnings.severity.medium',
    );
    expect(getRiskSeverityInfo(1).labelKey).toBe('riskWarnings.severity.low');
  });
});
