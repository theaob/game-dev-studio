/** Zooming and panning the office: the player's view on top of the framed shot of the room. */

/** An orthographic frustum, in camera units. */
export interface ViewRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** How far the player has zoomed in, and how far the view's centre is moved from the framed shot's centre. */
export interface ViewState {
  zoom: number;
  x: number;
  y: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

export const HOME_VIEW: ViewState = { zoom: 1, x: 0, y: 0 };

/** Keeps the zoom in range and the view inside the framed shot, so the room can't be dragged off screen. */
export function clampView(base: ViewRect, v: ViewState): ViewState {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom));
  const w = base.right - base.left;
  const h = base.top - base.bottom;
  const mx = (w - w / zoom) / 2;
  const my = (h - h / zoom) / 2;
  return { zoom, x: Math.max(-mx, Math.min(mx, v.x)), y: Math.max(-my, Math.min(my, v.y)) };
}

/** The frustum the camera should use for this view. */
export function viewRect(base: ViewRect, v: ViewState): ViewRect {
  const w = (base.right - base.left) / v.zoom;
  const h = (base.top - base.bottom) / v.zoom;
  const cx = (base.left + base.right) / 2 + v.x;
  const cy = (base.top + base.bottom) / 2 + v.y;
  return { left: cx - w / 2, right: cx + w / 2, top: cy + h / 2, bottom: cy - h / 2 };
}

/**
 * Zooms by `factor`, keeping the point under the finger or cursor where it is.
 * `u` and `w` are that point's position across and down the screen, from 0 to 1.
 */
export function zoomAt(base: ViewRect, v: ViewState, factor: number, u: number, w: number): ViewState {
  const r = viewRect(base, v);
  const px = r.left + u * (r.right - r.left);
  const py = r.top - w * (r.top - r.bottom);
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * factor));
  const nw = (base.right - base.left) / zoom;
  const nh = (base.top - base.bottom) / zoom;
  const cx = px - u * nw + nw / 2;
  const cy = py + w * nh - nh / 2;
  return clampView(base, { zoom, x: cx - (base.left + base.right) / 2, y: cy - (base.top + base.bottom) / 2 });
}

/** Moves the room with a drag of `du` and `dv` screen widths and heights. */
export function panBy(base: ViewRect, v: ViewState, du: number, dv: number): ViewState {
  const w = (base.right - base.left) / v.zoom;
  const h = (base.top - base.bottom) / v.zoom;
  return clampView(base, { zoom: v.zoom, x: v.x - du * w, y: v.y + dv * h });
}
