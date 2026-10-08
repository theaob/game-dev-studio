/**
 * Ads (Google AdMob) and the "Remove ads" purchase (Google Play Billing).
 * Only the Android app shows ads: on the web and itch.io everything here is
 * switched off, and the plugins aren't even loaded.
 */
import { Capacitor } from '@capacitor/core';

/** Google's sample ad units: always fill, never pay. Real units come from the build environment. */
const TEST_REWARDED = 'ca-app-pub-3940256099942544/5224354917';
const TEST_INTERSTITIAL = 'ca-app-pub-3940256099942544/1033173712';
const REWARDED_ID: string = import.meta.env.VITE_ADMOB_REWARDED_ID || TEST_REWARDED;
const INTERSTITIAL_ID: string = import.meta.env.VITE_ADMOB_INTERSTITIAL_ID || TEST_INTERSTITIAL;
const TESTING = REWARDED_ID === TEST_REWARDED;

/** The one-time "Remove ads" product, as set up in the Play Console. */
export const REMOVE_ADS_PRODUCT = 'remove_ads';

/** Interstitials are rare: never in the first minutes of a session, and minutes apart. */
const SESSION_GRACE_MS = 3 * 60 * 1000;
const INTERSTITIAL_GAP_MS = 4 * 60 * 1000;
/** And never before the player has released this many games. */
export const INTERSTITIAL_MIN_RELEASES = 3;

const AD_FREE_KEY = 'game-dev-studio/ad-free';

type AdMobModule = typeof import('@capacitor-community/admob');
type PurchasesModule = typeof import('@capgo/native-purchases');

export interface MonetizationView {
  /** Running in the Android app (ads and purchases exist at all). */
  native: boolean;
  /** A rewarded video is loaded and ready to show. */
  rewardedReady: boolean;
  /** The player bought "Remove ads". */
  adFree: boolean;
  /** The localised price of "Remove ads", once Play has told us. */
  removeAdsPrice?: string;
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
  private adFree = false;
  private removeAdsPrice?: string;
  private busy = false;
  private readonly sessionStart = Date.now();
  private lastAdAt = 0;
  /** Called whenever something the UI shows changes (an ad loaded, a purchase went through). */
  onChange: () => void = () => {};

  constructor() {
    try {
      this.adFree = localStorage.getItem(AD_FREE_KEY) === '1';
    } catch {
      // Storage blocked: the purchase check below still finds it.
    }
  }

  view(): MonetizationView {
    return {
      native: this.native,
      rewardedReady: this.native && this.rewardedReady,
      adFree: this.adFree,
      removeAdsPrice: this.removeAdsPrice,
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
      let consent = await AdMob.requestConsentInfo();
      if (consent.status === AdmobConsentStatus.REQUIRED && consent.isConsentFormAvailable) consent = await AdMob.showConsentForm();
      this.canRequestAds = consent.canRequestAds;
      this.privacyOptions = String(consent.privacyOptionsRequirementStatus) === 'REQUIRED';
      if (!this.canRequestAds) return;
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
    void AdMob.addListener(RewardAdPluginEvents.FailedToLoad, () => {
      this.rewardedReady = false;
      this.onChange();
      // Try again later rather than hammering the network.
      window.setTimeout(() => void this.loadRewarded(), 60_000);
    });
    void AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, () => {
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

  /** Shows a rewarded video. Resolves true only if the player watched it to the end. */
  async showRewarded(): Promise<boolean> {
    if (FAKE) return this.fakeAd(true);
    if (!this.admob || !this.rewardedReady || this.busy) return false;
    const { AdMob, RewardAdPluginEvents } = this.admob;
    this.busy = true;
    this.rewardedReady = false;
    this.onChange();
    let rewarded = false;
    const handle = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => (rewarded = true));
    try {
      const item = await AdMob.showRewardVideoAd();
      // The promise resolves with the reward when the player earned it.
      if (item && item.amount !== undefined) rewarded = true;
    } catch {
      // Closed early or failed to show: no reward.
    } finally {
      await handle.remove();
      this.busy = false;
      this.lastAdAt = Date.now();
      void this.loadRewarded();
      this.onChange();
    }
    return rewarded;
  }

  /** Maybe shows a full-screen ad at a natural break. Never for ad-free players, early in a session or too often. */
  async maybeInterstitial(releases: number): Promise<void> {
    if (FAKE && !this.adFree && releases >= INTERSTITIAL_MIN_RELEASES) {
      console.info('[fake-ads] interstitial would show now');
      return;
    }
    if (!this.admob || this.adFree || !this.interstitialReady || this.busy) return;
    const now = Date.now();
    if (releases < INTERSTITIAL_MIN_RELEASES) return;
    if (now - this.sessionStart < SESSION_GRACE_MS || now - this.lastAdAt < INTERSTITIAL_GAP_MS) return;
    this.busy = true;
    this.interstitialReady = false;
    try {
      await this.admob.AdMob.showInterstitial();
    } catch {
      // Ignore: no ad this time.
    } finally {
      this.busy = false;
      this.lastAdAt = Date.now();
      void this.loadInterstitial();
    }
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
      const { product } = await NativePurchases.getProduct({ productIdentifier: REMOVE_ADS_PRODUCT, productType: PURCHASE_TYPE.INAPP });
      this.removeAdsPrice = product.priceString;
    } catch (e) {
      console.warn('Purchases unavailable', e);
    }
  }

  /** Asks Play which one-time products this account owns. */
  private async refreshOwnership() {
    if (!this.purchases) return;
    const { NativePurchases, PURCHASE_TYPE } = this.purchases;
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
    const owned = purchases.some((p) => p.productIdentifier === REMOVE_ADS_PRODUCT && (p.purchaseState === undefined || p.purchaseState === '1'));
    // If Play can't be reached this throws and the remembered state stays; ads only come back when Play
    // answers that the purchase is gone (a refund).
    this.setAdFree(owned);
  }

  private setAdFree(adFree: boolean) {
    this.adFree = adFree;
    try {
      if (adFree) localStorage.setItem(AD_FREE_KEY, '1');
      else localStorage.removeItem(AD_FREE_KEY);
    } catch {
      // Storage blocked: Play remembers the purchase anyway.
    }
    if (!adFree) void this.loadInterstitial();
  }

  /** Buys "Remove ads". Returns an error message, or null on success. */
  async buyRemoveAds(): Promise<string | null> {
    if (FAKE) {
      this.setAdFree(true);
      this.onChange();
      return null;
    }
    if (!this.purchases) return 'Purchases are only available in the Android app from Google Play.';
    if (this.adFree) return null;
    const { NativePurchases, PURCHASE_TYPE } = this.purchases;
    this.busy = true;
    this.onChange();
    try {
      const t = await NativePurchases.purchaseProduct({ productIdentifier: REMOVE_ADS_PRODUCT, productType: PURCHASE_TYPE.INAPP, quantity: 1 });
      if (t.purchaseState !== undefined && t.purchaseState !== '1') return 'Your payment is pending. Ads will switch off once it goes through.';
      this.setAdFree(true);
      return null;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      return /cancel/i.test(msg) ? 'Purchase cancelled.' : 'The purchase did not go through. Please try again.';
    } finally {
      this.busy = false;
      this.onChange();
    }
  }

  /** Restores "Remove ads" after a reinstall or on a new phone. Returns a message for the player. */
  async restore(): Promise<string> {
    if (!this.purchases) return 'Purchases are only available in the Android app from Google Play.';
    try {
      await this.purchases.NativePurchases.restorePurchases();
      await this.refreshOwnership();
      this.onChange();
      return this.adFree ? 'Ads removed. Thanks for your support!' : 'No purchases found for this Google account.';
    } catch {
      return 'Could not reach Google Play. Please try again.';
    }
  }
}
