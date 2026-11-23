import React from 'react';
import { Search } from 'lucide-react';
import { PRODUCT_CATEGORIES, PROVINCE_NAMES } from '../data/zambia.ts';
import type { PlatformConfig } from '../types/marketplace.ts';

interface HeroSectionProps {
  query: string;
  province: string;
  category: string;
  config: PlatformConfig;
  activeListingsCount: number;
  onQueryChange: (val: string) => void;
  onProvinceChange: (val: string) => void;
  onCategoryChange: (val: string) => void;
  onSearchSubmit: () => void;
  onStartTrial: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  query,
  province,
  category,
  config,
  activeListingsCount,
  onQueryChange,
  onProvinceChange,
  onCategoryChange,
  onSearchSubmit,
  onStartTrial,
}) => {
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchSubmit();
  };

  const showPricing = config.advertiserPaymentRequired || config.buyerFeeEnabled;

  return (
    <section className="border-b border-[#E5E7EB] bg-white">
      <div className="relative overflow-hidden bg-[#132A15]">
        <img
          src="/src/assets/images/hero_zambia_farm_1795467059680.jpg"
          alt="Zambian farmers harvesting maize and loading grain sacks at golden hour"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover object-center opacity-70"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/35"
        />

        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold tracking-wider text-[#F59E0B] uppercase">
              Zambia Digital Agricultural Marketplace
            </p>
            <h1
              className="mt-3 font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl"
              style={{ textWrap: 'balance', lineHeight: 1.12 }}
            >
              Connecting Zambian Farmers Directly to Ready Buyers Across All 10 Provinces
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/90 sm:text-lg">
              Showcase maize, soya beans, horticulture, poultry, tilapia, and farm equipment with photos, short walkthrough videos, and verified farm locations—direct to buyers with zero middlemen.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onStartTrial}
                className="rounded-lg bg-[#F59E0B] px-5 py-3 text-sm font-bold text-[#111827] transition-colors hover:bg-[#D97706] hover:text-white whitespace-nowrap shrink-0"
              >
                {config.advertiserPaymentRequired
                  ? `Start Free ${config.defaultTrialDays}-Day Seller Trial`
                  : 'Start Selling Free'}
              </button>
              <button
                type="button"
                onClick={onSearchSubmit}
                className="rounded-lg border border-white/40 bg-black/30 px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-black/50 whitespace-nowrap shrink-0"
              >
                Explore {activeListingsCount} Verified Listings
              </button>
            </div>
          </div>

          {/* Instant Search Bar */}
          <form
            onSubmit={handleFormSubmit}
            className="mt-10 rounded-xl border border-white/20 bg-white p-3 shadow-lg sm:p-4"
            aria-label="Search agricultural listings across Zambia"
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
              <div className="md:col-span-5">
                <label htmlFor="hero-search-keyword" className="sr-only">
                  Commodity or keyword
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                  <input
                    id="hero-search-keyword"
                    type="text"
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    placeholder="Search Maize, Soya Beans, Broilers, Tilapia..."
                    className="w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] py-2.5 pl-9 pr-3 text-sm text-[#111827] placeholder-[#6B7280] focus:border-[#1B5E20] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="md:col-span-3">
                <label htmlFor="hero-province-select" className="sr-only">
                  Province
                </label>
                <select
                  id="hero-province-select"
                  value={province}
                  onChange={(e) => onProvinceChange(e.target.value)}
                  className="w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2.5 text-sm text-[#111827] focus:border-[#1B5E20] focus:bg-white focus:outline-none"
                >
                  <option value="All">All 10 Provinces</option>
                  {PROVINCE_NAMES.map((p) => (
                    <option key={p} value={p}>
                      {p} Province
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label htmlFor="hero-category-select" className="sr-only">
                  Category
                </label>
                <select
                  id="hero-category-select"
                  value={category}
                  onChange={(e) => onCategoryChange(e.target.value)}
                  className="w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2.5 text-sm text-[#111827] focus:border-[#1B5E20] focus:bg-white focus:outline-none"
                >
                  <option value="All">All Categories</option>
                  {PRODUCT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <button
                  type="submit"
                  className="w-full rounded-lg bg-[#1B5E20] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#154A19] whitespace-nowrap"
                >
                  Search Market
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Clean Full-Width 4-Column Platform Fact Strip */}
      <div className="mx-auto grid max-w-7xl grid-cols-2 divide-y divide-[#E5E7EB] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <div className="px-4 py-4 sm:px-6">
          <div className="text-xs font-medium text-[#4B5563]">National Coverage</div>
          <div className="mt-1 font-display text-lg font-bold text-[#111827] tabular-nums">
            10 Provinces · All Districts
          </div>
        </div>
        <div className="px-4 py-4 sm:px-6">
          <div className="text-xs font-medium text-[#4B5563]">Seller Verification</div>
          <div className="mt-1 font-display text-lg font-bold text-[#111827] tabular-nums">
            NRC · PACRA · Site GPS
          </div>
        </div>
        <div className="px-4 py-4 sm:px-6">
          <div className="text-xs font-medium text-[#4B5563]">Seller Onboarding</div>
          <div className="mt-1 font-display text-lg font-bold text-[#1B5E20] tabular-nums">
            {config.advertiserPaymentRequired
              ? `${config.defaultTrialDays}-Day Free Trial`
              : 'Free at Launch'}
          </div>
        </div>
        <div className="px-4 py-4 sm:px-6">
          <div className="text-xs font-medium text-[#4B5563]">
            {showPricing ? 'ZMW Payments' : 'Direct Connection'}
          </div>
          <div className="mt-1 font-display text-lg font-bold text-[#111827]">
            {showPricing ? 'MTN · Airtel · Zamtel' : 'Call · WhatsApp · Chat'}
          </div>
        </div>
      </div>
    </section>
  );
};
