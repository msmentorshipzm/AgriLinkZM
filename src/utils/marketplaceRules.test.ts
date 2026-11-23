import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canBuyerRateSeller,
  computeSellerAggregateRating,
  computeTrialStatus,
  filterAndRankListings,
  formatZMW,
  getPublicListingCoordinates,
  haversineDistanceKm,
  isAccountDormant,
  isBuyerFeeEligible,
  shouldAutoFreezeListing,
} from './marketplaceRules.ts';
import type {
  ContactRevealRecord,
  Listing,
  PlatformConfig,
  Review,
  ScamReport,
  UserAccount,
} from '../types/marketplace.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

const baseConfig: PlatformConfig = {
  platformLaunchedAt: 1_700_000_000_000,
  defaultTrialDays: 30,
  advertiserMonthlyFeeZmw: 150,
  advertiserPaymentRequired: true,
  buyerFeeEnabled: false,
  buyerFeeAmountZmw: 3,
  buyerTractionMonthsOverride: false,
  dormancyThresholdDays: 60,
  manualMomoNumber: '0976 405 828',
  manualAirtelNumber: '0977 882 310',
};

test('computeTrialStatus triggers 5-day reminder, 1-day reminder, and payment_required on expiry', () => {
  const start = 1_700_000_000_000;
  const seller: Pick<UserAccount, 'role' | 'accountStatus' | 'trialStartAt' | 'trialDaysAllocated' | 'paidUntilAt'> = {
    role: 'advertiser',
    accountStatus: 'trial_active',
    trialStartAt: start,
    trialDaysAllocated: 30,
  };

  const day26 = computeTrialStatus(seller, baseConfig, start + 26 * DAY_MS);
  assert.equal(day26.daysRemaining, 4);
  assert.equal(day26.reminderStage, '5_days');
  assert.equal(day26.listingsShouldPause, false);

  const day29 = computeTrialStatus(seller, baseConfig, start + 29.2 * DAY_MS);
  assert.equal(day29.daysRemaining, 1);
  assert.equal(day29.reminderStage, '1_day');
  assert.equal(day29.listingsShouldPause, false);

  const day31 = computeTrialStatus(seller, baseConfig, start + 31 * DAY_MS);
  assert.equal(day31.isExpired, true);
  assert.equal(day31.effectiveAccountStatus, 'payment_required');
  assert.equal(day31.listingsShouldPause, true);

  const day31PaymentsOff = computeTrialStatus(
    seller,
    { advertiserPaymentRequired: false },
    start + 31 * DAY_MS
  );
  assert.equal(day31PaymentsOff.listingsShouldPause, false);
  assert.equal(day31PaymentsOff.reminderStage, 'none');
  assert.equal(day31PaymentsOff.effectiveAccountStatus, 'trial_active');
});

test('shouldAutoFreezeListing freezes only when 3 distinct verified buyers report the same listing', () => {
  const makeReport = (id: string, buyerId: string, status: ScamReport['status'] = 'open'): ScamReport => ({
    id,
    listingId: 'lst-1',
    sellerId: 'sel-1',
    reporterBuyerId: buyerId,
    reporterName: 'Buyer',
    reason: 'Fake or stolen photos',
    details: 'Looks copied',
    status,
    createdAt: 1000,
  });

  assert.equal(
    shouldAutoFreezeListing([makeReport('r1', 'b1'), makeReport('r2', 'b1'), makeReport('r3', 'b2')], 'lst-1'),
    false
  );

  assert.equal(
    shouldAutoFreezeListing(
      [makeReport('r1', 'b1'), makeReport('r2', 'b2'), makeReport('r3', 'b3', 'dismissed')],
      'lst-1'
    ),
    false
  );

  assert.equal(
    shouldAutoFreezeListing(
      [makeReport('r1', 'b1'), makeReport('r2', 'b2'), makeReport('r3', 'b3')],
      'lst-1'
    ),
    true
  );
});

test('canBuyerRateSeller enforces contact reveal gate', () => {
  const reveals: ContactRevealRecord[] = [
    { id: 'cr1', listingId: 'lst-1', sellerId: 'sel-1', buyerId: 'buy-1', createdAt: 1000 },
  ];

  assert.equal(canBuyerRateSeller('buy-1', 'sel-1', reveals), true);
  assert.equal(canBuyerRateSeller('buy-2', 'sel-1', reveals), false);
  assert.equal(canBuyerRateSeller('sel-1', 'sel-1', reveals), false);
});

test('computeSellerAggregateRating averages all 3 agricultural trust criteria', () => {
  const reviews: Review[] = [
    {
      id: 'rv1',
      sellerId: 'sel-1',
      buyerId: 'b1',
      buyerName: 'Mwamba',
      listingId: 'l1',
      productQuality: 5,
      communication: 4,
      pricingHonesty: 5,
      overallRating: 4.7,
      comment: 'Clean grade A maize.',
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'rv2',
      sellerId: 'sel-1',
      buyerId: 'b2',
      buyerName: 'Mutale',
      listingId: 'l1',
      productQuality: 4,
      communication: 4,
      pricingHonesty: 4,
      overallRating: 4.0,
      comment: 'Prompt pickup in Lusaka.',
      createdAt: 2000,
      updatedAt: 2000,
    },
  ];

  const summary = computeSellerAggregateRating(reviews, 'sel-1');
  assert.equal(summary.reviewCount, 2);
  assert.equal(summary.averageRating, 4.4);
  assert.equal(summary.productQualityAvg, 4.5);
  assert.equal(summary.communicationAvg, 4.0);
  assert.equal(summary.pricingHonestyAvg, 4.5);
});

test('isAccountDormant and isBuyerFeeEligible respect configured thresholds', () => {
  const now = 1_700_000_000_000 + 100 * DAY_MS;
  assert.equal(
    isAccountDormant({ role: 'advertiser', accountStatus: 'trial_active', lastActiveAt: now - 65 * DAY_MS }, 60, now),
    true
  );
  assert.equal(
    isAccountDormant({ role: 'super_admin', accountStatus: 'active_paid', lastActiveAt: now - 120 * DAY_MS }, 60, now),
    false
  );

  assert.equal(
    isBuyerFeeEligible({ platformLaunchedAt: now - 40 * DAY_MS, buyerTractionMonthsOverride: false }, now),
    false
  );
  assert.equal(
    isBuyerFeeEligible({ platformLaunchedAt: now - 95 * DAY_MS, buyerTractionMonthsOverride: false }, now),
    true
  );
});

test('getPublicListingCoordinates enforces seller location privacy and verification tier gate', () => {
  const farmCoords = { lat: -15.3412, lng: 28.6951 };
  const tier1Seller = { verificationTier: 'tier1_id' as const };
  const tier3Seller = { verificationTier: 'tier3_site' as const };

  // Tier 1 seller requesting precise_pin still gets general district centroid
  const maskedTier1 = getPublicListingCoordinates(
    { province: 'Lusaka', district: 'Chongwe', coordinates: farmCoords, locationPrivacy: 'precise_pin' },
    tier1Seller
  );
  assert.equal(maskedTier1.isPrecise, false);
  assert.notEqual(maskedTier1.lat, farmCoords.lat);

  // Tier 3 verified seller choosing district_general gets masked centroid
  const maskedChoice = getPublicListingCoordinates(
    { province: 'Lusaka', district: 'Chongwe', coordinates: farmCoords, locationPrivacy: 'district_general' },
    tier3Seller
  );
  assert.equal(maskedChoice.isPrecise, false);

  // Tier 3 verified seller choosing precise_pin exposes exact farm pin
  const precise = getPublicListingCoordinates(
    { province: 'Lusaka', district: 'Chongwe', coordinates: farmCoords, locationPrivacy: 'precise_pin' },
    tier3Seller
  );
  assert.equal(precise.isPrecise, true);
  assert.equal(precise.lat, farmCoords.lat);
});

test('filterAndRankListings filters by radius distance and prioritizes verified sellers with video', () => {
  const sellers: Record<string, UserAccount> = {
    s1: {
      id: 's1',
      name: 'Tier 1 Farmer',
      email: 's1@example.zm',
      phone: '+260971000001',
      role: 'advertiser',
      staffPermissions: [],
      province: 'Lusaka',
      district: 'Chongwe',
      verificationTier: 'tier1_id',
      accountStatus: 'trial_active',
      trialStartAt: 1000,
      trialDaysAllocated: 30,
      lastActiveAt: 1000,
      createdAt: 1000,
      savedListingIds: [],
    },
    s2: {
      id: 's2',
      name: 'Tier 3 Farm',
      email: 's2@example.zm',
      phone: '+260971000002',
      role: 'advertiser',
      staffPermissions: [],
      province: 'Lusaka',
      district: 'Kafue',
      verificationTier: 'tier3_site',
      accountStatus: 'active_paid',
      trialStartAt: 1000,
      trialDaysAllocated: 30,
      lastActiveAt: 1000,
      createdAt: 1000,
      savedListingIds: [],
    },
    s3: {
      id: 's3',
      name: 'Chipata Farm',
      email: 's3@example.zm',
      phone: '+260971000003',
      role: 'advertiser',
      staffPermissions: [],
      province: 'Eastern',
      district: 'Chipata',
      verificationTier: 'tier2_business',
      accountStatus: 'active_paid',
      trialStartAt: 1000,
      trialDaysAllocated: 30,
      lastActiveAt: 1000,
      createdAt: 1000,
      savedListingIds: [],
    },
  };

  const listings: Listing[] = [
    {
      id: 'l1',
      sellerId: 's1',
      title: 'White Maize 50kg',
      category: 'Crops & Grains',
      description: 'Dried maize',
      priceZmw: 330,
      unitLabel: 'per 50kg bag',
      quantityAvailable: '100 bags',
      province: 'Lusaka',
      district: 'Chongwe',
      locationPrivacy: 'district_general',
      images: ['/a.jpg'],
      hasVideoWalkthrough: false,
      status: 'active',
      impressions: 10,
      views: 5,
      uniqueVisitors: 4,
      videoPlays: 0,
      contactReveals: 1,
      createdAt: 2000,
      updatedAt: 2000,
    },
    {
      id: 'l2',
      sellerId: 's2',
      title: 'Kafue Maize Wholesale',
      category: 'Crops & Grains',
      description: 'Site verified',
      priceZmw: 320,
      unitLabel: 'per 50kg bag',
      quantityAvailable: '500 bags',
      province: 'Lusaka',
      district: 'Kafue',
      coordinates: { lat: -15.7691, lng: 28.1814 },
      locationPrivacy: 'precise_pin',
      images: ['/b.jpg'],
      hasVideoWalkthrough: true,
      status: 'active',
      impressions: 20,
      views: 15,
      uniqueVisitors: 12,
      videoPlays: 4,
      contactReveals: 3,
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'l3',
      sellerId: 's3',
      title: 'Chipata Groundnuts',
      category: 'Crops & Grains',
      description: 'Eastern Province',
      priceZmw: 900,
      unitLabel: 'per 50kg bag',
      quantityAvailable: '80 bags',
      province: 'Eastern',
      district: 'Chipata',
      locationPrivacy: 'district_general',
      images: ['/c.jpg'],
      hasVideoWalkthrough: false,
      status: 'active',
      impressions: 10,
      views: 5,
      uniqueVisitors: 4,
      videoPlays: 0,
      contactReveals: 1,
      createdAt: 1500,
      updatedAt: 1500,
    },
  ];

  // Lusaka center radius 100km should include Chongwe (~39km) and Kafue (~45km) but exclude Chipata (~500km)
  const lusakaCenter = { lat: -15.3875, lng: 28.3228 };
  assert.ok(haversineDistanceKm(lusakaCenter, { lat: -13.6333, lng: 32.65 }) > 400);

  const nearby = filterAndRankListings(listings, sellers, [], {
    radiusCenter: lusakaCenter,
    radiusKm: 100,
  });
  assert.equal(nearby.length, 2);
  assert.equal(nearby[0].id, 'l2');
  assert.equal(formatZMW(320), 'ZMW 320.00');
});
