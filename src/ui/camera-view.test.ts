import { describe, expect, it } from 'vitest';
import { HOME_VIEW, MAX_ZOOM, panBy, viewRect, zoomAt } from './camera-view';

const base = { left: -4, right: 6, top: 8, bottom: -2 };

describe('office camera view', () => {
  it('shows the framed shot at the home view', () => {
    expect(viewRect(base, HOME_VIEW)).toEqual(base);
  });

  it('keeps the point under the finger fixed while zooming', () => {
    const v = zoomAt(base, HOME_VIEW, 2, 0.25, 0.75);
    const r = viewRect(base, v);
    expect(v.zoom).toBe(2);
    expect(r.left + 0.25 * (r.right - r.left)).toBeCloseTo(-1.5);
    expect(r.top - 0.75 * (r.top - r.bottom)).toBeCloseTo(0.5);
  });

  it('limits the zoom', () => {
    expect(zoomAt(base, HOME_VIEW, 100, 0.5, 0.5).zoom).toBe(MAX_ZOOM);
    expect(viewRect(base, zoomAt(base, HOME_VIEW, 0.01, 0.5, 0.5))).toEqual(base);
  });

  it("can't pan when zoomed out, and stays inside the framed shot when zoomed in", () => {
    expect(viewRect(base, panBy(base, HOME_VIEW, 0.5, 0.5))).toEqual(base);
    // Dragging left and down as far as it goes shows the right and top edges.
    const r = viewRect(base, panBy(base, { zoom: 2, x: 0, y: 0 }, -10, 10));
    expect(r.right).toBeCloseTo(base.right);
    expect(r.top).toBeCloseTo(base.top);
  });

  it('moves the room with the finger', () => {
    const v = panBy(base, { zoom: 2, x: 0, y: 0 }, 0.1, 0);
    // Dragging right shows more of the left side.
    expect(v.x).toBeCloseTo(-0.5);
  });

  it('pulls the view back in when zooming out near an edge', () => {
    const zoomedIn = panBy(base, { zoom: 3, x: 0, y: 0 }, 10, 0);
    const r = viewRect(base, zoomAt(base, zoomedIn, 0.6, 0, 0.5));
    expect(r.left).toBeGreaterThanOrEqual(base.left - 1e-9);
  });
});
