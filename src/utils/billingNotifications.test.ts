import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateUserPendingPayment,
  listUsersWithPendingPayments,
} from './billingNotifications.ts';
import type {
  PaymentRecord,
  PlatformConfig,
  UserAccount,
} from '../types/marketplace.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_750_000_000_000;

const baseConfig: PlatformConfig = {
  platformLaunchedAt: NOW - 100 * DAY_MS,
  defaultTrialDays: 30,
  advertiserMonthlyFeeZmw: 150,
  advertiserPaymentRequired: false,
  buyerFeeEnabled: false,
  buyerFeeAmountZmw: 3,
  buyerTractionMonthsOverride: false,
  dormancyThresholdDays: 60,
  manualMomoNumber: '0976 405 828',
  manualAirtelNumber: '0977 882 310',
};

function makeUser(overrides: Partial<UserAccount>): UserAccount {
  return {
    id: 'usr-1',
    name: 'Test User',
    email: 'test@agrilink.zm',
    phone: '+260977000001',
    role: 'advertiser',
    staffPermissions: [],
    province: 'Lusaka',
    district: 'Lusaka',
    verificationTier: 'tier1_id',
    accountStatus: 'trial_active',
    trialStartAt: NOW - 10 * DAY_MS,
    trialDaysAllocated: 30,
    lastActiveAt: NOW,
    createdAt: NOW - 10 * DAY_MS,
    savedListingIds: [],
    ...overrides,
  };
}

test('evaluateUserPendingPayment hides payment prompts when switches are OFF', () => {
  const unpaidAdv = makeUser({ id: 'adv-unpaid', role: 'advertiser' });
  const unpaidBuyer = makeUser({ id: 'buy-unpaid', role: 'buyer' });

  assert.equal(evaluateUserPendingPayment(unpaidAdv, baseConfig, [], NOW), null);
  assert.equal(evaluateUserPendingPayment(unpaidBuyer, baseConfig, [], NOW), null);
});

test('evaluateUserPendingPayment prompts ALL unpaid advertisers & buyers once SuperAdmin enables switches', () => {
  const activeConfig: PlatformConfig = {
    ...baseConfig,
    advertiserPaymentRequired: true,
    buyerFeeEnabled: true,
  };

  const paidAdv = makeUser({
    id: 'adv-paid',
    role: 'advertiser',
    accountStatus: 'active_paid',
    paidUntilAt: NOW + 20 * DAY_MS,
  });
  const trialAdvUnpaid = makeUser({
    id: 'adv-trial-unpaid',
    role: 'advertiser',
    trialStartAt: NOW - 10 * DAY_MS,
  });
  const expiredAdv = makeUser({
    id: 'adv-expired',
    role: 'advertiser',
    trialStartAt: NOW - 45 * DAY_MS,
  });
  const pendingPopAdv = makeUser({
    id: 'adv-pop',
    role: 'advertiser',
    trialStartAt: NOW - 26 * DAY_MS,
  });
  const paidBuyer = makeUser({
    id: 'buy-paid',
    role: 'buyer',
    buyerFeePaidUntilAt: NOW + 15 * DAY_MS,
  });
  const unpaidBuyer = makeUser({
    id: 'buy-unpaid',
    role: 'buyer',
  });
  const admin = makeUser({ id: 'admin-1', role: 'super_admin' });

  const payments: PaymentRecord[] = [
    {
      id: 'pay-pop-1',
      userId: 'adv-pop',
      userName: 'Pending Seller',
      userPhone: '+260966781234',
      paymentType: 'advertiser_subscription',
      method: 'manual_pop',
      network: 'MTN MoMo',
      amountZmw: 150,
      referenceCode: 'AGRI-ADV-2091',
      transactionId: 'MP261123.1408',
      status: 'pending',
      createdAt: NOW - 3600 * 1000,
    },
  ];

  const pendingList = listUsersWithPendingPayments(
    [paidAdv, trialAdvUnpaid, expiredAdv, pendingPopAdv, paidBuyer, unpaidBuyer, admin],
    activeConfig,
    payments,
    NOW
  );

  assert.deepEqual(
    pendingList.map((p) => p.userId),
    ['adv-trial-unpaid', 'adv-expired', 'adv-pop', 'buy-unpaid']
  );

  const trialEntry = pendingList.find((p) => p.userId === 'adv-trial-unpaid')!;
  assert.equal(trialEntry.paymentType, 'advertiser_subscription');
  assert.equal(trialEntry.isOverdue, false);
  assert.equal(trialEntry.daysRemaining, 20);
  assert.match(trialEntry.chatMessageText, /ZMW 150\.00/);

  const expiredEntry = pendingList.find((p) => p.userId === 'adv-expired')!;
  assert.equal(expiredEntry.isOverdue, true);
  assert.match(expiredEntry.bannerTitle, /Paused/i);

  const popEntry = pendingList.find((p) => p.userId === 'adv-pop')!;
  assert.equal(popEntry.hasPendingManualPop, true);
  assert.match(popEntry.chatMessageText, /AGRI-ADV-2091/);

  const buyerEntry = pendingList.find((p) => p.userId === 'buy-unpaid')!;
  assert.equal(buyerEntry.paymentType, 'buyer_account_fee');
  assert.match(buyerEntry.chatMessageText, /ZMW 3\.00/);
});
