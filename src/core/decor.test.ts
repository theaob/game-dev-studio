import { describe, expect, it } from 'vitest';
import { buyDecor, decorKey, decorPrice, isPlaced, paintColor, paintPrice, placedDecor, repaint, toggleDecor } from './decor';
import { createGame } from './sim';

describe('studio decor', () => {
  it('repaints walls and floor for a fee, and goes back to the original for free', () => {
    const s = createGame('Test');
    const cash = s.cash;
    expect(paintColor(s, 'wall')).toBeUndefined();
    expect(repaint(s, 'wall', 'sage')).toBeNull();
    expect(paintColor(s, 'wall')).toBe('#8fa889');
    expect(s.cash).toBe(cash - paintPrice(s));
    expect(repaint(s, 'wall', 'sage')).toMatch(/Already/);
    expect(repaint(s, 'floor', 'nope')).toMatch(/Unknown/);
    expect(repaint(s, 'wall', '')).toBeNull();
    expect(paintColor(s, 'wall')).toBeUndefined();
    expect(s.cash).toBe(cash - paintPrice(s));
  });

  it('buys a decoration once, places it, and puts it away for free', () => {
    const s = createGame('Test');
    const cash = s.cash;
    expect(toggleDecor(s, 'arcade')).toMatch(/own/);
    expect(buyDecor(s, 'arcade')).toBeNull();
    expect(s.cash).toBe(cash - decorPrice(s, 'arcade'));
    expect(isPlaced(s, 'arcade')).toBe(true);
    expect(buyDecor(s, 'arcade')).toMatch(/Already/);
    const key = decorKey(s);
    expect(toggleDecor(s, 'arcade')).toBeNull();
    expect(placedDecor(s)).toEqual([]);
    expect(decorKey(s)).not.toBe(key);
    expect(s.cash).toBe(cash - decorPrice(s, 'arcade'));
  });

  it("won't buy what the studio can't afford", () => {
    const s = createGame('Test');
    s.cash = 100;
    expect(buyDecor(s, 'neon')).toMatch(/cash/);
    expect(repaint(s, 'floor', 'oak')).toMatch(/cash/);
    expect(s.decor).toBeUndefined();
  });
});
