import { describe, expect, it } from 'vitest';
import { gotyCelebration, releaseCelebration } from './celebration';

describe('award celebrations', () => {
  it('only throws a party for an award', () => {
    expect(releaseCelebration({ score: 8.9 })).toBeUndefined();
    expect(releaseCelebration({ score: 9 })?.tier).toBe('choice');
    expect(releaseCelebration({ score: 9.5 })?.tier).toBe('masterpiece');
  });

  it('calls a perfect 10 an Instant Classic, with the biggest party', () => {
    const c = releaseCelebration({ score: 10 })!;
    expect(c.tier).toBe('classic');
    expect(c.title).toBe('Instant Classic!');
    expect(c.bursts).toBeGreaterThan(releaseCelebration({ score: 9.5 })!.bursts);
  });

  it('follows the saved award over the score', () => {
    expect(releaseCelebration({ score: 9.6, acclaim: 'choice' })?.tier).toBe('choice');
  });

  it('names the Game of the Year', () => {
    expect(gotyCelebration(1994).title).toBe('Game of the Year 1994!');
  });
});
