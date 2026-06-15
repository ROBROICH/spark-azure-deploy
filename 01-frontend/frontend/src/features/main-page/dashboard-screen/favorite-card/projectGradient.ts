/**
 * Deterministic gradient generator for project cards.
 *
 * Uses a curated set of harmonious gradient presets. The project UUID is hashed
 * to pick a preset — same ID always yields the same gradient.
 */

const GRADIENT_PRESETS = [
  // Brand → Sky
  'linear-gradient(135deg, #423EC4 0%, #60A5FA 100%)',
  // Blue → Purple-200
  'linear-gradient(135deg, #3B82F6 0%, #C4B5FD 100%)',
  // Purple → Sky
  'linear-gradient(135deg, #A855F7 0%, #7DD3FC 100%)',
  // Orange → Yellow
  'linear-gradient(135deg, #F97316 0%, #FDE047 100%)',
  // Red → Purple
  'linear-gradient(135deg, #EF4444 0%, #A855F7 100%)',
  // Green-600 → Sky
  'linear-gradient(135deg, #16A34A 0%, #7DD3FC 100%)',
  // Sky → Purple
  'linear-gradient(135deg, #7DD3FC 0%, #A855F7 100%)',
  // Yellow → Green-400
  'linear-gradient(135deg, #FDE047 0%, #4ADE80 100%)',
  // Green-400 → Blue
  'linear-gradient(135deg, #4ADE80 0%, #3B82F6 100%)',
  // Brand → Green-400
  'linear-gradient(135deg, #423EC4 0%, #4ADE80 100%)',
  // Orange → Red
  'linear-gradient(135deg, #F97316 0%, #EF4444 100%)',
  // Blue → Green-600
  'linear-gradient(135deg, #3B82F6 0%, #16A34A 100%)',
] as const;

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getProjectGradient(id: string): string {
  return (
    GRADIENT_PRESETS[hashString(id) % GRADIENT_PRESETS.length] ??
    GRADIENT_PRESETS[0]
  );
}
