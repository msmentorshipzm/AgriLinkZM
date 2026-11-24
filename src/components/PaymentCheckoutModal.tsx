import React, { useState } from 'react';
import { CheckCircle2, Smartphone, Upload, X } from 'lucide-react';
import type { PaymentRecord, PlatformConfig, UserAccount } from '../types/marketplace.ts';
import { formatZMW } from '../utils/marketplaceRules.ts';

interface PaymentCheckoutModalProps {
  isOpen: boolean;
  paymentType: 'advertiser_subscription' | 'buyer_account_fee';
  currentUser: UserAccount;
  config: PlatformConfig;
  onClose: () => void;
  onSubmitManualPop: (payload: {
    paymentType: 'advertiser_subscription' | 'buyer_account_fee';
    network: PaymentRecord['network'];
    transactionId: string;
    proofImageUrl?: string;
  }) => Promise<string | null>;
  onSubmitFlutterwaveUssd: (payload: {
    paymentType: 'advertiser_subscription' | 'buyer_account_fee';
    network: PaymentRecord['network'];
    momoPhone: string;
  }) => Promise<string | null>;
}

const NETWORKS: PaymentRecord['network'][] = ['MTN MoMo', 'Airtel Money', 'Zamtel Kwacha'];

export const PaymentCheckoutModal: React.FC<PaymentCheckoutModalProps> = ({
  isOpen,
  paymentType,
  currentUser,
  config,
  onClose,
  onSubmitManualPop,
  onSubmitFlutterwaveUssd,
}) => {
  const [stage, setStage] = useState<'flutterwave' | 'manual'>('flutterwave');
  const [network, setNetwork] = useState<PaymentRecord['network']>('MTN MoMo');
  const [momoPhone, setMomoPhone] = useState(currentUser.phone || '');
  const [transactionId, setTransactionId] = useState('');
  const [proofRef, setProofRef] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const amountZmw =
    paymentType === 'buyer_account_fee'
      ? config.buyerFeeAmountZmw
      : config.advertiserMonthlyFeeZmw;

  const handleProofUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProofRef(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFlutterwaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);
    if (!momoPhone.trim()) {
      setError('Enter your Zambian Mobile Money number to receive the USSD prompt.');
      return;
    }
    setSubmitting(true);
    const err = await onSubmitFlutterwaveUssd({
      paymentType,
      network,
      momoPhone: momoPhone.trim(),
    });
    setSubmitting(false);
    if (err) {
      setError(err);
    } else {
      setStatusMessage(
        `Instant ${network} USSD payment verified via Flutterwave Zambia webhook. Your 30-day access is active immediately.`
      );
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);
    if (!transactionId.trim()) {
      setError('Enter the Mobile Money Transaction ID from your SMS confirmation.');
      return;
    }
    setSubmitting(true);
    const err = await onSubmitManualPop({
      paymentType,
      network,
      transactionId: transactionId.trim(),
      proofImageUrl: proofRef,
    });
    setSubmitting(false);
    if (err) {
      setError(err);
    } else {
      setTransactionId('');
      setStatusMessage(
        'Proof of Payment submitted to the Payment Verification Queue. Staff will approve your renewal shortly.'
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-modal-title"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="payment-modal-title" className="font-display text-xl font-bold text-[#111827]">
              {paymentType === 'buyer_account_fee'
                ? 'Buyer Account Access Payment'
                : 'Advertiser Monthly Plan Renewal'}
            </h2>
            <p className="mt-1 font-mono text-sm font-bold text-[#1B5E20] tabular-nums">
              Amount Due: {formatZMW(amountZmw)} / 30 days
            </p>
          </div>
          <button
            type="button"
            aria-label="Close checkout modal"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#4B5563] hover:bg-[#F3F5F2] hover:text-[#111827]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stage Switcher */}
        <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] p-1">
          <button
            type="button"
            onClick={() => {
              setStage('flutterwave');
              setError(null);
              setStatusMessage(null);
            }}
            className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
              stage === 'flutterwave'
                ? 'bg-[#1B5E20] text-white'
                : 'text-[#4B5563] hover:text-[#111827]'
            }`}
          >
            Stage 2: Flutterwave USSD
          </button>
          <button
            type="button"
            onClick={() => {
              setStage('manual');
              setError(null);
              setStatusMessage(null);
            }}
            className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
              stage === 'manual'
                ? 'bg-[#1B5E20] text-white'
                : 'text-[#4B5563] hover:text-[#111827]'
            }`}
          >
            Stage 1: Manual MoMo PoP
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-[#C2410C]/40 bg-[#FFF7ED] p-3 text-xs font-medium text-[#9A3412]">
            {error}
          </div>
        )}

        {statusMessage && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#1B5E20]/30 bg-[#EEF3EC] p-3 text-xs font-medium text-[#1B5E20]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {stage === 'flutterwave' ? (
          <form onSubmit={handleFlutterwaveSubmit} className="mt-5 space-y-4">
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] p-3.5 text-xs text-[#4B5563]">
              Triggers an automated Zambian Mobile Money USSD prompt via Flutterwave (<code className="font-mono">/v3/charges?type=mobile_money_zambia</code>) and activates your account via webhook instantly.
            </div>

            <div>
              <label htmlFor="flw-network" className="block text-xs font-medium text-[#4B5563]">
                Mobile Money Network
              </label>
              <select
                id="flw-network"
                value={network}
                onChange={(e) => setNetwork(e.target.value as PaymentRecord['network'])}
                className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2.5 text-sm text-[#111827]"
              >
                {NETWORKS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="flw-phone" className="block text-xs font-medium text-[#4B5563]">
                Mobile Money Wallet Number
              </label>
              <input
                id="flw-phone"
                type="tel"
                value={momoPhone}
                onChange={(e) => setMomoPhone(e.target.value)}
                placeholder="+260977000111"
                className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2.5 font-mono text-sm text-[#111827]"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1B5E20] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#154A19] disabled:opacity-60"
            >
              <Smartphone className="h-4 w-4" />
              {submitting ? 'Sending USSD Prompt...' : `Pay ${formatZMW(amountZmw)} via USSD Prompt`}
            </button>
          </form>
        ) : (
          <form onSubmit={handleManualSubmit} className="mt-5 space-y-4">
            <div className="space-y-1.5 rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] p-3.5 text-xs text-[#374151]">
              <div className="font-semibold text-[#111827]">
                Send {formatZMW(amountZmw)} to AgriLink ZM Merchant Accounts:
              </div>
              <div className="font-mono">
                MTN MoMo: <strong>{config.manualMomoNumber}</strong> · Airtel Money:{' '}
                <strong>{config.manualAirtelNumber}</strong>
              </div>
            </div>

            <div>
              <label htmlFor="pop-network" className="block text-xs font-medium text-[#4B5563]">
                Network Used
              </label>
              <select
                id="pop-network"
                value={network}
                onChange={(e) => setNetwork(e.target.value as PaymentRecord['network'])}
                className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2.5 text-sm text-[#111827]"
              >
                {NETWORKS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="pop-txid" className="block text-xs font-medium text-[#4B5563]">
                SMS Transaction ID *
              </label>
              <input
                id="pop-txid"
                type="text"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="e.g. MP261123.1540.A12904"
                className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2.5 font-mono text-sm text-[#111827]"
              />
            </div>

            <div>
              <label htmlFor="pop-receipt" className="block text-xs font-medium text-[#4B5563]">
                Upload Proof of Payment Screenshot (Optional)
              </label>
              <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[#D1D5DB] bg-[#F9FAF8] px-4 py-3 text-xs font-medium text-[#4B5563] hover:border-[#1B5E20]">
                <Upload className="h-4 w-4 text-[#1B5E20]" />
                <span>{proofRef ? 'Screenshot attached' : 'Select MoMo confirmation image'}</span>
                <input
                  id="pop-receipt"
                  type="file"
                  accept="image/*"
                  onChange={handleProofUpload}
                  className="sr-only"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-[#1B5E20] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#154A19] disabled:opacity-60"
            >
              {submitting ? 'Submitting Proof...' : 'Submit Proof of Payment for Verification'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
