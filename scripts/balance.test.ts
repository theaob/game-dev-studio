// Prints the money curve: many bot careers, year by year. Run: npx vitest run scripts/balance.test.ts
// Targets are checked in src/core/economy.test.ts; this report is for tuning src/core/economy.ts.
import { it } from 'vitest';
import { botTurn, type BotStyle } from '../src/core/bot';
import { createGame, monthlyCosts, tick } from '../src/core/sim';
import { WEEKS_PER_YEAR } from '../src/core/time';
import type { ReleaseReport } from '../src/core/types';

const CAREERS = 20;
const YEARS = [1, 2, 3, 5, 8, 12, 16, 20, 25, 30, 35, 41];

const money = (v: number) => {
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  return a >= 1e9 ? `${s}$${(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `${s}$${(a / 1e6).toFixed(1)}M` : `${s}$${Math.round(a / 1e3)}K`;
};
const pct = (v: number[], p: number) => [...v].sort((a, b) => a - b)[Math.round(p * (v.length - 1))];

for (const style of ['smart', 'eager', 'naive'] as BotStyle[]) {
  it(`money curve: ${style}`, () => {
    const byYear = new Map<number, { cash: number; revenue: number; costs: number; staff: number; office: number; score: number }[]>();
    const ends: string[] = [];
    const lows: number[] = [];
    for (let i = 1; i <= CAREERS; i++) {
      const s = createGame(style, i * 7919);
      const reports: ReleaseReport[] = [];
      let lastRevenue = 0;
      let costs = 0;
      let low = s.cash;
      while (!s.over) {
        botTurn(s, style, reports);
        if ((s.week + 1) % 4 === 0) costs += monthlyCosts(s);
        tick(s);
        if (s.week <= WEEKS_PER_YEAR) low = Math.min(low, s.cash);
        if (s.week % WEEKS_PER_YEAR === 0) {
          const recent = reports.slice(-4);
          const row = {
            cash: s.cash,
            revenue: s.totalRevenue - lastRevenue,
            costs,
            staff: s.staff.length,
            office: s.officeLevel,
            score: recent.length ? recent.reduce((a, r) => a + r.game.score, 0) / recent.length : 0,
          };
          const y = s.week / WEEKS_PER_YEAR;
          byYear.set(y, [...(byYear.get(y) ?? []), row]);
          lastRevenue = s.totalRevenue;
          costs = 0;
        }
      }
      lows.push(low);
      ends.push(s.over === 'bankrupt' ? `bankrupt@${(s.week / WEEKS_PER_YEAR).toFixed(1)}y` : 'retired');
    }
    const lines = [`== ${style}: ${ends.filter((e) => e === 'retired').length}/${CAREERS} retired; ${ends.filter((e) => e !== 'retired').join(' ')}`];
    lines.push(`   lowest cash in year 1: min ${money(Math.min(...lows))}, median ${money(pct(lows, 0.5))}`);
    lines.push('year   cash p10 / median / p90          revenue/yr   costs/yr  staff office score  alive');
    for (const y of YEARS) {
      const rows = byYear.get(y);
      if (!rows?.length) continue;
      const m = (k: keyof (typeof rows)[0]) => pct(rows.map((r) => r[k]), 0.5);
      lines.push(
        `${1984 + y}  ${money(pct(rows.map((r) => r.cash), 0.1)).padStart(8)} / ${money(m('cash')).padStart(8)} / ${money(pct(rows.map((r) => r.cash), 0.9)).padStart(8)}   ${money(m('revenue')).padStart(9)} ${money(m('costs')).padStart(10)}  ${String(m('staff')).padStart(5)} ${String(m('office')).padStart(6)} ${m('score').toFixed(1).padStart(5)}  ${rows.length}`,
      );
    }
    console.log(lines.join('\n'));
  }, 120000);
}
