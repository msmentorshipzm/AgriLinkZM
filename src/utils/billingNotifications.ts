import type {
  PaymentRecord,
  PlatformConfig,
  UserAccount,
} from '../types/marketplace.ts';
import { computeTrialStatus, formatZMW } from './marketplaceRules.ts';

export interface PendingPaymentStatus {
  userId: string;
  paymentType: 'advertiser_subscription' | 'buyer_account_fee';
  amountZmw: number;
  isOverdue: boolean;
  daysRemaining: number;
  hasPendingManualPop: boolean;
  pendingPayment?: PaymentRecord;
  noticeKey: string;
  bannerTitle: string;
  bannerDescription: string;
  buttonLabel: string;
  chatMessageText: string;
}

export function getLatestPendingManualPop(
  payments: PaymentRecord[],
  userId: string,
  paymentType: PaymentRecord['paymentType']
): PaymentRecord | undefined {
  return payments
    .filter(
      (p) =>
        p.userId === userId &&
        p.paymentType === paymentType &&
        p.status === 'pending'
    )
    .sort((a, b) => b.createdAt - a.createdAt)[0];
}

export function evaluateUserPendingPayment(
  user: UserAccount,
  config: PlatformConfig,
  payments: PaymentRecord[],
  nowMs: number = Date.now(),
  options: { includeSubmittedPopWhenSwitchOff?: boolean } = {}
): PendingPaymentStatus | null {
  if (
    user.role === 'super_admin' ||
    user.role === 'staff' ||
    user.accountStatus === 'banned' ||
    user.accountStatus === 'suspended'
  ) {
    return null;
  }

  if (user.role === 'advertiser') {
    const isPaid =
      user.accountStatus === 'active_paid' ||
      Boolean(user.paidUntilAt && user.paidUntilAt > nowMs);
    if (isPaid) return null;

    const pendingPop = getLatestPendingManualPop(
      payments,
      user.id,
      'advertiser_subscription'
    );

    if (!config.advertiserPaymentRequired) {
      if (options.includeSubmittedPopWhenSwitchOff && pendingPop) {
        return {
          userId: user.id,
          paymentType: 'advertiser_subscription',
          amountZmw: pendingPop.amountZmw,
          isOverdue: false,
          daysRemaining: 0,
          hasPendingManualPop: true,
          pendingPayment: pendingPop,
          noticeKey: `adv-pop-pending-${pendingPop.id}`,
          bannerTitle: 'Mobile Money Proof of Payment Pending Verification',
          bannerDescription: `Your ${pendingPop.network} payment (${formatZMW(pendingPop.amountZmw)} · Ref ${pendingPop.referenceCode}) is awaiting staff approval.`,
          buttonLabel: `Pay Instantly via USSD (${formatZMW(config.advertiserMonthlyFeeZmw)})`,
          chatMessageText: `Pending Payment Update: Your ${pendingPop.network} Proof of Payment (${formatZMW(pendingPop.amountZmw)}, Ref ${pendingPop.referenceCode}, TxID ${pendingPop.transactionId}) has been received and is pending verification.`,
        };
      }
      return null;
    }

    const trialEval = computeTrialStatus(user, config, nowMs);
    const isOverdue =
      trialEval.isExpired || trialEval.effectiveAccountStatus === 'payment_required';
    const amountZmw = config.advertiserMonthlyFeeZmw;

    if (pendingPop) {
      return {
        userId: user.id,
        paymentType: 'advertiser_subscription',
        amountZmw,
        isOverdue,
        daysRemaining: trialEval.daysRemaining,
        hasPendingManualPop: true,
        pendingPayment: pendingPop,
        noticeKey: `adv-pop-pending-${pendingPop.id}`,
        bannerTitle: 'Advertiser Payment Pending Verification',
        bannerDescription: `Advertiser billing (${formatZMW(amountZmw)}/mo) is active. Your ${pendingPop.network} Proof of Payment (Ref ${pendingPop.referenceCode}) is awaiting verification, or click to pay instantly via Flutterwave USSD.`,
        buttonLabel: `Complete Payment (${formatZMW(amountZmw)})`,
        chatMessageText: `Pending Payment Notice: AgriLink ZM Advertiser billing is active. Your ${pendingPop.network} Proof of Payment (${formatZMW(pendingPop.amountZmw)}, Ref ${pendingPop.referenceCode}, TxID ${pendingPop.transactionId}) is pending review. Click Pay Now below if you prefer instant activation via Flutterwave USSD.`,
      };
    }

    if (isOverdue) {
      return {
        userId: user.id,
        paymentType: 'advertiser_subscription',
        amountZmw,
        isOverdue: true,
        daysRemaining: 0,
        hasPendingManualPop: false,
        noticeKey: `adv-due-expired-${amountZmw}`,
        bannerTitle: 'Advertiser Payment Required — Listings Paused',
        bannerDescription: `Your free trial has ended and AgriLink ZM billing is active. Pay ${formatZMW(amountZmw)} via MTN MoMo, Airtel Money, or Zamtel Kwacha to reactivate your produce listings.`,
        buttonLabel: `Pay ${formatZMW(amountZmw)} Now`,
        chatMessageText: `Payment Required: AgriLink ZM Advertiser billing is now active and your trial has expired. Please pay ${formatZMW(amountZmw)} using MTN MoMo, Airtel Money, Zamtel Kwacha, or Flutterwave USSD to reactivate your listings. Click Pay Now below to proceed.`,
      };
    }

    return {
      userId: user.id,
      paymentType: 'advertiser_subscription',
      amountZmw,
      isOverdue: false,
      daysRemaining: trialEval.daysRemaining,
      hasPendingManualPop: false,
      noticeKey: `adv-due-active-${amountZmw}`,
      bannerTitle: `Advertiser Billing Active (${trialEval.daysRemaining} ${trialEval.daysRemaining === 1 ? 'Day' : 'Days'} Trial Left)`,
      bannerDescription: `Paid Advertiser plans (${formatZMW(amountZmw)}/month) are now switched on. Complete your Mobile Money payment before your trial ends to keep listings live without interruption.`,
      buttonLabel: `Pay ${formatZMW(amountZmw)} Now`,
      chatMessageText: `Payment Active Notice: AgriLink ZM Advertiser billing (${formatZMW(amountZmw)}/month) has been switched on by Super Admin. You have ${trialEval.daysRemaining} day(s) remaining on your trial — click Pay Now below to pay via MTN MoMo, Airtel Money, or Zamtel Kwacha before your listings pause.`,
    };
  }

  if (user.role === 'buyer') {
    const isPaid = Boolean(user.buyerFeePaidUntilAt && user.buyerFeePaidUntilAt > nowMs);
    if (isPaid) return null;

    const pendingPop = getLatestPendingManualPop(payments, user.id, 'buyer_account_fee');
    if (!config.buyerFeeEnabled) {
      if (options.includeSubmittedPopWhenSwitchOff && pendingPop) {
        return {
          userId: user.id,
          paymentType: 'buyer_account_fee',
          amountZmw: pendingPop.amountZmw,
          isOverdue: false,
          daysRemaining: 0,
          hasPendingManualPop: true,
          pendingPayment: pendingPop,
          noticeKey: `buyer-pop-pending-${pendingPop.id}`,
          bannerTitle: 'Buyer Payment Pending Verification',
          bannerDescription: `Your ${pendingPop.network} Proof of Payment (${formatZMW(pendingPop.amountZmw)} · Ref ${pendingPop.referenceCode}) is awaiting approval.`,
          buttonLabel: `Pay Instantly (${formatZMW(config.buyerFeeAmountZmw)})`,
          chatMessageText: `Pending Payment Update: Your ${pendingPop.network} Buyer Fee Proof of Payment (${formatZMW(pendingPop.amountZmw)}, Ref ${pendingPop.referenceCode}) is pending verification.`,
        };
      }
      return null;
    }

    const amountZmw = config.buyerFeeAmountZmw;
    if (pendingPop) {
      return {
        userId: user.id,
        paymentType: 'buyer_account_fee',
        amountZmw,
        isOverdue: true,
        daysRemaining: 0,
        hasPendingManualPop: true,
        pendingPayment: pendingPop,
        noticeKey: `buyer-pop-pending-${pendingPop.id}`,
        bannerTitle: 'Buyer Access Fee Pending Verification',
        bannerDescription: `Your ${pendingPop.network} Proof of Payment (Ref ${pendingPop.referenceCode}) is awaiting approval, or pay instantly via Flutterwave USSD to unlock seller contacts.`,
        buttonLabel: `Pay Buyer Fee (${formatZMW(amountZmw)})`,
        chatMessageText: `Pending Payment Notice: Your ${pendingPop.network} Buyer Access Fee Proof of Payment (${formatZMW(pendingPop.amountZmw)}, Ref ${pendingPop.referenceCode}) is awaiting review. Click Pay Now below for instant Flutterwave USSD activation.`,
      };
    }

    return {
      userId: user.id,
      paymentType: 'buyer_account_fee',
      amountZmw,
      isOverdue: true,
      daysRemaining: 0,
      hasPendingManualPop: false,
      noticeKey: `buyer-due-${amountZmw}`,
      bannerTitle: `Buyer Access Fee Active (${formatZMW(amountZmw)}/month)`,
      bannerDescription: `Super Admin has activated the Buyer Monthly Access Fee. Pay ${formatZMW(amountZmw)} via Mobile Money to unlock direct seller Phone and WhatsApp contacts.`,
      buttonLabel: `Pay ${formatZMW(amountZmw)} Now`,
      chatMessageText: `Payment Required: AgriLink ZM Buyer Monthly Access Fee (${formatZMW(amountZmw)}/month) is now active. Pay via MTN MoMo, Airtel Money, Zamtel Kwacha, or Flutterwave USSD to reveal seller Phone & WhatsApp contacts. Click Pay Now below to pay.`,
    };
  }

  return null;
}

export function listUsersWithPendingPayments(
  users: UserAccount[],
  config: PlatformConfig,
  payments: PaymentRecord[],
  nowMs: number = Date.now()
): PendingPaymentStatus[] {
  const results: PendingPaymentStatus[] = [];
  for (const user of users) {
    const status = evaluateUserPendingPayment(user, config, payments, nowMs);
    if (status) {
      results.push(status);
    }
  }
  return results;
}
