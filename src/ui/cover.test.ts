import { describe, expect, it } from 'vitest';
import { coverArt, coverSeed } from './cover';

describe('cover art', () => {
  const g = { id: 4, name: 'Dragon Quest-ish', genre: 'rpg' as const, topic: 'fantasy', platform: 'pc' };
  it('draws the same cover for the same game every time', () => {
    expect(coverArt(g, 'lg')).toBe(coverArt({ ...g }, 'lg'));
    expect(coverArt({ ...g, cover: 7 })).toBe(coverArt({ ...g, cover: 7 }));
  });
  it('gives older saves without a seed a steady cover, and different games different covers', () => {
    expect(coverSeed(g)).toBe(coverSeed({ ...g }));
    const covers = new Set(Array.from({ length: 30 }, (_, i) => coverArt({ ...g, cover: i })));
    expect(covers.size).toBeGreaterThan(25);
  });
  it('copes with a blank draft', () => {
    expect(coverArt({ name: '', genre: '' as never, topic: '', platform: '' }, 'md')).toContain('🎮');
  });
});
