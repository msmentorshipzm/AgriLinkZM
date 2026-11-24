import crypto from 'node:crypto';
import fs from 'node:fs';
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

const DATA_DIR = path.resolve(process.cwd(), '.data');
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

  const listings = [
    {
      id: 'lst-1',
      sellerId: 'usr-adv-1',
      title: 'Grade A Dried White Maize (50kg Bags)',
      category: 'Crops & Grains' as const,
      description:
        'Clean, machine-shelled Grade A white maize dried to 12.2% moisture content. Ready for collection at our Chongwe farm depot or bulk truck loading for millers and institutional off-takers.',
      priceZmw: 325,
      unitLabel: 'per 50kg bag',
      quantityAvailable: '1,400 bags (70 MT)',
      province: 'Lusaka',
      district: 'Chongwe',
      coordinates: { lat: -15.3341, lng: 28.6912 },
      locationPrivacy: 'precise_pin' as const,
      images: ['/src/assets/images/listing_maize_sacks_1795467060330.jpg'],
      hasVideoWalkthrough: true,
      videoUrl: 'walkthrough-maize-depot',
      videoDurationSec: 24,
      status: 'active' as const,
      impressions: 1240,
      views: 418,
      uniqueVisitors: 309,
      videoPlays: 142,
      contactReveals: 47,
      createdAt: now - 10 * DAY_MS,
      updatedAt: now - 1 * DAY_MS,
    },
    {
      id: 'lst-2',
      sellerId: 'usr-adv-2',
      title: 'Live Market-Ready Broiler Chickens (1.8kg - 2.1kg)',
      category: 'Poultry' as const,
      description:
        'Healthy 6-week Ross 308 broilers raised in ventilated houses in Kitwe. Full vaccination records available on site. Wholesale discounts for orders above 100 birds.',
      priceZmw: 98,
      unitLabel: 'per bird',
      quantityAvailable: '2,200 birds',
      province: 'Copperbelt',
      district: 'Kitwe',
      coordinates: { lat: -12.8145, lng: 28.2219 },
      locationPrivacy: 'precise_pin' as const,
      images: ['/src/assets/images/listing_broiler_poultry_1795467060137.jpg'],
      hasVideoWalkthrough: true,
      videoUrl: 'walkthrough-broiler-house',
      videoDurationSec: 19,
      status: 'active' as const,
      impressions: 980,
      views: 312,
      uniqueVisitors: 240,
      videoPlays: 98,
      contactReveals: 34,
      createdAt: now - 7 * DAY_MS,
      updatedAt: now - 1 * DAY_MS,
    },
    {
      id: 'lst-3',
      sellerId: 'usr-adv-3',
      title: 'Non-GMO Harvested Soya Beans (Bulk 50kg Sacks)',
      category: 'Crops & Grains' as const,
      description:
        'High-protein golden soya beans harvested in Mkushi Farm Block. Sorted and bagged in 50kg sacks, ideal for oil pressing and stockfeed manufacturers.',
      priceZmw: 640,
      unitLabel: 'per 50kg bag',
      quantityAvailable: '850 bags (42.5 MT)',
      province: 'Central',
      district: 'Mkushi',
      coordinates: { lat: -13.6331, lng: 29.392 },
      locationPrivacy: 'district_general' as const,
      images: ['/src/assets/images/listing_soya_beans_1795467060008.jpg'],
      hasVideoWalkthrough: false,
      status: 'active' as const,
      impressions: 760,
      views: 229,
      uniqueVisitors: 185,
      videoPlays: 0,
      contactReveals: 26,
      createdAt: now - 6 * DAY_MS,
      updatedAt: now - 2 * DAY_MS,
    },
    {
      id: 'lst-4',
      sellerId: 'usr-adv-4',
      title: 'Fresh Lake Kariba Silver Tilapia Bream (Iced Crates)',
      category: 'Fisheries & Aquaculture' as const,
      description:
        'Daily morning harvest of 350g–500g fresh silver bream packed on crushed flake ice in hygienic 25kg crates. Cold-chain delivery available to Lusaka and Choma.',
      priceZmw: 1350,
      unitLabel: 'per 25kg crate',
      quantityAvailable: '60 crates daily',
      province: 'Southern',
      district: 'Siavonga',
      coordinates: { lat: -16.5382, lng: 28.7088 },
      locationPrivacy: 'precise_pin' as const,
      images: ['/src/assets/images/listing_tilapia_fish_1795467060008.jpg'],
      hasVideoWalkthrough: true,
      videoUrl: 'walkthrough-tilapia-harvest',
      videoDurationSec: 28,
      status: 'active' as const,
      impressions: 1105,
      views: 389,
      uniqueVisitors: 274,
      videoPlays: 164,
      contactReveals: 52,
      createdAt: now - 5 * DAY_MS,
      updatedAt: now - 12 * 60 * 60 * 1000,
    },
    {
      id: 'lst-5',
      sellerId: 'usr-adv-1',
      title: 'Fresh Vine-Ripened Roma & MoneyMaker Tomatoes',
      category: 'Horticulture' as const,
      description:
        'Firm, glossy field-grown tomatoes graded and packed in 20kg ventilated plastic crates. Harvested twice weekly for supermarkets, restaurants, and Soweto market traders.',
      priceZmw: 280,
      unitLabel: 'per 20kg crate',
      quantityAvailable: '180 crates',
      province: 'Lusaka',
      district: 'Chongwe',
      coordinates: { lat: -15.318, lng: 28.675 },
      locationPrivacy: 'precise_pin' as const,
      images: ['/src/assets/images/listing_tomato_crates_1795467060395.jpg'],
      hasVideoWalkthrough: false,
      status: 'active' as const,
      impressions: 640,
      views: 194,
      uniqueVisitors: 152,
      videoPlays: 0,
      contactReveals: 29,
      createdAt: now - 4 * DAY_MS,
      updatedAt: now - 1 * DAY_MS,
    },
    {
      id: 'lst-6',
      sellerId: 'usr-adv-3',
      title: 'MF 290 75HP Utility Tractor + 3-Disc Plough Package',
      category: 'Farm Equipment' as const,
      description:
        'Well-serviced 75HP agricultural tractor paired with a heavy-duty 3-disc plough. Inspected hydraulics and new rear tyres; available for viewing at Mkushi Farm Block.',
      priceZmw: 285000,
      unitLabel: 'complete unit',
      quantityAvailable: '2 units',
      province: 'Central',
      district: 'Mkushi',
      coordinates: { lat: -13.642, lng: 29.405 },
      locationPrivacy: 'district_general' as const,
      images: ['/src/assets/images/listing_tractor_equipment_1795467061489.jpg'],
      hasVideoWalkthrough: true,
      videoUrl: 'walkthrough-tractor-engine',
      videoDurationSec: 27,
      status: 'active' as const,
      impressions: 520,
      views: 175,
      uniqueVisitors: 138,
      videoPlays: 71,
      contactReveals: 14,
      createdAt: now - 3 * DAY_MS,
      updatedAt: now - 1 * DAY_MS,
    },
    {
      id: 'lst-7',
      sellerId: 'usr-adv-5',
      title: 'Eastern Province Organic Groundnuts (Shelled 50kg)',
      category: 'Crops & Grains' as const,
      description:
        'Chalimbana variety shelled groundnuts from Chipata smallholder cooperative. Inspect stock directly before any payment.',
      priceZmw: 1180,
      unitLabel: 'per 50kg bag',
      quantityAvailable: '120 bags',
      province: 'Eastern',
      district: 'Chipata',
      coordinates: { lat: -13.6333, lng: 32.65 },
      locationPrivacy: 'district_general' as const,
      images: ['/src/assets/images/listing_soya_beans_1795467060008.jpg'],
      hasVideoWalkthrough: false,
      status: 'active' as const,
      impressions: 310,
      views: 88,
      uniqueVisitors: 71,
      videoPlays: 0,
      contactReveals: 11,
      createdAt: now - 14 * DAY_MS,
      updatedAt: now - 14 * DAY_MS,
    },
  ];

  const contactReveals = [
    {
      id: 'cr-seed-1',
      listingId: 'lst-1',
      sellerId: 'usr-adv-1',
      buyerId: 'usr-buy-1',
      createdAt: now - 5 * DAY_MS,
    },
    {
      id: 'cr-seed-2',
      listingId: 'lst-4',
      sellerId: 'usr-adv-4',
      buyerId: 'usr-buy-1',
      createdAt: now - 3 * DAY_MS,
    },
  ];

  const reviews = [
    {
      id: 'rev-1',
      sellerId: 'usr-adv-1',
      buyerId: 'usr-buy-1',
      buyerName: 'Chileshe Phiri',
      listingId: 'lst-1',
      productQuality: 5,
      communication: 5,
      pricingHonesty: 5,
      overallRating: 5.0,
      comment:
        'Loaded 60 bags at Chongwe depot. Moisture test matched 12.2% and weight on every bag was accurate.',
      sellerReply:
        'Thank you Chileshe! Fresh harvest batch from Plot 14 is ready whenever your next truck comes through.',
      sellerRepliedAt: now - 3 * DAY_MS,
      createdAt: now - 4 * DAY_MS,
      updatedAt: now - 4 * DAY_MS,
    },
    {
      id: 'rev-2',
      sellerId: 'usr-adv-4',
      buyerId: 'usr-buy-2',
      buyerName: 'Nchimunya Hichilema',
      listingId: 'lst-4',
      productQuality: 5,
      communication: 4,
      pricingHonesty: 5,
      overallRating: 4.7,
      comment:
        'Tilapia arrived in Mazabuka still packed solid in ice. Consistent sizing across all 4 crates.',
      createdAt: now - 2 * DAY_MS,
      updatedAt: now - 2 * DAY_MS,
    },
  ];

  const scamReports = [
    {
      id: 'sr-seed-1',
      listingId: 'lst-7',
      sellerId: 'usr-adv-5',
      reporterBuyerId: 'usr-buy-2',
      reporterName: 'Nchimunya Hichilema',
      reason: 'Misleading location or price' as const,
      details: 'Seller quoted a higher transport add-on after WhatsApp contact.',
      status: 'open' as const,
      createdAt: now - 2 * DAY_MS,
    },
    {
      id: 'sr-seed-2',
      listingId: 'lst-7',
      sellerId: 'usr-adv-5',
      reporterBuyerId: 'usr-buy-3',
      reporterName: 'Kapambwe Chola',
      reason: 'Fake or stolen photos' as const,
      details: 'Photo shows soya beans instead of shelled Chalimbana groundnuts.',
      status: 'open' as const,
      createdAt: now - 1 * DAY_MS,
    },
  ];

  const payments = [
    {
      id: 'pay-seed-1',
      userId: 'usr-adv-2',
      userName: 'Bwalya Tembo',
      userPhone: '+260966781234',
      paymentType: 'advertiser_subscription' as const,
      method: 'manual_pop' as const,
      network: 'MTN MoMo' as const,
      amountZmw: 150,
      referenceCode: 'AGRI-ADV-2091',
      transactionId: 'MP261123.1408.C90122',
      proofImageUrl: 'receipt-mtn-mp261123.jpg',
      status: 'pending' as const,
      createdAt: now - 3 * 60 * 60 * 1000,
    },
    {
      id: 'pay-seed-2',
      userId: 'usr-adv-1',
      userName: 'Kelvin Mwansa',
      userPhone: '+260977234890',
      paymentType: 'advertiser_subscription' as const,
      method: 'flutterwave_ussd' as const,
      network: 'Airtel Money' as const,
      amountZmw: 150,
      referenceCode: 'FLW-ZM-88412',
      transactionId: 'FLW261110-99104',
      status: 'approved' as const,
      reviewedBy: 'Flutterwave Webhook',
      createdAt: now - 8 * DAY_MS,
    },
  ];

  const kycSubmissions = [
    {
      id: 'kyc-seed-1',
      userId: 'usr-adv-3',
      userName: 'Lombe Chisenga',
      requestedTier: 'tier3_site' as const,
      phoneOtpVerified: true,
      nrcNumber: '198432/32/1',
      momoAccountName: 'LOMBE CHISENGA',
      pacraNumber: '120230019201',
      zraTpin: '1009921844',
      siteGpsPin: '-13.6331, 29.3920',
      walkthroughVideoRef: 'mkushi-silo-walkthrough.mp4',
      status: 'pending' as const,
      createdAt: now - 6 * 60 * 60 * 1000,
    },
    {
      id: 'kyc-seed-2',
      userId: 'usr-adv-5',
      userName: 'Thandiwe Zulu',
      requestedTier: 'tier2_business' as const,
      phoneOtpVerified: true,
      nrcNumber: '512340/51/1',
      momoAccountName: 'THANDIWE ZULU',
      pacraNumber: '120240077312',
      zraTpin: '1006612098',
      certificateRef: 'PACRA-CERT-CHIPATA.pdf',
      status: 'pending' as const,
      createdAt: now - 14 * 60 * 60 * 1000,
    },
  ];

  const conversations: ChatConversation[] = [
    {
      id: 'conv-seed-1',
      listingId: 'lst-1',
      listingTitle: 'Grade A Dried White Maize (50kg Bags)',
      sellerId: 'usr-adv-1',
      sellerName: 'Chongwe Valley Grains Ltd',
      buyerId: 'usr-buy-1',
      buyerName: 'Chileshe Phiri',
      createdAt: now - 2 * DAY_MS,
      updatedAt: now - 3 * 60 * 60 * 1000,
    },
    {
      id: 'conv-seed-2',
      listingId: 'lst-2',
      listingTitle: 'Live Market-Ready Broiler Chickens (1.8kg - 2.1kg)',
      sellerId: 'usr-adv-2',
      sellerName: 'Kitwe Fresh Poultry & Hatchery',
      buyerId: 'usr-buy-1',
      buyerName: 'Chileshe Phiri',
      createdAt: now - 1 * DAY_MS,
      updatedAt: now - 5 * 60 * 60 * 1000,
    },
  ];

  const messages: ChatMessage[] = [
    {
      id: 'msg-seed-1',
      conversationId: 'conv-seed-1',
      senderId: 'usr-buy-1',
      senderName: 'Chileshe Phiri',
      senderRole: 'buyer',
      type: 'text',
      text: 'Hello Kelvin, are 100 bags of the Grade A white maize available for pickup tomorrow morning in Chongwe?',
      createdAt: now - 2 * DAY_MS,
    },
    {
      id: 'msg-seed-2',
      conversationId: 'conv-seed-1',
      senderId: 'usr-adv-1',
      senderName: 'Chongwe Valley Grains Ltd',
      senderRole: 'advertiser',
      type: 'text',
      text: 'Yes, 100 bags are stacked and ready at Plot 14 depot. We can also weigh each bag on-site before loading.',
      createdAt: now - 3 * 60 * 60 * 1000,
    },
    {
      id: 'msg-seed-3',
      conversationId: 'conv-seed-2',
      senderId: 'usr-buy-1',
      senderName: 'Chileshe Phiri',
      senderRole: 'buyer',
      type: 'text',
      text: 'Hi Bwalya, what is your wholesale price per bird if we pick up 250 broilers from Kitwe?',
      createdAt: now - 5 * 60 * 60 * 1000,
    },
  ];

  const recentEvents: AnalyticsStreamEvent[] = [
    {
      id: 'evt-seed-1',
      type: 'contact_reveal',
      listingId: 'lst-4',
      listingTitle: 'Fresh Lake Kariba Silver Tilapia Bream (Iced Crates)',
      sellerId: 'usr-adv-4',
      province: 'Southern',
      message: 'Buyer revealed WhatsApp contact on Siavonga Tilapia listing',
      timestamp: now - 12 * 60 * 1000,
    },
    {
      id: 'evt-seed-2',
      type: 'video_play',
      listingId: 'lst-1',
      listingTitle: 'Grade A Dried White Maize (50kg Bags)',
      sellerId: 'usr-adv-1',
      province: 'Lusaka',
      message: 'Walkthrough video played on Chongwe White Maize listing',
      timestamp: now - 4 * 60 * 1000,
    },
  ];

  const emailNotifications: EmailNotificationRecord[] = [];

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
    listings,
    contactReveals,
    reviews,
    scamReports,
    payments,
    kycSubmissions,
    conversations,
    messages,
    blacklist: [],
    recentEvents,
    emailNotifications,
  };
}

export function loadState(): MarketplaceState {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const seed = buildSeedState();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf8');
    return seed;
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
