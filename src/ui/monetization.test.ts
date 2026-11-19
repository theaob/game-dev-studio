import { beforeEach, describe, expect, it, vi } from 'vitest';

// A pretend AdMob plugin that behaves like the real Android one: the show call only settles when
// the reward is earned, and closing the video early only fires the Dismissed event.
type Listener = (e?: unknown) => void;
const listeners = new Map<string, Set<Listener>>();
const emit = (name: string, e?: unknown) => listeners.get(name)?.forEach((f) => f(e));
let onShow: (resolve: (item: { type: string; amount: number }) => void, reject: (e: Error) => void) => void = () => {};
let consentFails = false;

const AdMob = {
  requestConsentInfo: vi.fn(async () => {
    if (consentFails) throw new Error('Publisher misconfiguration');
    return { status: 'NOT_REQUIRED', isConsentFormAvailable: false, canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED' };
  }),
  showConsentForm: vi.fn(),
  initialize: vi.fn(async () => {}),
  prepareRewardVideoAd: vi.fn(async () => ({ adUnitId: 'x' })),
  prepareInterstitial: vi.fn(async () => ({ adUnitId: 'y' })),
  showRewardVideoAd: vi.fn(() => new Promise((resolve, reject) => onShow(resolve, reject))),
  showInterstitial: vi.fn(async () => {}),
  addListener: vi.fn(async (name: string, f: Listener) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name)!.add(f);
    return { remove: async () => void listeners.get(name)!.delete(f) };
  }),
};

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor-community/admob', () => ({
  AdMob,
  AdmobConsentStatus: { REQUIRED: 'REQUIRED' },
  RewardAdPluginEvents: { Rewarded: 'reward', Dismissed: 'dismissed', FailedToShow: 'failedToShow', FailedToLoad: 'failedToLoad' },
  InterstitialAdPluginEvents: { FailedToLoad: 'iFailedToLoad' },
}));
vi.mock('@capgo/native-purchases', () => ({
  NativePurchases: { isBillingSupported: async () => ({ isBillingSupported: false }) },
  PURCHASE_TYPE: { INAPP: 'inapp' },
}));

(globalThis as unknown as { window: unknown }).window = globalThis;

const { Monetization } = await import('./monetization');

async function ready() {
  const m = new Monetization();
  await m.init();
  await new Promise((r) => setTimeout(r, 0));
  return m;
}

describe('rewarded videos', () => {
  beforeEach(() => {
    listeners.clear();
    consentFails = false;
    vi.clearAllMocks();
  });

  it('pays out when the video is watched to the end', async () => {
    const m = await ready();
    onShow = (resolve) => setTimeout(() => {
      emit('reward');
      resolve({ type: 'coins', amount: 1 });
      emit('dismissed');
    });
    expect(await m.earnReward()).toBe(true);
    expect(m.view().busy).toBe(false);
  });

  it('keeps ads working after the player closes a video early', async () => {
    const m = await ready();
    // Closed early: the plugin never settles the show call, it only fires Dismissed.
    onShow = () => setTimeout(() => emit('dismissed'));
    expect(await m.earnReward()).toBe(false);
    expect(m.view().busy).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(m.view().rewardedReady).toBe(true);
    // And the next video still plays.
    onShow = (resolve) => setTimeout(() => {
      emit('reward');
      resolve({ type: 'coins', amount: 1 });
      emit('dismissed');
    });
    expect(await m.earnReward()).toBe(true);
  });

  it('gives up cleanly when a video fails to show', async () => {
    const m = await ready();
    onShow = () => setTimeout(() => emit('failedToShow', { code: 1 }));
    expect(await m.earnReward()).toBe(false);
    expect(m.view().busy).toBe(false);
  });

  it('still loads ads when the consent check fails', async () => {
    consentFails = true;
    const m = await ready();
    expect(AdMob.initialize).toHaveBeenCalled();
    expect(AdMob.prepareRewardVideoAd).toHaveBeenCalled();
    expect(m.view().rewardedReady).toBe(true);
  });
});
