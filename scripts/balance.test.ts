// Prints a year-by-year report of bot playthroughs. Run: npx vitest run scripts/balance.test.ts
import { it } from 'vitest';
import { botTurn, type BotStyle } from '../src/core/bot';
import { createGame, tick } from '../src/core/sim';
import { yearOf } from '../src/core/time';
import type { ReleaseReport } from '../src/core/types';

for (const style of ['smart', 'naive'] as BotStyle[]) {
  it(`report: ${style}`, () => {
    const s = createGame(style, 2024);
    const reports: ReleaseReport[] = [];
    const lines: string[] = [];
    let last = 0;
    while (!s.over) {
      botTurn(s, style, reports);
      tick(s);
      if (s.week % 192 === 0 || s.over) {
        const rs = reports.slice(last);
        last = reports.length;
        const avg = rs.length ? (rs.reduce((a, r) => a + r.game.score, 0) / rs.length).toFixed(1) : '-';
        const units = rs.reduce((a, r) => a + r.game.targetUnits, 0);
        lines.push(`${yearOf(s.week)} cash=${Math.round(s.cash).toLocaleString()} fans=${s.fans.toLocaleString()} rp=${Math.round(s.rp)} staff=${s.staff.length} office=${s.officeLevel} games=${rs.length} avg=${avg} units=${units.toLocaleString()} sizes=${rs.map((r) => r.game.size[0]).join('')}`);
      }
    }
    console.log(`== ${style} (${s.over})\n` + lines.join('\n'));
  });
}
