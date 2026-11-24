import { PROVINCE_NAMES } from '../data/zambia.ts';
import type {
  AccountStatus,
  BlacklistRecord,
  ChatConversation,
  ChatMessage,
  KycSubmission,
  Listing,
  PaymentRecord,
  Review,
  ScamReport,
  UserAccount,
  UserRole,
  VerificationTier,
} from '../types/marketplace.ts';
import {
  computeSellerAggregateRating,
  type SellerRatingSummary,
} from './marketplaceRules.ts';

const ROLE_PREFIX: Record<UserRole, string> = {
  super_admin: 'ADM',
  staff: 'STF',
  advertiser: 'ADV',
  buyer: 'BUY',
};

export function assignSystemId(
  role: UserRole,
  existingIds: Array<string | undefined>
): string {
  const prefix = `AZM-${ROLE_PREFIX[role] || 'USR'}-`;
  const used = new Set(
    existingIds
      .filter((id): id is string => Boolean(id && id.trim()))
      .map((id) => id.trim().toUpperCase())
  );

  let maxSeq = 0;
  for (const id of used) {
    if (id.startsWith(prefix)) {
      const tail = Number.parseInt(id.slice(prefix.length), 10);
      if (Number.isFinite(tail) && tail > maxSeq) {
        maxSeq = tail;
      }
    }
  }

  let candidateSeq = maxSeq + 1;
  let candidate = `${prefix}${String(candidateSeq).padStart(4, '0')}`;
  while (used.has(candidate)) {
    candidateSeq += 1;
    candidate = `${prefix}${String(candidateSeq).padStart(4, '0')}`;
  }
  return candidate;
}

export function normalizeSystemIdInput(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

export interface ProvincialReportRow {
  province: string;
  usersCount: number;
  advertisersCount: number;
  buyersCount: number;
  activeListingsCount: number;
  impressions: number;
  contactReveals: number;
}

export interface PortalMetricsReport {
  financial: {
    totalCollectedZmw: number;
    pendingZmw: number;
    rejectedZmw: number;
    approvedCount: number;
    pendingCount: number;
    rejectedCount: number;
    advertiserCollectedZmw: number;
    buyerFeeCollectedZmw: number;
    byNetwork: Array<{
      network: PaymentRecord['network'];
      collectedZmw: number;
      pendingZmw: number;
      approvedCount: number;
      pendingCount: number;
    }>;
    byMethod: {
      manualPopZmw: number;
      manualPopCount: number;
      flutterwaveUssdZmw: number;
      flutterwaveUssdCount: number;
    };
  };
  users: {
    total: number;
    superAdmins: number;
    staff: number;
    advertisers: number;
    buyers: number;
    verifiedEmails: number;
    unverifiedEmails: number;
    byStatus: {
      activeOrTrial: number;
      underInvestigation: number;
      frozen: number;
      suspended: number;
      dormant: number;
      banned: number;
      paymentRequired: number;
    };
    byTier: {
      tier3_site: number;
      tier2_business: number;
      tier1_id: number;
      unverified: number;
    };
  };
  portalActivity: {
    totalListings: number;
    activeListings: number;
    frozenOrInvestigatingListings: number;
    pausedOrArchivedListings: number;
    totalImpressions: number;
    totalViews: number;
    totalVideoPlays: number;
    totalContactReveals: number;
    contactConversionPct: number;
    conversationsCount: number;
    messagesCount: number;
    pendingKycCount: number;
    openScamReportsCount: number;
    blacklistCount: number;
  };
  provincialBreakdown: ProvincialReportRow[];
}

export function computePortalMetricsReport(params: {
  users: UserAccount[];
  listings: Listing[];
  payments: PaymentRecord[];
  kycSubmissions: KycSubmission[];
  scamReports: ScamReport[];
  blacklist: BlacklistRecord[];
  conversations: ChatConversation[];
  messages: ChatMessage[];
}): PortalMetricsReport {
  const {
    users,
    listings,
    payments,
    kycSubmissions,
    scamReports,
    blacklist,
    conversations,
    messages,
  } = params;

  const approvedPayments = payments.filter((p) => p.status === 'approved');
  const pendingPayments = payments.filter((p) => p.status === 'pending');
  const rejectedPayments = payments.filter((p) => p.status === 'rejected');

  const sumAmount = (list: PaymentRecord[]) =>
    Math.round(list.reduce((acc, p) => acc + (Number(p.amountZmw) || 0), 0) * 100) / 100;

  const networks: PaymentRecord['network'][] = ['MTN MoMo', 'Airtel Money', 'Zamtel Kwacha'];
  const byNetwork = networks.map((network) => {
    const netApproved = approvedPayments.filter((p) => p.network === network);
    const netPending = pendingPayments.filter((p) => p.network === network);
    return {
      network,
      collectedZmw: sumAmount(netApproved),
      pendingZmw: sumAmount(netPending),
      approvedCount: netApproved.length,
      pendingCount: netPending.length,
    };
  });

  const manualApproved = approvedPayments.filter((p) => p.method === 'manual_pop');
  const flwApproved = approvedPayments.filter((p) => p.method === 'flutterwave_ussd');

  const totalImpressions = listings.reduce((acc, l) => acc + (l.impressions || 0), 0);
  const totalViews = listings.reduce((acc, l) => acc + (l.views || 0), 0);
  const totalVideoPlays = listings.reduce((acc, l) => acc + (l.videoPlays || 0), 0);
  const totalContactReveals = listings.reduce((acc, l) => acc + (l.contactReveals || 0), 0);

  const provincialBreakdown: ProvincialReportRow[] = PROVINCE_NAMES.map((prov) => {
    const provUsers = users.filter((u) => u.province === prov);
    const provListings = listings.filter((l) => l.province === prov);
    return {
      province: prov,
      usersCount: provUsers.length,
      advertisersCount: provUsers.filter((u) => u.role === 'advertiser').length,
      buyersCount: provUsers.filter((u) => u.role === 'buyer').length,
      activeListingsCount: provListings.filter((l) => l.status === 'active').length,
      impressions: provListings.reduce((acc, l) => acc + (l.impressions || 0), 0),
      contactReveals: provListings.reduce((acc, l) => acc + (l.contactReveals || 0), 0),
    };
  });

  return {
    financial: {
      totalCollectedZmw: sumAmount(approvedPayments),
      pendingZmw: sumAmount(pendingPayments),
      rejectedZmw: sumAmount(rejectedPayments),
      approvedCount: approvedPayments.length,
      pendingCount: pendingPayments.length,
      rejectedCount: rejectedPayments.length,
      advertiserCollectedZmw: sumAmount(
        approvedPayments.filter((p) => p.paymentType === 'advertiser_subscription')
      ),
      buyerFeeCollectedZmw: sumAmount(
        approvedPayments.filter((p) => p.paymentType === 'buyer_account_fee')
      ),
      byNetwork,
      byMethod: {
        manualPopZmw: sumAmount(manualApproved),
        manualPopCount: manualApproved.length,
        flutterwaveUssdZmw: sumAmount(flwApproved),
        flutterwaveUssdCount: flwApproved.length,
      },
    },
    users: {
      total: users.length,
      superAdmins: users.filter((u) => u.role === 'super_admin').length,
      staff: users.filter((u) => u.role === 'staff').length,
      advertisers: users.filter((u) => u.role === 'advertiser').length,
      buyers: users.filter((u) => u.role === 'buyer').length,
      verifiedEmails: users.filter((u) => u.emailVerified !== false).length,
      unverifiedEmails: users.filter((u) => u.emailVerified === false).length,
      byStatus: {
        activeOrTrial: users.filter(
          (u) => u.accountStatus === 'trial_active' || u.accountStatus === 'active_paid'
        ).length,
        underInvestigation: users.filter((u) => u.accountStatus === 'under_investigation').length,
        frozen: users.filter((u) => u.accountStatus === 'frozen').length,
        suspended: users.filter((u) => u.accountStatus === 'suspended').length,
        dormant: users.filter((u) => u.accountStatus === 'dormant').length,
        banned: users.filter((u) => u.accountStatus === 'banned').length,
        paymentRequired: users.filter((u) => u.accountStatus === 'payment_required').length,
      },
      byTier: {
        tier3_site: users.filter((u) => u.verificationTier === 'tier3_site').length,
        tier2_business: users.filter((u) => u.verificationTier === 'tier2_business').length,
        tier1_id: users.filter((u) => u.verificationTier === 'tier1_id').length,
        unverified: users.filter((u) => u.verificationTier === 'unverified').length,
      },
    },
    portalActivity: {
      totalListings: listings.length,
      activeListings: listings.filter((l) => l.status === 'active').length,
      frozenOrInvestigatingListings: listings.filter(
        (l) => l.status === 'under_investigation' || l.status === 'pending_moderation'
      ).length,
      pausedOrArchivedListings: listings.filter(
        (l) => l.status === 'paused_payment' || l.status === 'archived' || l.status === 'sold_out'
      ).length,
      totalImpressions,
      totalViews,
      totalVideoPlays,
      totalContactReveals,
      contactConversionPct:
        totalViews > 0 ? Math.round((totalContactReveals / totalViews) * 1000) / 10 : 0,
      conversationsCount: conversations.length,
      messagesCount: messages.length,
      pendingKycCount: kycSubmissions.filter((k) => k.status === 'pending').length,
      openScamReportsCount: scamReports.filter((s) => s.status === 'open').length,
      blacklistCount: blacklist.length,
    },
    provincialBreakdown,
  };
}

function escapeCsvCell(value: string | number | boolean | undefined): string {
  const raw = value === undefined || value === null ? '' : String(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function buildCsvExport(
  headers: string[],
  rows: Array<Array<string | number | boolean | undefined>>
): string {
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  return lines.join('\n');
}

export interface ReportedListingOverview {
  listingId: string;
  listingTitle: string;
  listingCategory: Listing['category'] | 'Unknown';
  listingPriceZmw: number;
  listingProvince: string;
  listingDistrict: string;
  listingStatus: Listing['status'] | 'removed';
  listing?: Listing;
  sellerId: string;
  sellerName: string;
  sellerBusinessName?: string;
  sellerSystemId?: string;
  sellerVerificationTier: VerificationTier;
  sellerAccountStatus: AccountStatus;
  sellerRating: SellerRatingSummary;
  totalReportsCount: number;
  openReportsCount: number;
  resolvedReportsCount: number;
  dismissedReportsCount: number;
  sellerTotalReportsCount: number;
  latestReportAt: number;
  reasons: string[];
  reports: ScamReport[];
}

export function buildReportedListingsOverview(params: {
  scamReports: ScamReport[];
  listings: Listing[];
  users: UserAccount[];
  reviews: Review[];
}): ReportedListingOverview[] {
  const { scamReports, listings, users, reviews } = params;
  if (scamReports.length === 0) return [];

  const listingById = new Map(listings.map((l) => [l.id, l]));
  const userById = new Map(users.map((u) => [u.id, u]));

  const sellerTotalReports = new Map<string, number>();
  for (const sr of scamReports) {
    sellerTotalReports.set(sr.sellerId, (sellerTotalReports.get(sr.sellerId) || 0) + 1);
  }

  const groupedByListing = new Map<string, ScamReport[]>();
  for (const sr of scamReports) {
    const existing = groupedByListing.get(sr.listingId);
    if (existing) existing.push(sr);
    else groupedByListing.set(sr.listingId, [sr]);
  }

  const rows: ReportedListingOverview[] = [];
  for (const [listingId, reports] of groupedByListing.entries()) {
    const sortedReports = [...reports].sort((a, b) => b.createdAt - a.createdAt);
    const listing = listingById.get(listingId);
    const sellerId = listing?.sellerId || sortedReports[0].sellerId;
    const seller = userById.get(sellerId);
    const sellerRating = computeSellerAggregateRating(reviews, sellerId);

    const reasons = Array.from(new Set(sortedReports.map((r) => r.reason)));
    rows.push({
      listingId,
      listingTitle: listing?.title || `Listing ${listingId}`,
      listingCategory: listing?.category || 'Unknown',
      listingPriceZmw: listing?.priceZmw ?? 0,
      listingProvince: listing?.province || seller?.province || 'Unknown',
      listingDistrict: listing?.district || seller?.district || 'Unknown',
      listingStatus: listing?.status || 'removed',
      listing,
      sellerId,
      sellerName: seller?.name || sortedReports[0].sellerId,
      sellerBusinessName: seller?.businessName,
      sellerSystemId: seller?.systemId,
      sellerVerificationTier: seller?.verificationTier || 'unverified',
      sellerAccountStatus: seller?.accountStatus || 'trial_active',
      sellerRating,
      totalReportsCount: sortedReports.length,
      openReportsCount: sortedReports.filter((r) => r.status === 'open').length,
      resolvedReportsCount: sortedReports.filter((r) => r.status === 'resolved_frozen').length,
      dismissedReportsCount: sortedReports.filter((r) => r.status === 'dismissed').length,
      sellerTotalReportsCount: sellerTotalReports.get(sellerId) || sortedReports.length,
      latestReportAt: sortedReports[0].createdAt,
      reasons,
      reports: sortedReports,
    });
  }

  return rows.sort((a, b) => {
    if (b.openReportsCount !== a.openReportsCount) {
      return b.openReportsCount - a.openReportsCount;
    }
    if (b.totalReportsCount !== a.totalReportsCount) {
      return b.totalReportsCount - a.totalReportsCount;
    }
    return b.latestReportAt - a.latestReportAt;
  });
}
