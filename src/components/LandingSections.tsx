import React from 'react';
import { CheckCircle2, ShieldAlert, ShieldCheck, Smartphone, Video } from 'lucide-react';
import { PROVINCE_NAMES } from '../data/zambia.ts';
import type { PlatformConfig } from '../types/marketplace.ts';
import { PWAInstallButton } from './PWAInstallButton.tsx';

interface LandingSectionsProps {
  config: PlatformConfig;
  onStartAdvertiserTrial: () => void;
  onRegisterBuyer: () => void;
  onSelectProvince: (province: string) => void;
}

export const LandingSections: React.FC<LandingSectionsProps> = ({
  config,
  onStartAdvertiserTrial,
  onRegisterBuyer,
  onSelectProvince,
}) => {
  const showPricing = config.advertiserPaymentRequired || config.buyerFeeEnabled;

  return (
    <>
      {/* How It Works: Dual-Path Walkthrough */}
      <section id="how-it-works" className="scroll-mt-20 border-t border-[#E5E7EB] bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl font-bold tracking-tight text-[#111827] sm:text-3xl">
              How AgriLink ZM Works
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
              Built for smallholder farmers, commercial estates, livestock breeders, and bulk buyers across Zambia.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2">
            {/* Path 1: Sellers */}
            <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAF8] p-6 sm:p-8">
              <div className="text-xs font-semibold tracking-wider text-[#1B5E20] uppercase">
                For Sellers &amp; Agro-Dealers
              </div>
              <h3 className="mt-2 font-display text-xl font-bold text-[#111827]">
                Advertise Produce &amp; Track Live Buyer Demand
              </h3>
              <ol className="mt-6 space-y-4 text-sm text-[#374151]">
                <li className="flex gap-3">
                  <span className="font-mono font-bold text-[#1B5E20]">01.</span>
                  <span>
                    <strong>Register &amp; Complete Tier 1 ID:</strong> Verify your Zambian phone number, NRC, and matching Mobile Money account name.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono font-bold text-[#1B5E20]">02.</span>
                  <span>
                    {config.advertiserPaymentRequired ? (
                      <>
                        <strong>Start {config.defaultTrialDays}-Day Free Trial:</strong> Publish listings immediately with compressed photos, 30-second video walkthroughs, and ZMW pricing.
                      </>
                    ) : (
                      <>
                        <strong>Publish Produce for Free:</strong> List commodities immediately with compressed photos, 30-second video walkthroughs, and ZMW pricing.
                      </>
                    )}
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono font-bold text-[#1B5E20]">03.</span>
                  <span>
                    <strong>Monitor Live Analytics:</strong> Watch listing impressions, video plays, and WhatsApp contact clicks stream live on your dashboard.
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={onStartAdvertiserTrial}
                className="mt-6 rounded-lg bg-[#1B5E20] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#154A19]"
              >
                {config.advertiserPaymentRequired ? 'Register as Advertiser' : 'Register & List for Free'}
              </button>
            </div>

            {/* Path 2: Buyers */}
            <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAF8] p-6 sm:p-8">
              <div className="text-xs font-semibold tracking-wider text-[#C2410C] uppercase">
                For Buyers, Retailers &amp; Off-Takers
              </div>
              <h3 className="mt-2 font-display text-xl font-bold text-[#111827]">
                Source Verified Produce Direct from Farm Depots
              </h3>
              <ol className="mt-6 space-y-4 text-sm text-[#374151]">
                <li className="flex gap-3">
                  <span className="font-mono font-bold text-[#C2410C]">01.</span>
                  <span>
                    <strong>Search All 10 Provinces:</strong> Filter commodities by province, district, ZMW price, video proof, and seller KYC tier.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono font-bold text-[#C2410C]">02.</span>
                  <span>
                    <strong>Verify Before You Deal:</strong> Inspect PACRA/ZRA verified business shields and site walkthrough videos before calling.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono font-bold text-[#C2410C]">03.</span>
                  <span>
                    <strong>Connect &amp; Rate Safely:</strong> Reveal direct Phone/WhatsApp contacts and submit interaction-gated ratings on quality and pricing honesty.
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={onRegisterBuyer}
                className="mt-6 rounded-lg border border-[#1B5E20] bg-white px-5 py-2.5 text-sm font-semibold text-[#1B5E20] hover:bg-[#EEF3EC]"
              >
                Register as Buyer
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Trust, Verification & Anti-Scam Architecture */}
      <section id="trust-safety" className="scroll-mt-20 border-t border-[#E5E7EB] bg-[#F9FAF8] py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl font-bold tracking-tight text-[#111827] sm:text-3xl">
              Three-Tier Verification &amp; Anti-Scam Protection
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
              Designed to include legitimate rural smallholders while aggressively blocking advance-fee fraud and duplicate scam accounts.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-6">
              <ShieldCheck className="h-6 w-6 text-[#1B5E20]" />
              <h3 className="mt-4 font-display text-base font-bold text-[#111827]">
                Tier 1: ID Verified
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                Mandatory Zambian SMS Phone OTP, NRC front/back upload, and Mobile Money wallet legal name matching.
              </p>
            </div>

            <div className="rounded-xl border border-[#E5E7EB] bg-white p-6">
              <CheckCircle2 className="h-6 w-6 text-[#F59E0B]" />
              <h3 className="mt-4 font-display text-base font-bold text-[#111827]">
                Tier 2: Verified Business
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                Agribusinesses, hatcheries, and agro-dealers submit PACRA registration and ZRA TPIN checked by Verification Officers.
              </p>
            </div>

            <div className="rounded-xl border border-[#E5E7EB] bg-white p-6">
              <Video className="h-6 w-6 text-[#1B5E20]" />
              <h3 className="mt-4 font-display text-base font-bold text-[#111827]">
                Tier 3: Site-Verified
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                Live farm or warehouse GPS coordinates paired with an unedited walkthrough video earn priority search ranking.
              </p>
            </div>

            <div className="rounded-xl border border-[#E5E7EB] bg-white p-6">
              <ShieldAlert className="h-6 w-6 text-[#C2410C]" />
              <h3 className="mt-4 font-display text-base font-bold text-[#111827]">
                3-Report Auto-Freeze
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                Listings reported by 3+ distinct verified buyers auto-freeze immediately; confirmed scammers face hashed NRC/wallet bans.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Transparent Pricing & Trial Section — Shown only once Super Admin enables payment switches */}
      {showPricing && (
        <section id="pricing-trial" className="scroll-mt-20 border-t border-[#E5E7EB] bg-white py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <h2 className="font-display text-2xl font-bold tracking-tight text-[#111827] sm:text-3xl">
                Transparent ZMW Pricing &amp; Mobile Money Billing
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                Pay seamlessly via MTN MoMo, Airtel Money, or Zamtel Kwacha.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2">
              {config.advertiserPaymentRequired && (
                <div className="rounded-xl border border-[#1B5E20] bg-[#F9FAF8] p-6 sm:p-8">
                  <div className="text-xs font-semibold tracking-wider text-[#1B5E20] uppercase">
                    Advertiser Plan
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="font-mono text-3xl font-bold text-[#111827] tabular-nums">
                      ZMW {config.advertiserMonthlyFeeZmw.toFixed(2)}
                    </span>
                    <span className="text-sm text-[#4B5563]">/ month after {config.defaultTrialDays}-day free trial</span>
                  </div>
                  <ul className="mt-5 space-y-2.5 text-sm text-[#374151]">
                    <li>Unlimited product photos &amp; 30-second video walkthroughs</li>
                    <li>Real-time impressions, views &amp; WhatsApp click analytics</li>
                    <li>Automated expiry reminders (5 days, 1 day, and expiry day)</li>
                    <li>Manual MoMo Proof-of-Payment &amp; Flutterwave instant USSD</li>
                  </ul>
                  <button
                    type="button"
                    onClick={onStartAdvertiserTrial}
                    className="mt-6 rounded-lg bg-[#1B5E20] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#154A19]"
                  >
                    Start {config.defaultTrialDays}-Day Free Trial
                  </button>
                </div>
              )}

              {config.buyerFeeEnabled && (
                <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 sm:p-8">
                  <div className="text-xs font-semibold tracking-wider text-[#4B5563] uppercase">
                    Buyer Access
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="font-mono text-3xl font-bold text-[#111827] tabular-nums">
                      ZMW {config.buyerFeeAmountZmw.toFixed(2)}
                    </span>
                    <span className="text-sm text-[#4B5563]">/ month continuation fee</span>
                  </div>
                  <ul className="mt-5 space-y-2.5 text-sm text-[#374151]">
                    <li>Full search &amp; filter across all 10 Zambian provinces</li>
                    <li>Direct seller Phone &amp; WhatsApp access with safety checks</li>
                    <li>Interaction-gated 1–5 star ratings &amp; scam reporting</li>
                    <li>Micro-transaction ready via MTN, Airtel &amp; Zamtel USSD</li>
                  </ul>
                  <button
                    type="button"
                    onClick={onRegisterBuyer}
                    className="mt-6 rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-5 py-2.5 text-sm font-semibold text-[#111827] hover:border-[#1B5E20]"
                  >
                    Create Buyer Account
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Footer with Provincial Links, Safety & PWA Install */}
      <footer className="border-t border-[#E5E7EB] bg-[#111827] py-12 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
            <div className="md:col-span-4">
              <div className="font-display text-xl font-extrabold text-white">AgriLink ZM</div>
              <p className="mt-2 text-sm leading-relaxed text-gray-300">
                Connecting Zambian farmers, livestock producers, and agro-dealers directly to ready buyers across all 10 provinces.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <PWAInstallButton variant="footer" />
              </div>
            </div>

            <div className="md:col-span-5">
              <div className="text-xs font-semibold tracking-wider text-[#F59E0B] uppercase">
                Browse by Province
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-300">
                {PROVINCE_NAMES.map((prov) => (
                  <button
                    key={prov}
                    type="button"
                    onClick={() => onSelectProvince(prov)}
                    className="text-left hover:text-white hover:underline"
                  >
                    {prov}
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-3">
              <div className="text-xs font-semibold tracking-wider text-[#F59E0B] uppercase">
                Safety &amp; PWA Support
              </div>
              <ul className="mt-3 space-y-2 text-sm text-gray-300">
                <li className="flex items-start gap-2">
                  <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-[#F59E0B]" />
                  <span>Works offline on low-storage Android devices via Chrome &ldquo;Add to Home Screen&rdquo;.</span>
                </li>
                <li>Never pay deposits before produce inspection.</li>
                <li>
                  Support Desk:{' '}
                  <a
                    href="tel:+260976405828"
                    className="underline decoration-gray-500 underline-offset-2 hover:text-white"
                  >
                    +260 976 405 828
                  </a>
                </li>
                <li>
                  Email:{' '}
                  <a
                    href="mailto:agrilinkzm0@gmail.com"
                    className="underline decoration-gray-500 underline-offset-2 hover:text-white"
                  >
                    agrilinkzm0@gmail.com
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-gray-800 pt-6 text-xs text-gray-400 sm:flex-row sm:items-center">
            <span>&copy; {new Date().getFullYear()} AgriLink ZM. Republic of Zambia.</span>
            <span>All transactions conducted in Zambian Kwacha (ZMW).</span>
          </div>
        </div>
      </footer>
    </>
  );
};
