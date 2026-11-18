import { genreById } from '../core/data';
import { DISMISSABLE, type GuideStep } from '../core/guide';
import type { GameState, GameSpec } from '../core/types';
import { esc, money } from './format';

/** What the coach says at each step of the first game. */
function coachText(state: GameState, step: GuideStep, draft?: GameSpec): { title: string; body: string } {
  const a = state.activity?.kind === 'game' ? state.activity : null;
  switch (step) {
    case 'start':
      return {
        title: 'Let’s make your first game',
        body: `You have a garage, a computer and ${money(state.cash)}. Tap <b>🎮 New Game</b> and I’ll walk you through it.`,
      };
    case 'concept':
      return {
        title: 'Pick a genre',
        body: 'The genre decides what players care about. You pick a topic for it next. Not sure? <b>🗺️ Adventure</b> is a safe first game. Then tap <b>Next</b>.',
      };
    case 'topic':
      if (draft?.topic)
        return {
          title: 'Give it a name',
          body: 'The card under the topics shows how players might take this pair. You only learn for sure by releasing it. Keep the suggested title on the box or type your own, then tap <b>Next</b>.',
        };
      return {
        title: 'Now a topic',
        body: `Some pairs work much better than others, and you discover which with each release. ${draft?.genre === 'adventure' ? '<b>🐉 Fantasy</b> goes well with Adventure.' : 'Pick one that sounds fun.'}`,
      };
    case 'platform':
      return {
        title: 'Where will it come out?',
        body: '<b>PC</b> has a free dev kit, so it’s the place to start. Consoles need a license you can buy later. Tap <b>Next</b>.',
      };
    case 'setup':
      return {
        title: 'Keep it small',
        body: 'Make it <b>Small</b> with <b>No marketing</b> for now: your cash has to last until the game sells. Then tap <b>Next</b>.',
      };
    case 'focus':
      return {
        title: 'Where does the time go?',
        body: `A game is made in 3 phases. These sliders split the team’s time between three areas. You don’t know yet what ${esc(genreById(draft?.genre ?? 'action').name)} players care about, so an even split is fine. The reviews will tell you. Tap <b>Start development</b>.`,
      };
    case 'develop':
      return {
        title: 'Your game is in development',
        body: 'Each week the team adds <b>design</b> and <b>tech</b> points, and a few <b>bugs</b>. At each new phase you set the focus again. Tap ❚❚ at the top to pause, or the speed button to go faster.',
      };
    case 'phase':
      return {
        title: 'A new phase',
        body: 'Three new areas to split time between. Lean towards what you think suits the genre, or keep it even.',
      };
    case 'polish':
      return {
        title: 'Feature complete!',
        body: 'Bugs hurt reviews. Pick <b>🐛 Bugs</b> to polish for a few weeks and watch the counter drop, then release. Or release right away if it looks clean.',
      };
    case 'release':
      return {
        title: 'Polishing',
        body:
          a && Math.round(a.bugs) <= 0
            ? 'No bugs left! Polishing longer only adds a little, and every week costs rent. Tap <b>🚀 Release</b>.'
            : `The team is fixing ${a ? `<b>${Math.round(a.bugs)}</b> bugs` : 'bugs'}. Every week also costs rent, so don’t wait forever. Tap <b>🚀 Release</b> when you’re happy.`,
      };
    case 'reviews':
      return {
        title: 'The reviews are in',
        body: 'Four outlets score the game. <b>What we learned</b> shows how players took the pair and what the genre cares about. It’s saved, so your next game can do better.',
      };
    case 'next':
      return {
        title: 'Your first game is out!',
        body: 'It sells for a few months: the 📈 chip shows what it earns. Next, use what you learned in a new game, take a 📝 <b>Contract</b> when cash runs low, and hire help from the <b>Team</b> tab once you can afford it. That’s the tour. Have fun!',
      };
  }
}

/** The coach card: a short tip, "Got it" where the step waits for one, and a way out. */
export function coachCard(state: GameState, step: GuideStep, draft?: GameSpec): string {
  const { title, body } = coachText(state, step, draft);
  const gotIt = DISMISSABLE.includes(step);
  return `
    <div class="coach" data-guide="${step}" role="note">
      <span class="coach-face" aria-hidden="true">🧑‍🏫</span>
      <div class="grow">
        <b class="coach-title">${title}</b>
        <div class="coach-body">${body}</div>
        <div class="coach-actions">
          ${step === 'next' ? '' : '<button class="coach-skip" data-action="guide-skip">Skip tutorial</button>'}
          ${gotIt ? `<button class="btn small" data-action="guide-next" data-arg="${step}">${step === 'next' ? 'Let’s go!' : 'Got it'}</button>` : ''}
        </div>
      </div>
    </div>`;
}
