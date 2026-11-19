/**
 * Ads (Google AdMob) and the "Remove ads" and "Supporter Pack" purchases (Google Play Billing).
 * Either purchase turns off interstitials and gives reward-video rewards without the video.
 * Only the Android app shows ads: on the web and itch.io everything here is
 * switched off, and the plugins aren't even loaded.
 */
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';

/** Google's sample ad units: always fill, never pay. Real units come from the build environment. */
const TEST_REWARDED = 'ca-app-pub-3940256099942544/5224354917';
const TEST_INTERSTITIAL = 'ca-app-pub-3940256099942544/1033173712';
const REWARDED_ID: string = import.meta.env.VITE_ADMOB_REWARDED_ID || TEST_REWARDED;
const INTERSTITIAL_ID: string = import.meta.env.VITE_ADMOB_INTERSTITIAL_ID || TEST_INTERSTITIAL;
const TESTING = REWARDED_ID === TEST_REWARDED;

/** The one-time "Remove ads" product, as set up in the Play Console. */
export const REMOVE_ADS_PRODUCT = 'remove_ads';
/** The one-time "Supporter Pack": everything in Remove ads plus exclusive decorations. */
export const SUPPORTER_PRODUCT = 'supporter_pack';
export type ProductId = typeof REMOVE_ADS_PRODUCT | typeof SUPPORTER_PRODUCT;

/** Interstitials are rare: never in the first minutes of a session, and minutes apart. */
const SESSION_GRACE_MS = 3 * 60 * 1000;
const INTERSTITIAL_GAP_MS = 4 * 60 * 1000;
/** And never before the player has released this many games. */
export const INTERSTITIAL_MIN_RELEASES = 3;

const AD_FREE_KEY = 'game-dev-studio/ad-free';
const SUPPORTER_KEY = 'game-dev-studio/supporter';
/** Interstitials this device has shown, and whether the one-time Remove ads offer has been made. */
const ADS_SEEN_KEY = 'game-dev-studio/ads-seen';
const NUDGED_KEY = 'game-dev-studio/ad-nudge';
/** The Remove ads offer pops up once, after this many interstitials. */
export const NUDGE_AFTER_ADS = 3;

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: Play remembers purchases anyway, and the counters just restart.
  }
}

type AdMobModule = typeof import('@capacitor-community/admob');
type PurchasesModule = typeof import('@capgo/native-purchases');

export interface MonetizationView {
  /** Running in the Android app (ads and purchases exist at all). */
  native: boolean;
  /** A reward can be claimed now: a video is loaded, or the player bought a pack and needs no video. */
  rewardedReady: boolean;
  /** The player bought "Remove ads" or the Supporter Pack: no interstitials, rewards without videos. */
  adFree: boolean;
  /** The player bought the Supporter Pack (exclusive decorations). */
  supporter: boolean;
  /** The localised prices, once Play has told us. */
  removeAdsPrice?: string;
  supporterPrice?: string;
  /** EEA/UK players must be able to reopen the consent form. */
  privacyOptions: boolean;
  /** A purchase or ad is in progress. */
  busy: boolean;
}

/** On the dev server, `?fake-ads` pretends to be the Android app so the ad and purchase UI can be tried in a browser. */
const FAKE = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('fake-ads');

export class Monetization {
  readonly native = FAKE || Capacitor.isNativePlatform();
  private admob?: AdMobModule;
  private purchases?: PurchasesModule;
  private canRequestAds = false;
  private rewardedReady = false;
  private interstitialReady = false;
  private privacyOptions = false;
  private removeAds = false;
  private supporter = false;
  private removeAdsPrice?: string;
  private supporterPrice?: string;
  private busy = false;
  private readonly sessionStart = Date.now();
  private lastAdAt = 0;
  /** Called whenever something the UI shows changes (an ad loaded, a purchase went through). */
  onChange: () => void = () => {};

  constructor() {
    // Remembered from the last time Play answered; the purchase check below confirms it.
    this.removeAds = readKey(AD_FREE_KEY) === '1';
    this.supporter = readKey(SUPPORTER_KEY) === '1';
  }

  private get adFree(): boolean {
    return this.removeAds || this.supporter;
  }

  view(): MonetizationView {
    return {
      native: this.native,
      rewardedReady: this.native && (this.adFree || this.rewardedReady),
      adFree: this.adFree,
      supporter: this.supporter,
      removeAdsPrice: this.removeAdsPrice,
      supporterPrice: this.supporterPrice,
      privacyOptions: this.privacyOptions,
      busy: this.busy,
    };
  }

  /** Loads the plugins, asks for consent where the law needs it, and preloads ads. Safe to call once at start-up. */
  async init(): Promise<void> {
    if (FAKE) {
      this.rewardedReady = true;
      this.interstitialReady = true;
      this.privacyOptions = true;
      this.removeAdsPrice = '$2.99';
      this.supporterPrice = '$4.99';
      this.onChange();
      return;
    }
    if (!this.native) return;
    await Promise.allSettled([this.initAds(), this.initPurchases()]);
    this.onChange();
  }

  private async initAds() {
    try {
      this.admob = await import('@capacitor-community/admob');
      const { AdMob, AdmobConsentStatus } = this.admob;
      // Google's consent form (UMP) for players in the EEA, UK and Switzerland.
      try {
        let consent = await AdMob.requestConsentInfo();
        if (consent.status === AdmobConsentStatus.REQUIRED && consent.isConsentFormAvailable) consent = await AdMob.showConsentForm();
        this.canRequestAds = consent.canRequestAds;
        this.privacyOptions = String(consent.privacyOptionsRequirementStatus) === 'REQUIRED';
      } catch (e) {
        // The consent check itself failed (offline, or AdMob's "Privacy & messaging" isn't set up for this app).
        // That used to switch ads off for the whole session. Without a consent answer the Ads SDK only
        // serves limited, non-personalised ads where the law needs consent, so carry on.
        console.warn('Ads: consent check failed, loading ads anyway', e);
        this.canRequestAds = true;
      }
      if (!this.canRequestAds) {
        console.warn('Ads: the player has not allowed ads');
        return;
      }
      await AdMob.initialize({ initializeForTesting: TESTING });
      this.listen();
      void this.loadRewarded();
      if (!this.adFree) void this.loadInterstitial();
    } catch (e) {
      console.warn('Ads unavailable', e);
    }
  }

  private listen() {
    const { AdMob, RewardAdPluginEvents, InterstitialAdPluginEvents } = this.admob!;
    void AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (e) => {
      // Shows in `adb logcat` as Capacitor/Console: code 3 is "no fill" (normal for a new AdMob app for a while).
      console.warn('Ads: rewarded video failed to load', e?.code, e?.message);
      this.rewardedReady = false;
      this.onChange();
      // Try again later rather than hammering the network.
      window.setTimeout(() => void this.loadRewarded(), 60_000);
    });
    void AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, (e) => {
      console.warn('Ads: interstitial failed to load', e?.code, e?.message);
      this.interstitialReady = false;
      window.setTimeout(() => void this.loadInterstitial(), 120_000);
    });
  }

  private async loadRewarded() {
    if (!this.admob || !this.canRequestAds) return;
    try {
      await this.admob.AdMob.prepareRewardVideoAd({ adId: REWARDED_ID, isTesting: TESTING });
      this.rewardedReady = true;
      this.onChange();
    } catch {
      this.rewardedReady = false;
    }
  }

  private async loadInterstitial() {
    if (!this.admob || !this.canRequestAds || this.adFree) return;
    try {
      await this.admob.AdMob.prepareInterstitial({ adId: INTERSTITIAL_ID, isTesting: TESTING });
      this.interstitialReady = true;
    } catch {
      this.interstitialReady = false;
    }
  }

  /**
   * Earns a reward: players who bought a pack get it right away, everyone else watches a video.
   * Resolves true when the reward should be given.
   */
  async earnReward(): Promise<boolean> {
    if (this.native && this.adFree && !this.busy) return true;
    return this.showRewarded();
  }

  /** Shows a rewarded video. Resolves true only if the player watched it to the end. */
  private async showRewarded(): Promise<boolean> {
    if (FAKE) return this.fakeAd(true);
    if (!this.admob || !this.rewardedReady || this.busy) return false;
    const { AdMob, RewardAdPluginEvents } = this.admob;
    this.busy = true;
    this.rewardedReady = false;
    this.onChange();
    const handles: PluginListenerHandle[] = [];
    let rewarded = false;
    try {
      // The plugin's show call only settles when the reward is earned: if the player closes the video
      // early it never settles. Waiting on it alone left `busy` stuck on, which turned off every
      // video and full-screen ad until the app restarted. So finish when the ad closes or fails to show.
      await new Promise<void>((resolve) => {
        void (async () => {
          try {
            handles.push(await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => (rewarded = true)));
            handles.push(await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => resolve()));
            handles.push(await AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => resolve()));
            const item = await AdMob.showRewardVideoAd();
            if (item && item.amount !== undefined) rewarded = true;
          } catch (e) {
            // Not loaded after all, or failed to show: no reward.
            console.warn('Ads: rewarded video failed to show', e);
            resolve();
          }
        })();
      });
    } finally {
      await Promise.allSettled(handles.map((h) => h.remove()));
      this.busy = false;
      this.lastAdAt = Date.now();
      void this.loadRewarded();
      this.onChange();
    }
    return rewarded;
  }

  /**
   * Maybe shows a full-screen ad at a natural break. Never for ad-free players, early in a session or too often.
   * Resolves true if an ad was shown.
   */
  async maybeInterstitial(releases: number): Promise<boolean> {
    if (FAKE) {
      if (this.adFree || releases < INTERSTITIAL_MIN_RELEASES) return false;
      console.info('[fake-ads] interstitial would show now');
      this.countAd();
      return true;
    }
    if (!this.admob || this.adFree || !this.interstitialReady || this.busy) return false;
    const now = Date.now();
    if (releases < INTERSTITIAL_MIN_RELEASES) return false;
    if (now - this.sessionStart < SESSION_GRACE_MS || now - this.lastAdAt < INTERSTITIAL_GAP_MS) return false;
    this.busy = true;
    this.interstitialReady = false;
    let shown = false;
    try {
      await this.admob.AdMob.showInterstitial();
      shown = true;
      this.countAd();
    } catch {
      // Ignore: no ad this time.
    } finally {
      this.busy = false;
      this.lastAdAt = Date.now();
      void this.loadInterstitial();
    }
    return shown;
  }

  private countAd() {
    writeKey(ADS_SEEN_KEY, String((Number(readKey(ADS_SEEN_KEY)) || 0) + 1));
  }

  /** True once, after the player's NUDGE_AFTER_ADS-th interstitial: time to offer Remove ads. Marks the offer made. */
  takeNudge(): boolean {
    if (!this.native || this.adFree || readKey(NUDGED_KEY) === '1') return false;
    if ((Number(readKey(ADS_SEEN_KEY)) || 0) < NUDGE_AFTER_ADS) return false;
    writeKey(NUDGED_KEY, '1');
    return true;
  }

  /** Reopens Google's consent form so players can change their choice. */
  async showPrivacyOptions(): Promise<void> {
    try {
      await this.admob?.AdMob.showPrivacyOptionsForm();
    } catch (e) {
      console.warn('Privacy options unavailable', e);
    }
  }

  /** Dev only: a pretend ad that takes a moment and always pays out. */
  private async fakeAd(result: boolean): Promise<boolean> {
    this.busy = true;
    this.onChange();
    await new Promise((r) => window.setTimeout(r, 600));
    this.busy = false;
    this.onChange();
    return result;
  }

  // ---------------------------------------------------------------------------
  // Remove ads (Google Play Billing)
  // ---------------------------------------------------------------------------

  private async initPurchases() {
    try {
      this.purchases = await import('@capgo/native-purchases');
      const { NativePurchases, PURCHASE_TYPE } = this.purchases;
      const { isBillingSupported } = await NativePurchases.isBillingSupported();
      if (!isBillingSupported) return;
      await this.refreshOwnership();
      const { products } = await NativePurchases.getProducts({ productIdentifiers: [REMOVE_ADS_PRODUCT, SUPPORTER_PRODUCT], productType: PURCHASE_TYPE.INAPP });
      for (const p of products) {
        if (p.identifier === REMOVE_ADS_PRODUCT) this.removeAdsPrice = p.priceString;
        if (p.identifier === SUPPORTER_PRODUCT) this.supporterPrice = p.priceString;
      }
    } catch (e) {
      console.warn('Purchases unavailable', e);
    }
  }

  /** Asks Play which one-time products this account owns. */
  private async refreshOwnership() {
    if (!this.purchases) return;
    const { NativePurchases, PURCHASE_TYPE } = this.purchases;
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
    const owns = (id: ProductId) => purchases.some((p) => p.productIdentifier === id && (p.purchaseState === undefined || p.purchaseState === '1'));
    // If Play can't be reached this throws and the remembered state stays; ads only come back when Play
    // answers that the purchase is gone (a refund).
    this.setOwned(owns(REMOVE_ADS_PRODUCT), owns(SUPPORTER_PRODUCT));
  }

  private setOwned(removeAds: boolean, supporter: boolean) {
    this.removeAds = removeAds;
    this.supporter = supporter;
    writeKey(AD_FREE_KEY, removeAds ? '1' : null);
    writeKey(SUPPORTER_KEY, supporter ? '1' : null);
    if (!this.adFree) void this.loadInterstitial();
  }

  /** Buys "Remove ads" or the Supporter Pack. Returns an error message, or null on success. */
  async buy(product: ProductId): Promise<string | null> {
    const owned = () => (product === SUPPORTER_PRODUCT ? this.supporter : this.adFree);
    if (FAKE) {
      this.setOwned(this.removeAds || product === REMOVE_ADS_PRODUCT, this.supporter || product === SUPPORTER_PRODUCT);
      this.onChange();
      return null;
    }
    if (!this.purchases) return 'Purchases are only available in the Android app from Google Play.';
    if (owned()) return null;
    const { NativePurchases, PURCHASE_TYPE } = this.purchases;
    this.busy = true;
    this.onChange();
    try {
      const t = await NativePurchases.purchaseProduct({ productIdentifier: product, productType: PURCHASE_TYPE.INAPP, quantity: 1 });
      if (t.purchaseState !== undefined && t.purchaseState !== '1') return 'Your payment is pending. It will switch on once it goes through.';
      this.setOwned(this.removeAds || product === REMOVE_ADS_PRODUCT, this.supporter || product === SUPPORTER_PRODUCT);
      return null;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      return /cancel/i.test(msg) ? 'Purchase cancelled.' : 'The purchase did not go through. Please try again.';
    } finally {
      this.busy = false;
      this.onChange();
    }
  }

  /** Restores purchases after a reinstall or on a new phone. Returns a message for the player. */
  async restore(): Promise<string> {
    if (!this.purchases) return 'Purchases are only available in the Android app from Google Play.';
    try {
      await this.purchases.NativePurchases.restorePurchases();
      await this.refreshOwnership();
      this.onChange();
      if (this.supporter) return 'Supporter Pack restored. Thanks for your support!';
      return this.adFree ? 'Ads removed. Thanks for your support!' : 'No purchases found for this Google account.';
    } catch {
      return 'Could not reach Google Play. Please try again.';
    }
  }
}
