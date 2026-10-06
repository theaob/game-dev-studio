/**
 * One floating tooltip for every chart. Marks carry `data-tip="value|label|label"`;
 * hovering, tapping or focusing one shows it. Text goes in with textContent.
 */
export class ChartTooltip {
  private el: HTMLDivElement;
  private active: HTMLElement | null = null;
  private point: { x: number; y: number } | null = null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'chart-tip';
    this.el.setAttribute('role', 'status');
    this.el.hidden = true;
    document.body.appendChild(this.el);
    root.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') this.at(e.clientX, e.clientY);
    });
    root.addEventListener('pointerdown', (e) => this.at(e.clientX, e.clientY));
    root.addEventListener('pointerleave', () => this.hide());
    root.addEventListener('scroll', () => this.hide(), true);
    root.addEventListener('focusin', (e) => {
      const t = (e.target as HTMLElement).closest?.<HTMLElement>('[data-tip]');
      if (!t) return;
      const r = t.getBoundingClientRect();
      this.show(t, r.left + r.width / 2, r.top);
    });
    root.addEventListener('focusout', () => this.hide());
  }

  /** Re-shows the tooltip after the charts were re-rendered under a still pointer. */
  refresh() {
    if (this.point && this.active) this.at(this.point.x, this.point.y);
  }

  private at(x: number, y: number) {
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-tip]');
    if (!hit) {
      this.hide();
      return;
    }
    this.point = { x, y };
    this.show(hit, x, y);
  }

  private show(target: HTMLElement, x: number, y: number) {
    if (this.active !== target) {
      this.active?.classList.remove('tip-on');
      this.active = target;
      target.classList.add('tip-on');
      const [value, ...rest] = (target.dataset.tip ?? '').split('|');
      const strong = document.createElement('b');
      strong.textContent = value;
      this.el.replaceChildren(strong, ...rest.map((line) => Object.assign(document.createElement('span'), { textContent: line })));
    }
    this.el.hidden = false;
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    const left = Math.min(Math.max(8, x - w / 2), innerWidth - w - 8);
    const top = y - h - 14 < 8 ? y + 18 : y - h - 14;
    this.el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  hide() {
    this.active?.classList.remove('tip-on');
    this.active = null;
    this.point = null;
    this.el.hidden = true;
  }
}
