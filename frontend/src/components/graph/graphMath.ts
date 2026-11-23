export const PX_PER_DAY = 11;
export const LEFT_MARGIN = 90;
export const TRUNK_Y = 470;

export function daysSince(startDate: string, targetDate: string): number {
  const s = new Date(`${startDate}T00:00:00Z`).getTime();
  const t = new Date(`${targetDate}T00:00:00Z`).getTime();
  return Math.round((t - s) / 86_400_000);
}

export function dateToX(rangeStart: string, date: string): number {
  return LEFT_MARGIN + daysSince(rangeStart, date) * PX_PER_DAY;
}

/**
 * Alternates branches cleanly above (side = -1) or below (side = 1) the main root trunk.
 */
export function alternatingY(side: -1 | 1, depth = 1): number {
  return TRUNK_Y + side * (225 + (depth - 1) * 90);
}
