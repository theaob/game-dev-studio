/**
 * Small SVG charts for game results. Every mark that carries a value has a
 * `data-tip` ("value|label|label") that app.ts shows as a tooltip on hover or tap.
 */
import { SALES_WEEKS } from '../core/sim';
import { cumulativeRevenue, paybackWeek, profit, totalCost, verdict } from '../core/results';
import { yearOf } from '../core/time';
import type { ReleasedGame, Spend } from '../core/types';
import { esc, money, num } from './format';

/** Chart colours, checked for colour-blind separation against the card surface. */
const MONEY = '#2f7fc1';
const LOSS = '#dc4b2a';
const SURFACE = '#fff8ea';
const SPEND_COLORS: Record<keyof Spend, string> = { budget: '#8b56c9', marketing: '#d9821b', team: '#2f7fc1' };
const SPEND_LABELS: Record<keyof Spend, string> = { budget: 'Budget & license', marketing: 'Marketing', team: 'Team & rent' };

const tip = (lines: string[]) => `data-tip="${esc(lines.join('|'))}" tabindex="0"`;

/** A short money label for axes: $0, $250K, $1.5M. */
function axisMoney(v: number): string {
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1e9) return `${sign}$${+(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}$${+(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}K`;
  return `${sign}$${Math.round(a)}`;
}

/** A round step so that `max` spans about `count` gridlines. */
function niceStep(max: number, count = 3): number {
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
}

/** A column path with a 4px rounded data end and a square base. Negative heights grow downwards. */
function column(x: number, base: number, w: number, h: number): string {
  if (Math.abs(h) < 0.5) return '';
  const r = Math.min(4, w / 2, Math.abs(h));
  if (h > 0) {
    const top = base - h;
    return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`;
  }
  const bottom = base - h;
  return `M${x},${base}V${bottom - r}Q${x},${bottom} ${x + r},${bottom}H${x + w - r}Q${x + w},${bottom} ${x + w},${bottom - r}V${base}Z`;
}

const W = 320;
const PAD = { l: 44, r: 12, t: 14, b: 22 };

/** Money made over time, against what the game cost: where the line crosses, it has paid for itself. */
export function moneyChart(g: ReleasedGame): string {
  const cum = cumulativeRevenue(g);
  if (cum.length < 2) return '<p class="sub">Sales history is recorded for games released from now on.</p>';
  const cost = totalCost(g);
  const H = 160;
  const max = Math.max(cost, cum[cum.length - 1]) * 1.12 || 1;
  const step = niceStep(max);
  const x = (w: number) => PAD.l + (w / SALES_WEEKS) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  const grid: string[] = [];
  for (let v = 0; v <= max; v += step) {
    grid.push(`<line class="grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${PAD.l - 6}" y="${y(v) + 4}" text-anchor="end">${axisMoney(v)}</text>`);
  }
  const pts = cum.map((v, w) => `${x(w).toFixed(1)},${y(v).toFixed(1)}`);
  const area = `M${x(0)},${y(0)}L${pts.join('L')}L${x(cum.length - 1)},${y(0)}Z`;
  const last = cum.length - 1;
  const pay = paybackWeek(g);
  const costY = y(cost);
  const hits = cum
    .map((v, w) => {
      if (w === 0) return '';
      const half = (x(1) - x(0)) / 2;
      const lines = [money(v), `Week ${w}`, `+${money(g.weekly!.revenue[w - 1])} that week`];
      if (pay === w) lines.push('Paid for itself 🎉');
      return `<g class="hit" ${tip(lines)}><rect x="${x(w) - half}" y="${PAD.t}" width="${half * 2}" height="${H - PAD.t - PAD.b}" fill="transparent"/><line class="xhair" x1="${x(w)}" x2="${x(w)}" y1="${PAD.t}" y2="${H - PAD.b}"/><circle class="xdot" cx="${x(w)}" cy="${y(v)}" r="4" fill="${MONEY}" stroke="${SURFACE}" stroke-width="2"/></g>`;
    })
    .join('');
  const endLabelX = Math.min(x(last) + 6, W - PAD.r);
  // The cost label sits at the right end of its line, below it if the money line ends just above.
  const costLabelBelow = x(last) > W - 110 && y(cum[last]) < costY && costY - y(cum[last]) < 26;
  const endAnchor = x(last) > W - 70 ? 'end' : 'start';
  return `
  <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Money made by ${esc(g.name)} each week compared with its cost">
    ${grid.join('')}
    <line class="ref" x1="${PAD.l}" x2="${W - PAD.r}" y1="${costY}" y2="${costY}"/>
    <text class="ref-label" x="${W - PAD.r}" y="${costLabelBelow ? costY + 13 : costY - 5}" text-anchor="end">Cost ${axisMoney(cost)}</text>
    <path d="${area}" fill="${MONEY}" opacity="0.1"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="${MONEY}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${pay !== null ? `<circle cx="${x(pay)}" cy="${y(cum[pay])}" r="5" fill="${MONEY}" stroke="${SURFACE}" stroke-width="2"/>` : ''}
    <circle cx="${x(last)}" cy="${y(cum[last])}" r="4" fill="${MONEY}" stroke="${SURFACE}" stroke-width="2"/>
    <text class="end-label" x="${endAnchor === 'end' ? x(last) - 8 : endLabelX}" y="${y(cum[last]) - 9}" text-anchor="${endAnchor}">${axisMoney(cum[last])}</text>
    <text class="tick" x="${x(0)}" y="${H - 6}" text-anchor="start">Launch</text>
    <text class="tick" x="${x(SALES_WEEKS)}" y="${H - 6}" text-anchor="end">Week ${SALES_WEEKS}</text>
    ${hits}
  </svg>`;
}

/** Copies sold each week on the market. */
export function weeklyChart(g: ReleasedGame): string {
  const units = g.weekly?.units ?? [];
  if (!units.length) return '';
  const H = 120;
  const max = Math.max(...units, 1) * 1.15;
  const slot = (W - PAD.l - PAD.r) / SALES_WEEKS;
  const bw = Math.min(24, slot - 4);
  const base = H - PAD.b;
  const y = (v: number) => (v / max) * (H - PAD.t - PAD.b);
  const peak = units.indexOf(Math.max(...units));
  const step = niceStep(max, 2);
  const grid: string[] = [];
  for (let v = step; v <= max; v += step) grid.push(`<line class="grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${base - y(v)}" y2="${base - y(v)}"/><text class="tick" x="${PAD.l - 6}" y="${base - y(v) + 4}" text-anchor="end">${num(v)}</text>`);
  const bars = units
    .map((u, i) => {
      const x0 = PAD.l + i * slot + (slot - bw) / 2;
      return `<g class="hit bar" ${tip([`${num(u)} copies`, `Week ${i + 1}`, money(g.weekly!.revenue[i])])}><rect x="${PAD.l + i * slot}" y="${PAD.t}" width="${slot}" height="${base - PAD.t}" fill="transparent"/><path d="${column(x0, base, bw, y(u))}" fill="${MONEY}"/></g>`;
    })
    .join('');
  const px = PAD.l + peak * slot + slot / 2;
  return `
  <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Copies of ${esc(g.name)} sold each week">
    ${grid.join('')}
    <line class="axis" x1="${PAD.l}" x2="${W - PAD.r}" y1="${base}" y2="${base}"/>
    <text class="tick" x="${PAD.l - 6}" y="${base + 4}" text-anchor="end">0</text>
    ${bars}
    <text class="end-label" x="${px}" y="${base - y(units[peak]) - 6}" text-anchor="middle">${num(units[peak])}</text>
    <text class="tick" x="${PAD.l + slot / 2}" y="${H - 6}" text-anchor="middle">1</text>
    <text class="tick" x="${PAD.l + (SALES_WEEKS - 0.5) * slot}" y="${H - 6}" text-anchor="middle">${SALES_WEEKS}</text>
  </svg>`;
}

/** Where the money went: a stacked bar with a legend that carries every value. */
export function spendBar(g: ReleasedGame): string {
  const s = g.spend;
  if (!s) return '';
  const total = totalCost(g) || 1;
  const keys = (Object.keys(SPEND_LABELS) as (keyof Spend)[]).filter((k) => s[k] > 0);
  const segs = keys.map((k) => `<span class="seg" style="flex:${s[k] / total};background:${SPEND_COLORS[k]}" ${tip([money(s[k]), SPEND_LABELS[k], `${Math.round((s[k] / total) * 100)}% of the cost`])}></span>`).join('');
  const legend = keys.map((k) => `<li><i style="background:${SPEND_COLORS[k]}"></i><span class="grow">${SPEND_LABELS[k]}</span><b>${money(s[k])}</b></li>`).join('');
  return `<div class="spend-bar" role="img" aria-label="What ${esc(g.name)} cost, by kind">${segs}</div><ul class="spend-legend">${legend}</ul>`;
}

/** Profit or loss of every release, oldest first. Tap a column to open that game. */
export function profitChart(games: ReleasedGame[]): string {
  const list = [...games].sort((a, b) => a.releaseWeek - b.releaseWeek || a.id - b.id);
  const H = 170;
  const slot = 16;
  const bw = 10;
  const width = Math.max(W, PAD.l + PAD.r + list.length * slot);
  const values = list.map(profit);
  const top = Math.max(0, ...values);
  const bottom = Math.min(0, ...values);
  const span = top - bottom || 1;
  const plotH = H - PAD.t - PAD.b - 6;
  const y = (v: number) => PAD.t + ((top - v) / span) * plotH;
  const zero = y(0);
  const step = niceStep(Math.max(top, -bottom), 2);
  const levels: number[] = [0];
  for (let v = step; v <= top; v += step) levels.push(v);
  for (let v = -step; v >= bottom; v -= step) levels.push(v);
  const grid = levels.filter((v) => v !== 0).map((v) => `<line class="grid" x1="${PAD.l}" x2="${width - PAD.r}" y1="${y(v)}" y2="${y(v)}"/>`);
  const ticks = levels.map((v) => `<text class="tick" x="${PAD.l - 6}" y="${y(v) + 4}" text-anchor="end">${axisMoney(v)}</text>`).join('');
  const scrolls = width > W;
  let lastYear = -1;
  let lastYearX = -Infinity;
  const cols = list
    .map((g, i) => {
      const v = values[i];
      const x0 = PAD.l + i * slot;
      const vd = verdict(g);
      const selling = g.weeksOnMarket < SALES_WEEKS ? ' (still selling)' : '';
      const year = yearOf(g.releaseWeek);
      let yearLabel = '';
      if (year !== lastYear && x0 - lastYearX >= 34) {
        yearLabel = `<text class="tick" x="${x0 + slot / 2}" y="${H - 6}" text-anchor="middle">'${String(year).slice(2)}</text>`;
        lastYearX = x0;
      }
      lastYear = year;
      return `<g class="hit bar" data-action="game-detail" data-arg="${g.id}" ${tip([`${v >= 0 ? '+' : ''}${money(v)}${selling}`, g.name, `${vd.icon} ${vd.label} · ${g.score.toFixed(1)}`])}><rect x="${x0}" y="${PAD.t}" width="${slot}" height="${H - PAD.t - PAD.b}" fill="transparent"/><path d="${column(x0 + (slot - bw) / 2, zero, bw, zero - y(v))}" fill="${v >= 0 ? MONEY : LOSS}"/></g>${yearLabel}`;
    })
    .join('');
  // When the chart scrolls sideways, the money axis stays pinned on the left.
  return `
  <div class="chart-frame">
    <div class="chart-scroll" data-scroll-end>
      <svg class="chart" viewBox="0 0 ${width} ${H}" style="${scrolls ? `width:${width}px` : 'width:100%'}" role="img" aria-label="Profit or loss of each game, oldest first">
        ${grid.join('')}
        <line class="axis" x1="${PAD.l}" x2="${width - PAD.r}" y1="${zero}" y2="${zero}"/>
        ${scrolls ? '' : ticks}
        ${cols}
      </svg>
    </div>
    ${scrolls ? `<svg class="chart chart-yaxis" viewBox="0 0 ${PAD.l} ${H}" style="width:${PAD.l}px" aria-hidden="true">${ticks}</svg>` : ''}
  </div>
  <ul class="chart-legend"><li><i style="background:${MONEY}"></i>Profit</li><li><i style="background:${LOSS}"></i>Loss</li><li class="sub">Tap a column to open the game</li></ul>`;
}

/** A tiny line of money made so far against cost, for list rows. Decorative: the row text carries the numbers. */
export function sparkline(g: ReleasedGame): string {
  const cum = cumulativeRevenue(g);
  if (cum.length < 2) return '';
  const w = 56;
  const h = 24;
  const cost = totalCost(g);
  const max = Math.max(cost, cum[cum.length - 1]) * 1.1 || 1;
  const x = (i: number) => 2 + (i / SALES_WEEKS) * (w - 4);
  const y = (v: number) => h - 2 - (v / max) * (h - 4);
  const pts = cum.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = cum.length - 1;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><line x1="2" x2="${w - 2}" y1="${y(cost)}" y2="${y(cost)}" class="ref"/><polyline points="${pts}" fill="none" stroke="${MONEY}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${x(last)}" cy="${y(cum[last])}" r="3" fill="${MONEY}"/></svg>`;
}
