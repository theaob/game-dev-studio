import type { GameState } from '../core/types';

/** What the app needs from an office scene, whether it's the 3D one or the 2D fallback. */
export interface OfficeView {
  /** Element to insert into the page. */
  readonly el: HTMLElement;
  /** Advance and render one frame. `running` is false while the game is paused. */
  draw(state: GameState, t: number, running: boolean): void;
  /** Someone just got in the zone. */
  celebrate(staffId: number): void;
  /** Show a speech bubble above someone (or the cat). */
  say(staffId: number, text: string, life?: number): void;
  /** Everyone reacts at once. */
  cheer(lines: string[]): void;
  /** Pixels covered by the HUD (top) and the dock and tab bar (bottom), so the office is framed between them. */
  setInsets?(top: number, bottom: number): void;
}
