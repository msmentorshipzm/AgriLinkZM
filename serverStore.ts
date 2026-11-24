import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  AnalyticsStreamEvent,
  ChatConversation,
  ChatMessage,
  EmailNotificationRecord,
  MarketplaceState,
  ServerUserAccount,
} from './src/types/marketplace.js';
import { assignSystemId } from './src/utils/adminReporting.js';
import {
  enqueueSupabaseSync,
  isSupabaseServerConfigured,
  loadMarketplaceStateFromSupabase,
} from './serverSupabase.js';

const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), '.data')
  : path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'agrilink-db.json');
const DAY_MS = 24 * 60 * 60 * 1000;

export function hashIdentifier(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex').slice(0, 20);
}

function buildSeedState(): MarketplaceState {
  const now = Date.now();

  const users: ServerUserAccount[] = [
    {
      id: 'usr-admin-1',
      name: 'Milimo Siabana',
      username: 'superadmin',
      businessName: 'AgriLink ZM Operations',
      email: 'agrilinkzm0@gmail.com',
      phone: '+260976405828',
      whatsapp: '+260976405828',
      role: 'super_admin',
      staffPermissions: ['verify_payments', 'verify_kyc', 'billing_followup', 'moderate_trust'],
      province: 'Lusaka',
      district: 'Lusaka',
      verificationTier: 'tier3_site',
      accountStatus: 'active_paid',
      emailVerified: true,
      trialStartAt: now - 120 * DAY_MS,
      trialDaysAllocated: 30,
      paidUntilAt: now + 365 * DAY_MS,
      lastActiveAt: now,
      createdAt: now - 120 * DAY_MS,
      savedListingIds: [],
    },
    {
      id: 'usr-staff-1',
      name: 'Mutinta Banda',
      username: 'mutinta.banda',
      delegatedRoleTitle: 'Operations & Compliance Lead (All Desk Access)',
      businessName: 'Verification & Trust Desk',
      email: 'staff@agrilink.zm',
      phone: '+260977550112',
      whatsapp: '+260977550112',
      role: 'staff',
      staffPermissions: ['verify_payments', 'verify_kyc', 'moderate_trust', 'billing_followup'],
      province: 'Lusaka',
      district: 'Lusaka',
      verificationTier: 'tier1_id',
      accountStatus: 'active_paid',
      emailVerified: true,
      trialStartAt: now - 60 * DAY_MS,
      trialDaysAllocated: 30,
      lastActiveAt: now,
      createdAt: now - 60 * DAY_MS,
      savedListingIds: [],
    },
    {
      id: 'usr-adv-1',
      name: 'Kelvin Mwansa',
      businessName: 'Chongwe Valley Grains Ltd',
      email: 'kelvin@chongwegrains.zm',
      phone: '+260977234890',
      whatsapp: '+260977234890',
      role: 'advertiser',
      staffPermissions: [],
      province: 'Lusaka',
      district: 'Chongwe',
      verificationTier: 'tier3_site',
      nrcNumber: '245891/10/1',
      momoAccountName: 'KELVIN MWANSA',
      pacraNumber: '120220045891',
      zraTpin: '1004582910',
      siteGpsPin: '-15.3292, 28.6821',
      defaultLocationPrivacy: 'precise_pin',
      farmCoordinates: { lat: -15.3341, lng: 28.6912 },
      accountStatus: 'active_paid',
      trialStartAt: now - 45 * DAY_MS,
      trialDaysAllocated: 30,
      paidUntilAt: now + 22 * DAY_MS,
      lastActiveAt: now - 2 * 60 * 60 * 1000,
      createdAt: now - 45 * DAY_MS,
      savedListingIds: [],
    },
    {
      id: 'usr-adv-2',
      name: 'Bwalya Tembo',
      businessName: 'Kitwe Fresh Poultry & Hatchery',
      email: 'bwalya@kitwepoultry.zm',
      phone: '+260966781234',
      whatsapp: '+260966781234',
      role: 'advertiser',
      staffPermissions: [],
      province: 'Copperbelt',
      district: 'Kitwe',
      verificationTier: 'tier2_business',
      nrcNumber: '318744/67/1',
      momoAccountName: 'BWALYA TEMBO',
      pacraNumber: '120210088123',
      zraTpin: '1008914421',
      defaultLocationPrivacy: 'precise_pin',
      farmCoordinates: { lat: -12.8145, lng: 28.2219 },
      accountStatus: 'trial_active',
      trialStartAt: now - 26 * DAY_MS,
      trialDaysAllocated: 30,
      lastActiveAt: now - 5 * 60 * 60 * 1000,
      createdAt: now - 26 * DAY_MS,
      savedListingIds: [],
    },
    {
      id: 'usr-adv-3',
      name: 'Lombe Chisenga',
      businessName: 'Mkushi Sun Harvest Farms',
      email: 'lombe@mkushiharvest.zm',
      phone: '+260955612090',
      whatsapp: '+260955612090',
      role: 'advertiser',
      staffPermissions: [],
      province: 'Central',
      district: 'Mkushi',
      verificationTier: 'tier2_business',
      nrcNumber: '198432/32/1',
      momoAccountName: 'LOMBE CHISENGA',
      pacraNumber: '120230019201',
      zraTpin: '1009921844',
      defaultLocationPrivacy: 'district_general',
      farmCoordinates: { lat: -13.6331, lng: 29.392 },
      accountStatus: 'trial_active',
      trialStartAt: now - 12 * DAY_MS,
      trialDaysAllocated: 30,
      lastActiveAt: now - 1 * DAY_MS,
      createdAt: now - 12 * DAY_MS,
      savedListingIds: [],
    },
    {
      id: 'usr-adv-4',
      name: 'Mubita Sikazwe',
      businessName: 'Siavonga Bream Fisheries',
      email: 'mubita@siavongabream.zm',
      phone: '+260978304511',
      whatsapp: '+260978304511',
      role: 'advertiser',
      staffPermissions: [],
      province: 'Southern',
      district: 'Siavonga',
      verificationTier: 'tier3_site',
      nrcNumber: '402195/74/1',
      momoAccountName: 'MUBITA SIKAZWE',
      pacraNumber: '120200051120',
      zraTpin: '1007723419',
      siteGpsPin: '-16.5382, 28.7088',
      defaultLocationPrivacy: 'precise_pin',
      farmCoordinates: { lat: -16.5382, lng: 28.7088 },
      accountStatus: 'active_paid',
      trialStartAt: now - 70 * DAY_MS,
      trialDaysAllocated: 30,
      paidUntilAt: now + 18 * DAY_MS,
      lastActiveAt: now - 4 * 60 * 60 * 1000,
      createdAt: now - 70 * DAY_MS,
      savedListingIds: [],
    },
    {
      id: 'usr-adv-5',
      name: 'Thandiwe Zulu',
      businessName: 'Chipata Cooperative Growers',
      email: 'thandiwe@chipatagrowers.zm',
      phone: '+260967419022',
      whatsapp: '+260967419022',
      role: 'advertiser',
      staffPermissions: [],
      province: 'Eastern',
      district: 'Chipata',
      verificationTier: 'tier1_id',
      nrcNumber: '512340/51/1',
      momoAccountName: 'THANDIWE ZULU',
      defaultLocationPrivacy: 'district_general',
      accountStatus: 'trial_active',
      trialStartAt: now - 8 * DAY_MS,
      trialDaysAllocated: 30,
      lastActiveAt: now - 75 * DAY_MS,
      createdAt: now - 78 * DAY_MS,
      savedListingIds: [],
    },
    {
      id: 'usr-buy-1',
      name: 'Chileshe Phiri',
      businessName: 'Kabwe Urban Produce Market',
      email: 'buyer@agrilink.zm',
      phone: '+260974112233',
      whatsapp: '+260974112233',
      role: 'buyer',
      staffPermissions: [],
      province: 'Lusaka',
      district: 'Lusaka',
      verificationTier: 'tier1_id',
      nrcNumber: '331209/10/1',
      accountStatus: 'trial_active',
      trialStartAt: now - 20 * DAY_MS,
      trialDaysAllocated: 30,
      lastActiveAt: now,
      createdAt: now - 20 * DAY_MS,
      savedListingIds: ['lst-1', 'lst-4'],
    },
    {
      id: 'usr-buy-2',
      name: 'Nchimunya Hichilema',
      email: 'nchimunya@buyer.zm',
      phone: '+260965332211',
      role: 'buyer',
      staffPermissions: [],
      province: 'Southern',
      district: 'Mazabuka',
      verificationTier: 'tier1_id',
      accountStatus: 'trial_active',
      trialStartAt: now - 15 * DAY_MS,
      trialDaysAllocated: 30,
      lastActiveAt: now - 2 * DAY_MS,
      createdAt: now - 15 * DAY_MS,
      savedListingIds: [],
    },
    {
      id: 'usr-buy-3',
      name: 'Kapambwe Chola',
      email: 'kapambwe@buyer.zm',
      phone: '+260955887766',
      role: 'buyer',
      staffPermissions: [],
      province: 'Copperbelt',
      district: 'Ndola',
      verificationTier: 'tier1_id',
      accountStatus: 'trial_active',
      trialStartAt: now - 10 * DAY_MS,
      trialDaysAllocated: 30,
      lastActiveAt: now - 1 * DAY_MS,
      createdAt: now - 10 * DAY_MS,
      savedListingIds: [],
    },
  ];

  const assignedIds: string[] = [];
  for (const user of users) {
    const sysId = assignSystemId(user.role, assignedIds);
    user.systemId = sysId;
    assignedIds.push(sysId);
  }

  return {
    config: {
      platformLaunchedAt: now - 95 * DAY_MS,
      defaultTrialDays: 30,
      advertiserMonthlyFeeZmw: 150,
      advertiserPaymentRequired: false,
      buyerFeeEnabled: false,
      buyerFeeAmountZmw: 3,
      buyerTractionMonthsOverride: false,
      dormancyThresholdDays: 60,
      manualMomoNumber: '0976 405 828',
      manualAirtelNumber: '0977 882 310',
    },
    users,
    listings: [],
    contactReveals: [],
    reviews: [],
    scamReports: [],
    payments: [],
    kycSubmissions: [],
    conversations: [],
    messages: [],
    blacklist: [],
    recentEvents: [],
    emailNotifications: [],
  };
}

export function loadState(): MarketplaceState {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DB_FILE)) {
      const seed = buildSeedState();
      try {
        fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf8');
      } catch {
        // Ignore read-only filesystem errors
      }
      return seed;
    }
  } catch {
    return buildSeedState();
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<MarketplaceState>;
    const seed = buildSeedState();
    const seedListingsById = new Map(seed.listings.map((l) => [l.id, l]));
    const migratedListings = (parsed.listings || seed.listings).map((l) => {
      const seedMatch = seedListingsById.get(l.id);
      return {
        ...l,
        coordinates: l.coordinates || seedMatch?.coordinates,
        locationPrivacy: l.locationPrivacy || seedMatch?.locationPrivacy || 'district_general',
      };
    });
    const rawUsers = (parsed.users || seed.users).map((u) => {
      let patched =
        u.id === 'usr-admin-1' && u.email === 'admin@agrilink.zm'
          ? { ...u, email: 'agrilinkzm0@gmail.com' }
          : u;
      if (patched.id === 'usr-admin-1' && patched.phone === '+260966441200') {
        patched = { ...patched, phone: '+260976405828', whatsapp: '+260976405828' };
      }
      if (patched.id === 'usr-admin-1' && patched.name === 'Chanda Mulenga') {
        patched = { ...patched, name: 'Milimo Siabana' };
      }
      return {
        ...patched,
        emailVerified: patched.emailVerified ?? true,
      };
    });
    const usedIds = rawUsers.map((u) => u.systemId).filter((s): s is string => Boolean(s));
    const migratedUsers = rawUsers.map((u) => {
      if (u.systemId) return u;
      const nextId = assignSystemId(u.role, usedIds);
      usedIds.push(nextId);
      return { ...u, systemId: nextId };
    });
    // Ensure newly added collections exist if migrating from earlier DB
    return {
      ...seed,
      ...parsed,
      users: migratedUsers,
      listings: migratedListings,
      conversations: parsed.conversations || seed.conversations,
      messages: parsed.messages || seed.messages,
      emailNotifications: parsed.emailNotifications || [],
    };
  } catch {
    const seed = buildSeedState();
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf8');
    } catch {
      // Ignore read-only filesystem errors when hosted in serverless/cloud environments
    }
    return seed;
  }
}

export async function initDatabaseStore(): Promise<MarketplaceState> {
  const localState = loadState();
  if (!isSupabaseServerConfigured()) {
    return localState;
  }
  const remoteState = await loadMarketplaceStateFromSupabase();
  if (remoteState) {
    let adminMigrated = false;
    remoteState.users = remoteState.users.map((u) => {
      if (u.id === 'usr-admin-1' && u.name === 'Chanda Mulenga') {
        adminMigrated = true;
        return { ...u, name: 'Milimo Siabana' };
      }
      return u;
    });
    if (adminMigrated) {
      await enqueueSupabaseSync(remoteState);
    }
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DB_FILE, JSON.stringify(remoteState, null, 2), 'utf8');
    } catch {
      // Ignore read-only filesystem errors
    }
    return remoteState;
  }
  // Empty Supabase project: seed initial AgriLink ZM tables automatically
  await enqueueSupabaseSync(localState);
  return localState;
}

export function saveState(state: MarketplaceState): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // Ignore read-only filesystem errors when backed by Supabase
  }
  if (isSupabaseServerConfigured()) {
    void enqueueSupabaseSync(state);
  }
}
