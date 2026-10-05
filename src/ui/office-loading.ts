import type { OfficeView } from './office-view';

/** Whether this device can render the 3D office. */
export function hasWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    return !!(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Placeholder shown while the 3D office downloads. Ignores reactions until a real office is in. */
export class OfficeLoading implements OfficeView {
  readonly el: HTMLElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'office-loading';
    this.el.innerHTML = '<span>Setting up the office…</span>';
  }

  draw() {}
  celebrate() {}
  say() {}
  cheer() {}
}
