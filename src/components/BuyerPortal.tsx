import React from 'react';
import { Bookmark, Flag, MessageSquare, ShieldCheck, Star } from 'lucide-react';
import type {
  ChatConversation,
  ContactRevealRecord,
  Listing,
  PaymentRecord,
  PlatformConfig,
  ScamReport,
  UserAccount,
} from '../types/marketplace.ts';
import { evaluateUserPendingPayment } from '../utils/billingNotifications.ts';
import { formatZMW } from '../utils/marketplaceRules.ts';

interface BuyerPortalProps {
  currentUser: UserAccount;
  config: PlatformConfig;
  listings: Listing[];
  sellersById: Record<string, UserAccount>;
  contactReveals: ContactRevealRecord[];
  scamReports: ScamReport[];
  conversations: ChatConversation[];
  payments?: PaymentRecord[];
  onInspectListing: (listing: Listing) => void;
  onToggleSave: (listingId: string) => void;
  onOpenPayment: () => void;
  onOpenMessages: () => void;
  onBrowseMarketplace: () => void;
}

export const BuyerPortal: React.FC<BuyerPortalProps> = ({
  currentUser,
  config,
  listings,
  sellersById,
  contactReveals,
  scamReports,
  conversations,
  payments = [],
  onInspectListing,
  onToggleSave,
  onOpenPayment,
  onOpenMessages,
  onBrowseMarketplace,
}) => {
  const savedListings = listings.filter((l) => currentUser.savedListingIds.includes(l.id));
  const myReveals = contactReveals.filter((cr) => cr.buyerId === currentUser.id);
  const myReports = scamReports.filter((sr) => sr.reporterBuyerId === currentUser.id);
  const myConversations = conversations.filter((c) => c.buyerId === currentUser.id);
  const buyerFeePaid =
    currentUser.buyerFeePaidUntilAt && currentUser.buyerFeePaidUntilAt > Date.now();
  const pendingPayment = evaluateUserPendingPayment(currentUser, config, payments);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 border-b border-[#E5E7EB] pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs font-semibold text-[#1B5E20]">
            Verified Buyer Account · {currentUser.province}, {currentUser.district}
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-[#111827]">
            {currentUser.name} — Buyer Portal
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onOpenMessages}
            className="inline-flex items-center gap-2 rounded-lg border border-[#1B5E20] bg-white px-4 py-2 text-sm font-semibold text-[#1B5E20] hover:bg-[#EEF3EC]"
          >
            <MessageSquare className="h-4 w-4" />
            In-App Messages ({myConversations.length})
          </button>
          <button
            type="button"
            onClick={onBrowseMarketplace}
            className="rounded-lg bg-[#1B5E20] px-4 py-2 text-sm font-semibold text-white hover:bg-[#154A19]"
          >
            Browse Produce Directory
          </button>
        </div>
      </div>

      {/* Buyer Fee Status Card (Only shown once Super Admin enables Buyer Monthly Fee) */}
      {config.buyerFeeEnabled && (
        <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-xl border border-[#E5E7EB] bg-white p-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-[#1B5E20]" />
            <div>
              <div className="text-sm font-bold text-[#111827]">
                {pendingPayment ? pendingPayment.bannerTitle : 'Buyer Contact & Inquiry Access Status'}
              </div>
              <p className="mt-0.5 text-xs text-[#4B5563]">
                {buyerFeePaid
                  ? `Active Buyer Access — Paid until ${new Date(currentUser.buyerFeePaidUntilAt!).toLocaleDateString()}.`
                  : pendingPayment?.bannerDescription ||
                    `Buyer Micro-Fee Active (${formatZMW(config.buyerFeeAmountZmw)}/mo) — Pay via Mobile Money to unlock seller Phone/WhatsApp contacts.`}
              </p>
            </div>
          </div>

          {!buyerFeePaid && (
            <button
              type="button"
              onClick={onOpenPayment}
              className="shrink-0 rounded-lg bg-[#C2410C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#9A3412] whitespace-nowrap"
            >
              {pendingPayment?.buttonLabel || `Pay ${formatZMW(config.buyerFeeAmountZmw)} via Mobile Money`}
            </button>
          )}
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Saved Listings */}
        <div className="rounded-xl border border-[#E5E7EB] bg-white lg:col-span-6">
          <div className="flex items-center gap-2 border-b border-[#E5E7EB] bg-[#F9FAF8] px-5 py-3.5 text-sm font-bold text-[#111827]">
            <Bookmark className="h-4 w-4 text-[#1B5E20]" />
            Saved Produce Listings ({savedListings.length})
          </div>
          <div className="divide-y divide-[#E5E7EB]">
            {savedListings.length === 0 ? (
              <div className="p-6 text-xs text-[#4B5563]">
                No saved listings yet. Bookmark produce cards while browsing to compare sellers.
              </div>
            ) : (
              savedListings.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-[#111827]">{item.title}</div>
                    <div className="text-xs text-[#4B5563]">
                      {formatZMW(item.priceZmw)} · {item.province}, {item.district}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onInspectListing(item)}
                      className="rounded-lg bg-[#1B5E20] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Inspect
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleSave(item.id)}
                      className="rounded-lg border border-[#E5E7EB] px-2.5 py-1.5 text-xs text-[#4B5563]"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Contacted Sellers Ready to Rate */}
        <div className="rounded-xl border border-[#E5E7EB] bg-white lg:col-span-6">
          <div className="flex items-center gap-2 border-b border-[#E5E7EB] bg-[#F9FAF8] px-5 py-3.5 text-sm font-bold text-[#111827]">
            <Star className="h-4 w-4 text-[#F59E0B]" />
            Contacted Sellers Unlocked for Rating ({myReveals.length})
          </div>
          <div className="divide-y divide-[#E5E7EB]">
            {myReveals.length === 0 ? (
              <div className="p-6 text-xs text-[#4B5563]">
                Reveal a seller&apos;s Phone or WhatsApp contact to unlock interaction-gated 1–5 star ratings.
              </div>
            ) : (
              myReveals.map((cr) => {
                const seller = sellersById[cr.sellerId];
                const listing = listings.find((l) => l.id === cr.listingId);
                return (
                  <div key={cr.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-[#111827]">
                        {seller?.businessName || seller?.name || 'Seller'}
                      </div>
                      <div className="truncate text-xs text-[#4B5563]">
                        {listing?.title || 'Direct Profile Inquiry'}
                      </div>
                    </div>
                    {listing && (
                      <button
                        type="button"
                        onClick={() => onInspectListing(listing)}
                        className="shrink-0 rounded-lg border border-[#1B5E20] px-3 py-1.5 text-xs font-semibold text-[#1B5E20] hover:bg-[#EEF3EC]"
                      >
                        Rate Seller
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Submitted Scam Reports */}
        <div className="rounded-xl border border-[#E5E7EB] bg-white lg:col-span-12">
          <div className="flex items-center gap-2 border-b border-[#E5E7EB] bg-[#F9FAF8] px-5 py-3.5 text-sm font-bold text-[#111827]">
            <Flag className="h-4 w-4 text-[#C2410C]" />
            Submitted Scam &amp; Fraud Reports ({myReports.length})
          </div>
          <div className="divide-y divide-[#E5E7EB]">
            {myReports.length === 0 ? (
              <div className="p-6 text-xs text-[#4B5563]">
                You have not filed any scam reports.
              </div>
            ) : (
              myReports.map((sr) => (
                <div key={sr.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-xs">
                  <div>
                    <div className="font-bold text-[#111827]">{sr.reason}</div>
                    <div className="mt-0.5 text-[#4B5563]">{sr.details}</div>
                  </div>
                  <span className="font-mono font-semibold uppercase text-[#C2410C]">
                    {sr.status.replace('_', ' ')}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
};
