import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignSystemId,
  buildCsvExport,
  buildReportedListingsOverview,
  computePortalMetricsReport,
  normalizeSystemIdInput,
} from './adminReporting.ts';
import type {
  Listing,
  PaymentRecord,
  Review,
  ScamReport,
  UserAccount,
} from '../types/marketplace.ts';

test('assignSystemId generates sequential unique role-prefixed IDs', () => {
  const id1 = assignSystemId('advertiser', ['AZM-ADV-0001', 'AZM-ADV-0002', 'AZM-BUY-0001']);
  assert.equal(id1, 'AZM-ADV-0003');

  const id2 = assignSystemId('buyer', ['AZM-BUY-0001']);
  assert.equal(id2, 'AZM-BUY-0002');

  const id3 = assignSystemId('staff', []);
  assert.equal(id3, 'AZM-STF-0001');

  assert.equal(normalizeSystemIdInput(' azm-adv-0099! '), 'AZM-ADV-0099');
});

test('computePortalMetricsReport aggregates money collected, network totals, user statuses, and provinces', () => {
  const users: UserAccount[] = [
    {
      id: 'u1',
      systemId: 'AZM-ADV-0001',
      name: 'Kelvin Mwansa',
      email: 'k@zm.zm',
      phone: '+260977000001',
      role: 'advertiser',
      staffPermissions: [],
      province: 'Lusaka',
      district: 'Chongwe',
      verificationTier: 'tier3_site',
      accountStatus: 'active_paid',
      emailVerified: true,
      trialStartAt: 1000,
      trialDaysAllocated: 30,
      lastActiveAt: 2000,
      createdAt: 1000,
      savedListingIds: [],
    },
    {
      id: 'u2',
      systemId: 'AZM-BUY-0001',
      name: 'Chileshe Phiri',
      email: 'c@zm.zm',
      phone: '+260977000002',
      role: 'buyer',
      staffPermissions: [],
      province: 'Copperbelt',
      district: 'Kitwe',
      verificationTier: 'tier1_id',
      accountStatus: 'frozen',
      emailVerified: true,
      trialStartAt: 1000,
      trialDaysAllocated: 30,
      lastActiveAt: 2000,
      createdAt: 1000,
      savedListingIds: [],
    },
  ];

  const listings: Listing[] = [
    {
      id: 'l1',
      sellerId: 'u1',
      title: 'Maize',
      category: 'Crops & Grains',
      description: 'Clean',
      priceZmw: 300,
      unitLabel: 'bag',
      quantityAvailable: '100',
      province: 'Lusaka',
      district: 'Chongwe',
      locationPrivacy: 'precise_pin',
      images: ['/a.jpg'],
      hasVideoWalkthrough: true,
      status: 'active',
      impressions: 500,
      views: 100,
      uniqueVisitors: 80,
      videoPlays: 40,
      contactReveals: 25,
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];

  const payments: PaymentRecord[] = [
    {
      id: 'p1',
      userId: 'u1',
      userName: 'Kelvin',
      userPhone: '+260977000001',
      paymentType: 'advertiser_subscription',
      method: 'flutterwave_ussd',
      network: 'Airtel Money',
      amountZmw: 150,
      referenceCode: 'FLW-1',
      transactionId: 'TX1',
      status: 'approved',
      createdAt: 1000,
    },
    {
      id: 'p2',
      userId: 'u2',
      userName: 'Chileshe',
      userPhone: '+260977000002',
      paymentType: 'buyer_account_fee',
      method: 'manual_pop',
      network: 'MTN MoMo',
      amountZmw: 3,
      referenceCode: 'POP-1',
      transactionId: 'TX2',
      status: 'pending',
      createdAt: 2000,
    },
  ];

  const report = computePortalMetricsReport({
    users,
    listings,
    payments,
    kycSubmissions: [],
    scamReports: [],
    blacklist: [],
    conversations: [],
    messages: [],
  });

  assert.equal(report.financial.totalCollectedZmw, 150);
  assert.equal(report.financial.pendingZmw, 3);
  assert.equal(report.financial.advertiserCollectedZmw, 150);
  assert.equal(report.financial.byNetwork.find((n) => n.network === 'Airtel Money')?.collectedZmw, 150);
  assert.equal(report.financial.byNetwork.find((n) => n.network === 'MTN MoMo')?.pendingZmw, 3);
  assert.equal(report.users.byStatus.frozen, 1);
  assert.equal(report.users.byStatus.activeOrTrial, 1);
  assert.equal(report.portalActivity.contactConversionPct, 25);
  assert.equal(report.provincialBreakdown.find((p) => p.province === 'Lusaka')?.impressions, 500);
});

test('buildCsvExport escapes commas and quotes properly', () => {
  const csv = buildCsvExport(['ID', 'Name'], [['AZM-ADV-0001', 'Mwansa, "Chongwe" Farms']]);
  assert.equal(csv, 'ID,Name\nAZM-ADV-0001,"Mwansa, ""Chongwe"" Farms"');
});

test('buildReportedListingsOverview aggregates reported listings and reported advertiser ratings', () => {
  const users: UserAccount[] = [
    {
      id: 'u1',
      systemId: 'AZM-ADV-0005',
      name: 'Thandiwe Zulu',
      businessName: 'Chipata Cooperative Growers',
      email: 'thandiwe@zm.zm',
      phone: '+260967419022',
      role: 'advertiser',
      staffPermissions: [],
      province: 'Eastern',
      district: 'Chipata',
      verificationTier: 'tier1_id',
      accountStatus: 'trial_active',
      trialStartAt: 1000,
      trialDaysAllocated: 30,
      lastActiveAt: 2000,
      createdAt: 1000,
      savedListingIds: [],
    },
  ];
  const listings: Listing[] = [
    {
      id: 'lst-7',
      sellerId: 'u1',
      title: 'Organic Groundnuts',
      category: 'Crops & Grains',
      description: 'Shelled',
      priceZmw: 1180,
      unitLabel: 'per 50kg bag',
      quantityAvailable: '120 bags',
      province: 'Eastern',
      district: 'Chipata',
      locationPrivacy: 'district_general',
      images: ['/a.jpg'],
      hasVideoWalkthrough: false,
      status: 'active',
      impressions: 300,
      views: 80,
      uniqueVisitors: 60,
      videoPlays: 0,
      contactReveals: 10,
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];
  const reviews: Review[] = [
    {
      id: 'rev-a',
      sellerId: 'u1',
      buyerId: 'b1',
      buyerName: 'Buyer One',
      listingId: 'lst-7',
      productQuality: 2,
      communication: 3,
      pricingHonesty: 1,
      overallRating: 2.0,
      comment: 'Price changed after call.',
      createdAt: 3000,
      updatedAt: 3000,
    },
    {
      id: 'rev-b',
      sellerId: 'u1',
      buyerId: 'b2',
      buyerName: 'Buyer Two',
      listingId: 'lst-7',
      productQuality: 4,
      communication: 4,
      pricingHonesty: 4,
      overallRating: 4.0,
      comment: 'Bag weight was ok.',
      createdAt: 4000,
      updatedAt: 4000,
    },
  ];
  const scamReports: ScamReport[] = [
    {
      id: 'sr-1',
      listingId: 'lst-7',
      sellerId: 'u1',
      reporterBuyerId: 'b1',
      reporterName: 'Buyer One',
      reason: 'Misleading location or price',
      details: 'Extra fee asked.',
      status: 'open',
      createdAt: 5000,
    },
    {
      id: 'sr-2',
      listingId: 'lst-7',
      sellerId: 'u1',
      reporterBuyerId: 'b2',
      reporterName: 'Buyer Two',
      reason: 'Fake or stolen photos',
      details: 'Wrong crop photo.',
      status: 'resolved_frozen',
      createdAt: 6000,
    },
  ];

  const overview = buildReportedListingsOverview({
    scamReports,
    listings,
    users,
    reviews,
  });

  assert.equal(overview.length, 1);
  assert.equal(overview[0].listingTitle, 'Organic Groundnuts');
  assert.equal(overview[0].sellerName, 'Thandiwe Zulu');
  assert.equal(overview[0].sellerSystemId, 'AZM-ADV-0005');
  assert.equal(overview[0].totalReportsCount, 2);
  assert.equal(overview[0].openReportsCount, 1);
  assert.equal(overview[0].sellerRating.averageRating, 3.0);
  assert.equal(overview[0].sellerRating.reviewCount, 2);
  assert.equal(overview[0].sellerRating.pricingHonestyAvg, 2.5);
});
