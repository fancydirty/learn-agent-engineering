export type ScrollState = "shown" | "hidden";

/**
 * Decide masthead visibility from scroll positions.
 * - Always shown while within the header band (y <= headerHeight).
 * - Hidden only when scrolling DOWN by more than `threshold`.
 * - Shown when scrolling up (any amount past threshold).
 * - Jitter below threshold keeps it shown.
 */
export function scrollDirection(prevY: number, nextY: number, headerHeight: number, threshold: number): ScrollState {
  if (nextY <= headerHeight) return "shown";
  const delta = nextY - prevY;
  if (delta > threshold) return "hidden";
  if (delta < -threshold) return "shown";
  return "shown";
}
