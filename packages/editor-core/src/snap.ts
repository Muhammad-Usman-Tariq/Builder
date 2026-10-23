import type { SnapGuide } from "./types.js";

export const SNAP_GRID_SIZE = 8;
export const SNAP_THRESHOLD = 6;

/**
 * Snaps a coordinate to the nearest grid line or target guide line.
 */
export function snapCoordinate(
  value: number,
  guides: number[] = [],
  threshold: number = SNAP_THRESHOLD
): { snapped: number; guide: number | null } {
  // Check exact guide lines first
  for (const guide of guides) {
    if (Math.abs(value - guide) <= threshold) {
      return { snapped: guide, guide };
    }
  }

  // Fallback: snap to 8px grid
  const gridSnap = Math.round(value / SNAP_GRID_SIZE) * SNAP_GRID_SIZE;
  if (Math.abs(value - gridSnap) <= threshold) {
    return { snapped: gridSnap, guide: gridSnap };
  }

  return { snapped: value, guide: null };
}

/**
 * Calculates element alignment guides for a moving element relative to reference bounding boxes.
 */
export function calculateAlignmentGuides(
  targetBox: { left: number; top: number; width: number; height: number },
  referenceBoxes: Array<{ left: number; top: number; width: number; height: number }>,
  threshold: number = SNAP_THRESHOLD
): {
  snappedLeft: number;
  snappedTop: number;
  guides: SnapGuide[];
} {
  let snappedLeft = targetBox.left;
  let snappedTop = targetBox.top;
  const guides: SnapGuide[] = [];

  const targetCenterX = targetBox.left + targetBox.width / 2;
  const targetRight = targetBox.left + targetBox.width;
  const targetCenterY = targetBox.top + targetBox.height / 2;
  const targetBottom = targetBox.top + targetBox.height;

  for (const ref of referenceBoxes) {
    const refCenterX = ref.left + ref.width / 2;
    const refRight = ref.left + ref.width;
    const refCenterY = ref.top + ref.height / 2;
    const refBottom = ref.top + ref.height;

    // Horizontal edges (vertical lines)
    if (Math.abs(targetBox.left - ref.left) <= threshold) {
      snappedLeft = ref.left;
      guides.push({ type: "vertical", position: ref.left });
    } else if (Math.abs(targetRight - refRight) <= threshold) {
      snappedLeft = refRight - targetBox.width;
      guides.push({ type: "vertical", position: refRight });
    } else if (Math.abs(targetCenterX - refCenterX) <= threshold) {
      snappedLeft = refCenterX - targetBox.width / 2;
      guides.push({ type: "vertical", position: refCenterX });
    }

    // Vertical edges (horizontal lines)
    if (Math.abs(targetBox.top - ref.top) <= threshold) {
      snappedTop = ref.top;
      guides.push({ type: "horizontal", position: ref.top });
    } else if (Math.abs(targetBottom - refBottom) <= threshold) {
      snappedTop = refBottom - targetBox.height;
      guides.push({ type: "horizontal", position: refBottom });
    } else if (Math.abs(targetCenterY - refCenterY) <= threshold) {
      snappedTop = refCenterY - targetBox.height / 2;
      guides.push({ type: "horizontal", position: refCenterY });
    }
  }

  return { snappedLeft, snappedTop, guides };
}
