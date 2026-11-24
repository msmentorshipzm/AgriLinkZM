import assert from 'node:assert/strict';
import test from 'node:test';
import {
  configToRow,
  conversationToRow,
  listingToRow,
  messageToRow,
  paymentToRow,
  rowToConfig,
  rowToConversation,
  rowToListing,
  rowToMessage,
  rowToPayment,
  rowToUser,
  userToRow,
} from './supabaseMapper.ts';
import type {
  ChatConversation,
  ChatMessage,
  Listing,
  PaymentRecord,
  PlatformConfig,
  ServerUserAccount,
} from '../types/marketplace.ts';

function stripUndefined<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

test('supabaseMapper performs lossless round-trip mapping for config and users', () => {
  const cfg: PlatformConfig = {
    platformLaunchedAt: 1700000000000,
    defaultTrialDays: 30,
    advertiserMonthlyFeeZmw: 150,
    advertiserPaymentRequired: true,
    buyerFeeEnabled: true,
    buyerFeeAmountZmw: 3,
    buyerTractionMonthsOverride: true,
    dormancyThresholdDays: 60,
    manualMomoNumber: '0976 405 828',
    manualAirtelNumber: '0977 882 310',
  };
  assert.deepEqual(stripUndefined(rowToConfig(configToRow(cfg))), cfg);

  const user: ServerUserAccount = {
    id: 'usr-adv-1',
    authUserId: '11111111-2222-3333-4444-555555555555',
    systemId: 'AZM-ADV-0001',
    name: 'Kelvin Mwansa',
    username: 'kelvin.farm',
    email: 'kelvin@farm.zm',
    phone: '+260977112233',
    role: 'advertiser',
    staffPermissions: [],
    province: 'Lusaka',
    district: 'Chongwe',
    verificationTier: 'tier3_site',
    farmCoordinates: { lat: -15.33, lng: 28.68 },
    accountStatus: 'active_paid',
    emailVerified: true,
    mustChangePassword: false,
    passwordHash: 'scrypt:abc:def',
    trialStartAt: 1700000000000,
    trialDaysAllocated: 30,
    paidUntilAt: 1705000000000,
    lastActiveAt: 1700000100000,
    createdAt: 1700000000000,
    savedListingIds: ['lst-1'],
  };

  assert.deepEqual(stripUndefined(rowToUser(userToRow(user))), user);
});

test('supabaseMapper performs lossless round-trip mapping for listings, payments, and billing chat messages', () => {
  const listing: Listing = {
    id: 'lst-1',
    sellerId: 'usr-adv-1',
    title: 'White Maize',
    category: 'Crops & Grains',
    description: 'Dried grade A maize',
    priceZmw: 325,
    unitLabel: 'per 50kg bag',
    quantityAvailable: '100 bags',
    province: 'Lusaka',
    district: 'Chongwe',
    coordinates: { lat: -15.33, lng: 28.68 },
    locationPrivacy: 'precise_pin',
    images: ['https://example.com/a.jpg'],
    hasVideoWalkthrough: true,
    videoDurationSec: 25,
    status: 'active',
    impressions: 120,
    views: 40,
    uniqueVisitors: 30,
    videoPlays: 12,
    contactReveals: 5,
    createdAt: 1700000000000,
    updatedAt: 1700000100000,
  };
  assert.deepEqual(stripUndefined(rowToListing(listingToRow(listing))), listing);

  const payment: PaymentRecord = {
    id: 'pay-1',
    userId: 'usr-adv-1',
    userName: 'Kelvin Mwansa',
    userPhone: '+260977112233',
    paymentType: 'advertiser_subscription',
    method: 'flutterwave_ussd',
    network: 'Airtel Money',
    amountZmw: 150,
    referenceCode: 'FLW-1234',
    transactionId: 'TX-9988',
    status: 'approved',
    createdAt: 1700000200000,
  };
  assert.deepEqual(stripUndefined(rowToPayment(paymentToRow(payment))), payment);

  const conv: ChatConversation = {
    id: 'conv-bill-usr-adv-1',
    kind: 'billing_support',
    sellerId: 'usr-admin-1',
    sellerName: 'AgriLink ZM Billing Desk',
    buyerId: 'usr-adv-1',
    buyerName: 'Kelvin Mwansa',
    createdAt: 1700000000000,
    updatedAt: 1700000300000,
  };
  assert.deepEqual(stripUndefined(rowToConversation(conversationToRow(conv))), conv);

  const msg: ChatMessage = {
    id: 'msg-bill-1',
    conversationId: conv.id,
    senderId: 'usr-admin-1',
    senderName: 'AgriLink ZM Billing Desk',
    senderRole: 'super_admin',
    type: 'payment_notice',
    text: 'Payment required: ZMW 150.00',
    noticeKey: 'adv-due-active-150',
    paymentType: 'advertiser_subscription',
    amountZmw: 150,
    createdAt: 1700000300000,
  };
  assert.deepEqual(stripUndefined(rowToMessage(messageToRow(msg))), msg);
});
