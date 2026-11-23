import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import type { PlatformConfig, UserAccount } from '../types/marketplace.ts';

export type AppView = 'marketplace' | 'advertiser' | 'buyer' | 'admin';

interface NavbarProps {
  currentUser: UserAccount | null;
  config: PlatformConfig;
  activeView: AppView;
  onNavigateView: (view: AppView) => void;
  onOpenAuth: (defaultTab: 'login' | 'register_advertiser' | 'register_buyer') => void;
  onOpenChangePassword: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  config,
  activeView,
  onNavigateView,
  onOpenAuth,
  onOpenChangePassword,
  onLogout,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const showPricing = config.advertiserPaymentRequired || config.buyerFeeEnabled;
  const sellCtaLabel = config.advertiserPaymentRequired
    ? `Start Free ${config.defaultTrialDays}-Day Trial`
    : 'Sell Produce Free';

  const handleAnchorClick = (sectionId: string) => {
    setMobileMenuOpen(false);
    if (activeView !== 'marketplace') {
      onNavigateView('marketplace');
      setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    } else {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const workspaceView: AppView =
    currentUser?.role === 'super_admin' || currentUser?.role === 'staff'
      ? 'admin'
      : currentUser?.role === 'advertiser'
      ? 'advertiser'
      : 'buyer';

  const workspaceLabel =
    currentUser?.role === 'super_admin'
      ? 'Admin Console'
      : currentUser?.role === 'staff'
      ? 'Staff Desk'
      : currentUser?.role === 'advertiser'
      ? 'Seller Dashboard'
      : 'Buyer Portal';

  return (
    <header className="sticky top-0 z-40 border-b border-[#E5E7EB] bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6 lg:px-8">
        {/* Zone 1: Brand Wordmark only */}
        <button
          type="button"
          onClick={() => onNavigateView('marketplace')}
          className="font-display text-xl font-extrabold tracking-tight text-[#1B5E20] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B5E20]"
        >
          AgriLink ZM
        </button>

        {/* Zone 2: concise single-line navigation links */}
        <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-7 text-sm font-medium text-[#4B5563]">
          <button
            type="button"
            onClick={() => handleAnchorClick('marketplace-directory')}
            className="hover:text-[#1B5E20] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Browse Produce
          </button>
          <button
            type="button"
            onClick={() => handleAnchorClick('how-it-works')}
            className="hover:text-[#1B5E20] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            How It Works
          </button>
          <button
            type="button"
            onClick={() => handleAnchorClick('trust-safety')}
            className="hover:text-[#1B5E20] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Trust &amp; Safety
          </button>
          {showPricing && (
            <button
              type="button"
              onClick={() => handleAnchorClick('pricing-trial')}
              className="hover:text-[#1B5E20] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Pricing
            </button>
          )}
        </nav>

        {/* Zone 3: Single primary action area */}
        <div className="hidden md:flex items-center gap-4 shrink-0">
          {currentUser ? (
            <>
              <button
                type="button"
                onClick={() =>
                  onNavigateView(activeView === workspaceView ? 'marketplace' : workspaceView)
                }
                className="rounded-lg bg-[#1B5E20] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#154A19] whitespace-nowrap shrink-0"
              >
                {activeView === workspaceView ? 'View Marketplace' : workspaceLabel}
              </button>
              <button
                type="button"
                onClick={onOpenChangePassword}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4B5563] hover:text-[#1B5E20] whitespace-nowrap shrink-0"
              >
                {currentUser.mustChangePassword && (
                  <span className="h-2 w-2 rounded-full bg-[#C2410C]" aria-hidden="true" />
                )}
                <span>Password</span>
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="text-sm font-medium text-[#4B5563] hover:text-[#111827] whitespace-nowrap shrink-0"
              >
                Sign Out
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onOpenAuth('login')}
                className="text-sm font-semibold text-[#111827] hover:text-[#1B5E20] whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth('register_advertiser')}
                className="rounded-lg bg-[#1B5E20] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#154A19] whitespace-nowrap shrink-0"
              >
                {sellCtaLabel}
              </button>
            </>
          )}
        </div>

        {/* Mobile menu trigger */}
        <button
          type="button"
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="md:hidden rounded-lg p-2 text-[#111827] hover:bg-[#F3F5F2]"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="border-t border-[#E5E7EB] bg-white px-4 py-4 md:hidden">
          <div className="flex flex-col gap-3 text-sm font-medium text-[#111827]">
            <button
              type="button"
              onClick={() => handleAnchorClick('marketplace-directory')}
              className="py-2 text-left hover:text-[#1B5E20]"
            >
              Browse Produce
            </button>
            <button
              type="button"
              onClick={() => handleAnchorClick('how-it-works')}
              className="py-2 text-left hover:text-[#1B5E20]"
            >
              How It Works
            </button>
            <button
              type="button"
              onClick={() => handleAnchorClick('trust-safety')}
              className="py-2 text-left hover:text-[#1B5E20]"
            >
              Trust &amp; Safety
            </button>
            {showPricing && (
              <button
                type="button"
                onClick={() => handleAnchorClick('pricing-trial')}
                className="py-2 text-left hover:text-[#1B5E20]"
              >
                Pricing
              </button>
            )}
            <div className="mt-2 flex flex-col gap-2 border-t border-[#E5E7EB] pt-3">
              {currentUser ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onNavigateView(activeView === workspaceView ? 'marketplace' : workspaceView);
                    }}
                    className="w-full rounded-lg bg-[#1B5E20] px-4 py-2.5 text-center font-semibold text-white"
                  >
                    {activeView === workspaceView ? 'View Marketplace' : workspaceLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onOpenChangePassword();
                    }}
                    className="w-full rounded-lg border border-[#E5E7EB] px-4 py-2.5 text-center font-medium text-[#111827]"
                  >
                    Change Password
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full rounded-lg border border-[#E5E7EB] px-4 py-2.5 text-center font-medium text-[#4B5563]"
                  >
                    Sign Out ({currentUser.name})
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onOpenAuth('register_advertiser');
                    }}
                    className="w-full rounded-lg bg-[#1B5E20] px-4 py-2.5 text-center font-semibold text-white"
                  >
                    {sellCtaLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onOpenAuth('login');
                    }}
                    className="w-full rounded-lg border border-[#E5E7EB] px-4 py-2.5 text-center font-semibold text-[#111827]"
                  >
                    Sign In
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
