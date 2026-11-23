import { getDistrictCoordinates } from '../data/zambia.ts';
import type {
  AccountStatus,
  ContactRevealRecord,
  LatLng,
  Listing,
  PlatformConfig,
  Review,
  ScamReport,
  UserAccount,
  VerificationTier,
} from '../types/marketplace.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TrialEvaluation {
  daysRemaining: number;
  isExpired: boolean;
  reminderStage: 'none' | '5_days' | '1_day' | 'expired_today';
  effectiveAccountStatus: AccountStatus;
  listingsShouldPause: boolean;
}

export function computeTrialStatus(
  user: Pick<UserAccount, 'role' | 'accountStatus' | 'trialStartAt' | 'trialDaysAllocated' | 'paidUntilAt'>,
  config: Pick<PlatformConfig, 'advertiserPaymentRequired'>,
  nowMs: number = Date.now()
): TrialEvaluation {
  if (user.role !== 'advertiser') {
    return {
      daysRemaining: 0,
      isExpired: false,
      reminderStage: 'none',
      effectiveAccountStatus: user.accountStatus,
      listingsShouldPause: false,
    };
  }

  if (
    user.accountStatus === 'suspended' ||
    user.accountStatus === 'banned' ||
    user.accountStatus === 'dormant' ||
    user.accountStatus === 'frozen' ||
    user.accountStatus === 'under_investigation'
  ) {
    return {
      daysRemaining: 0,
      isExpired: true,
      reminderStage: 'none',
      effectiveAccountStatus: user.accountStatus,
      listingsShouldPause: true,
    };
  }

  if (!config.advertiserPaymentRequired) {
    return {
      daysRemaining: 0,
      isExpired: false,
      reminderStage: 'none',
      effectiveAccountStatus: 'trial_active',
      listingsShouldPause: false,
    };
  }

  if (user.paidUntilAt && user.paidUntilAt > nowMs) {
    return {
      daysRemaining: Math.ceil((user.paidUntilAt - nowMs) / DAY_MS),
      isExpired: false,
      reminderStage: 'none',
      effectiveAccountStatus: 'active_paid',
      listingsShouldPause: false,
    };
  }

  const trialEndMs = user.trialStartAt + Math.max(0, user.trialDaysAllocated) * DAY_MS;
  const remainingMs = trialEndMs - nowMs;
  const daysRemaining = Math.max(0, Math.ceil(remainingMs / DAY_MS));
  const isExpired = remainingMs <= 0;

  let reminderStage: TrialEvaluation['reminderStage'] = 'none';
  if (isExpired) {
    reminderStage = 'expired_today';
  } else if (daysRemaining <= 1) {
    reminderStage = '1_day';
  } else if (daysRemaining <= 5) {
    reminderStage = '5_days';
  }

  if (isExpired && config.advertiserPaymentRequired) {
    return {
      daysRemaining: 0,
      isExpired: true,
      reminderStage,
      effectiveAccountStatus: 'payment_required',
      listingsShouldPause: true,
    };
  }

  return {
    daysRemaining,
    isExpired,
    reminderStage,
    effectiveAccountStatus: 'trial_active',
    listingsShouldPause: false,
  };
}

export function shouldAutoFreezeListing(reports: ScamReport[], listingId: string): boolean {
  const distinctVerifiedBuyers = new Set<string>();
  for (const report of reports) {
    if (report.listingId === listingId && report.status !== 'dismissed') {
      distinctVerifiedBuyers.add(report.reporterBuyerId);
    }
  }
  return distinctVerifiedBuyers.size >= 3;
}

export function canBuyerRateSeller(
  buyerId: string,
  sellerId: string,
  contactReveals: ContactRevealRecord[]
): boolean {
  if (!buyerId || !sellerId || buyerId === sellerId) {
    return false;
  }
  return contactReveals.some((r) => r.buyerId === buyerId && r.sellerId === sellerId);
}

export interface SellerRatingSummary {
  averageRating: number;
  reviewCount: number;
  productQualityAvg: number;
  communicationAvg: number;
  pricingHonestyAvg: number;
}

export function computeSellerAggregateRating(reviews: Review[], sellerId: string): SellerRatingSummary {
  const sellerReviews = reviews.filter((r) => r.sellerId === sellerId);
  if (sellerReviews.length === 0) {
    return {
      averageRating: 0,
      reviewCount: 0,
      productQualityAvg: 0,
      communicationAvg: 0,
      pricingHonestyAvg: 0,
    };
  }
  const count = sellerReviews.length;
  const qualitySum = sellerReviews.reduce((acc, r) => acc + r.productQuality, 0);
  const commSum = sellerReviews.reduce((acc, r) => acc + r.communication, 0);
  const priceSum = sellerReviews.reduce((acc, r) => acc + r.pricingHonesty, 0);
  const overallSum = sellerReviews.reduce((acc, r) => acc + r.overallRating, 0);

  const round1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;

  return {
    averageRating: round1(overallSum / count),
    reviewCount: count,
    productQualityAvg: round1(qualitySum / count),
    communicationAvg: round1(commSum / count),
    pricingHonestyAvg: round1(priceSum / count),
  };
}

export function isAccountDormant(
  user: Pick<UserAccount, 'role' | 'lastActiveAt' | 'accountStatus'>,
  dormancyThresholdDays: number,
  nowMs: number = Date.now()
): boolean {
  if (user.role === 'super_admin' || user.role === 'staff') {
    return false;
  }
  if (
    user.accountStatus === 'banned' ||
    user.accountStatus === 'suspended' ||
    user.accountStatus === 'frozen' ||
    user.accountStatus === 'under_investigation'
  ) {
    return false;
  }
  const thresholdMs = Math.max(1, dormancyThresholdDays) * DAY_MS;
  return nowMs - user.lastActiveAt >= thresholdMs;
}

export function isBuyerFeeEligible(
  config: Pick<PlatformConfig, 'platformLaunchedAt' | 'buyerTractionMonthsOverride'>,
  nowMs: number = Date.now()
): boolean {
  if (config.buyerTractionMonthsOverride) {
    return true;
  }
  const ninetyDaysMs = 90 * DAY_MS;
  return nowMs - config.platformLaunchedAt >= ninetyDaysMs;
}

export function getTierWeight(tier: VerificationTier): number {
  switch (tier) {
    case 'tier3_site':
      return 3;
    case 'tier2_business':
      return 2;
    case 'tier1_id':
      return 1;
    default:
      return 0;
  }
}

export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Math.round(R * c * 10) / 10;
}

export function getPublicListingCoordinates(
  listing: Pick<Listing, 'province' | 'district' | 'coordinates' | 'locationPrivacy'>,
  seller?: Pick<UserAccount, 'verificationTier'>
): { lat: number; lng: number; isPrecise: boolean } {
  const fallback = getDistrictCoordinates(listing.province, listing.district);
  const sellerEligibleForPrecise =
    seller?.verificationTier === 'tier2_business' || seller?.verificationTier === 'tier3_site';

  if (
    listing.locationPrivacy === 'precise_pin' &&
    sellerEligibleForPrecise &&
    listing.coordinates &&
    Number.isFinite(listing.coordinates.lat) &&
    Number.isFinite(listing.coordinates.lng)
  ) {
    return {
      lat: listing.coordinates.lat,
      lng: listing.coordinates.lng,
      isPrecise: true,
    };
  }

  return {
    lat: fallback.lat,
    lng: fallback.lng,
    isPrecise: false,
  };
}

export interface ListingSearchFilters {
  query?: string;
  province?: string;
  district?: string;
  category?: string;
  minVerification?: VerificationTier | 'all';
  maxPriceZmw?: number | null;
  videoOnly?: boolean;
  radiusCenter?: LatLng | null;
  radiusKm?: number | null;
}

export function filterAndRankListings(
  listings: Listing[],
  sellersById: Record<string, UserAccount>,
  reviews: Review[],
  filters: ListingSearchFilters
): Listing[] {
  const q = (filters.query || '').trim().toLowerCase();
  const minWeight =
    filters.minVerification && filters.minVerification !== 'all'
      ? getTierWeight(filters.minVerification)
      : 0;

  const filtered = listings.filter((item) => {
    if (item.status !== 'active') return false;
    const seller = sellersById[item.sellerId];
    if (!seller) return false;
    if (
      seller.accountStatus === 'banned' ||
      seller.accountStatus === 'suspended' ||
      seller.accountStatus === 'frozen' ||
      seller.accountStatus === 'under_investigation' ||
      seller.accountStatus === 'dormant' ||
      seller.accountStatus === 'payment_required'
    ) {
      return false;
    }

    if (filters.province && filters.province !== 'All' && item.province !== filters.province) {
      return false;
    }
    if (filters.district && filters.district !== 'All' && item.district !== filters.district) {
      return false;
    }
    if (filters.category && filters.category !== 'All' && item.category !== filters.category) {
      return false;
    }
    if (filters.videoOnly && !item.hasVideoWalkthrough) {
      return false;
    }
    if (typeof filters.maxPriceZmw === 'number' && filters.maxPriceZmw > 0 && item.priceZmw > filters.maxPriceZmw) {
      return false;
    }
    if (getTierWeight(seller.verificationTier) < minWeight) {
      return false;
    }
    if (filters.radiusCenter && typeof filters.radiusKm === 'number' && filters.radiusKm > 0) {
      const publicCoords = getPublicListingCoordinates(item, seller);
      const dist = haversineDistanceKm(filters.radiusCenter, publicCoords);
      if (dist > filters.radiusKm) {
        return false;
      }
    }
    if (q.length > 0) {
      const hay = `${item.title} ${item.description} ${item.category} ${item.province} ${item.district} ${seller.businessName || seller.name}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    const sellerA = sellersById[a.sellerId];
    const sellerB = sellersById[b.sellerId];
    const tierA = sellerA ? getTierWeight(sellerA.verificationTier) : 0;
    const tierB = sellerB ? getTierWeight(sellerB.verificationTier) : 0;
    const ratingA = computeSellerAggregateRating(reviews, a.sellerId).averageRating;
    const ratingB = computeSellerAggregateRating(reviews, b.sellerId).averageRating;

    const scoreA = tierA * 10 + ratingA * 2 + (a.hasVideoWalkthrough ? 3 : 0);
    const scoreB = tierB * 10 + ratingB * 2 + (b.hasVideoWalkthrough ? 3 : 0);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return b.createdAt - a.createdAt;
  });
}

export function formatZMW(amount: number): string {
  return `ZMW ${amount.toLocaleString('en-ZM', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function normalizeZambianPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('260') && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.startsWith('0') && digits.length === 10) {
    return `+260${digits.slice(1)}`;
  }
  return raw.trim();
}
