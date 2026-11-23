import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Flag,
  Lock,
  MapPin,
  MessageSquare,
  Phone,
  Play,
  ShieldCheck,
  Star,
  X,
} from 'lucide-react';
import { SCAM_REASONS, VERIFICATION_LABELS } from '../data/zambia.ts';
import type {
  ContactRevealRecord,
  Listing,
  PlatformConfig,
  Review,
  ScamReason,
  UserAccount,
} from '../types/marketplace.ts';
import {
  canBuyerRateSeller,
  computeSellerAggregateRating,
  formatZMW,
  getPublicListingCoordinates,
} from '../utils/marketplaceRules.ts';
import { ListingImage } from './ListingImage.tsx';

interface ListingDetailModalProps {
  listing: Listing;
  seller: UserAccount | undefined;
  reviews: Review[];
  contactReveals: ContactRevealRecord[];
  currentUser: UserAccount | null;
  config: PlatformConfig;
  onClose: () => void;
  onRequireAuth: () => void;
  onMessageSeller: (listing: Listing) => void;
  onTrackEvent: (
    listingId: string,
    type: 'view' | 'video_play' | 'contact_reveal'
  ) => Promise<{
    sellerContact?: { phone: string; whatsapp: string; name: string };
    requiresBuyerFee?: boolean;
    error?: string;
  }>;
  onOpenBuyerFeeCheckout: () => void;
  onSubmitReview: (payload: {
    sellerId: string;
    listingId: string;
    productQuality: number;
    communication: number;
    pricingHonesty: number;
    comment: string;
  }) => Promise<string | null>;
  onSubmitScamReport: (payload: {
    listingId: string;
    reason: ScamReason;
    details: string;
    evidenceDataUrl?: string;
  }) => Promise<{ autoFrozen?: boolean; error?: string }>;
}

export const ListingDetailModal: React.FC<ListingDetailModalProps> = ({
  listing,
  seller,
  reviews,
  contactReveals,
  currentUser,
  config,
  onClose,
  onRequireAuth,
  onMessageSeller,
  onTrackEvent,
  onOpenBuyerFeeCheckout,
  onSubmitReview,
  onSubmitScamReport,
}) => {
  const [mediaTab, setMediaTab] = useState<'photo' | 'video'>('photo');
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [revealedContact, setRevealedContact] = useState<{
    phone: string;
    whatsapp: string;
    name: string;
  } | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);
  const [needsBuyerFee, setNeedsBuyerFee] = useState(false);

  const [productQuality, setProductQuality] = useState(5);
  const [communication, setCommunication] = useState(5);
  const [pricingHonesty, setPricingHonesty] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);

  const [showReportForm, setShowReportForm] = useState(false);
  const [scamReason, setScamReason] = useState<ScamReason>(SCAM_REASONS[0]);
  const [scamDetails, setScamDetails] = useState('');
  const [evidenceName, setEvidenceName] = useState<string | undefined>();
  const [scamResult, setScamResult] = useState<string | null>(null);

  useEffect(() => {
    void onTrackEvent(listing.id, 'view');
    if (
      currentUser &&
      seller &&
      contactReveals.some((cr) => cr.buyerId === currentUser.id && cr.sellerId === seller.id)
    ) {
      setRevealedContact({
        phone: seller.phone,
        whatsapp: seller.whatsapp || seller.phone,
        name: seller.businessName || seller.name,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id]);

  const sellerReviews = reviews.filter((r) => r.sellerId === listing.sellerId);
  const ratingSummary = computeSellerAggregateRating(reviews, listing.sellerId);
  const canRate = currentUser
    ? canBuyerRateSeller(currentUser.id, listing.sellerId, contactReveals)
    : false;
  const publicLocation = getPublicListingCoordinates(listing, seller);

  const handlePlayVideo = async () => {
    setMediaTab('video');
    setVideoPlaying(true);
    await onTrackEvent(listing.id, 'video_play');
  };

  const handleRevealContact = async () => {
    setContactError(null);
    setNeedsBuyerFee(false);
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    const res = await onTrackEvent(listing.id, 'contact_reveal');
    if (res.requiresBuyerFee) {
      setNeedsBuyerFee(true);
      setContactError(res.error || 'Buyer account fee required.');
      return;
    }
    if (res.error) {
      setContactError(res.error);
      return;
    }
    if (res.sellerContact) {
      setRevealedContact(res.sellerContact);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReviewStatus(null);
    if (!reviewComment.trim()) {
      setReviewStatus('Please enter a short review describing your experience.');
      return;
    }
    const err = await onSubmitReview({
      sellerId: listing.sellerId,
      listingId: listing.id,
      productQuality,
      communication,
      pricingHonesty,
      comment: reviewComment,
    });
    if (err) {
      setReviewStatus(err);
    } else {
      setReviewComment('');
      setReviewStatus('Your verified buyer review has been published.');
    }
  };

  const handleEvidenceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setEvidenceName(typeof reader.result === 'string' ? reader.result : file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleScamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setScamResult(null);
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    if (!scamDetails.trim()) {
      setScamResult('Please describe what happened so Trust Moderators can investigate.');
      return;
    }
    const res = await onSubmitScamReport({
      listingId: listing.id,
      reason: scamReason,
      details: scamDetails,
      evidenceDataUrl: evidenceName,
    });
    if (res.error) {
      setScamResult(res.error);
    } else if (res.autoFrozen) {
      setScamResult(
        'Report submitted. This listing reached 3 distinct verified buyer reports and has been automatically frozen for Trust Moderator review.'
      );
      setScamDetails('');
    } else {
      setScamResult('Scam report submitted to AgriLink ZM Trust & Moderation Queue.');
      setScamDetails('');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="listing-modal-title"
    >
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-[#E5E7EB] bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[#E5E7EB] bg-white px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="text-xs font-medium text-[#4B5563]">
              {listing.category} · {listing.province}, {listing.district}
            </div>
            <h2
              id="listing-modal-title"
              className="truncate font-display text-lg font-bold text-[#111827] sm:text-xl"
            >
              {listing.title}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close listing details"
            onClick={onClose}
            className="rounded-lg p-2 text-[#4B5563] hover:bg-[#F3F5F2] hover:text-[#111827]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-8 p-5 sm:p-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <div>
              {listing.hasVideoWalkthrough && (
                <div className="mb-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMediaTab('photo')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      mediaTab === 'photo'
                        ? 'bg-[#1B5E20] text-white'
                        : 'border border-[#E5E7EB] bg-white text-[#4B5563]'
                    }`}
                  >
                    Product Photos
                  </button>
                  <button
                    type="button"
                    onClick={handlePlayVideo}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      mediaTab === 'video'
                        ? 'bg-[#1B5E20] text-white'
                        : 'border border-[#E5E7EB] bg-white text-[#4B5563]'
                    }`}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Walkthrough Video ({listing.videoDurationSec || 22}s)
                  </button>
                </div>
              )}

              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-[#E5E7EB] bg-[#EEF3EC]">
                {mediaTab === 'video' && listing.hasVideoWalkthrough ? (
                  <div className="relative h-full w-full">
                    <ListingImage
                      src={listing.images[0]}
                      alt={`${listing.title} video walkthrough`}
                      className="h-full w-full object-cover brightness-90"
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-between bg-black/45 p-5 text-white">
                      <div className="flex w-full items-center justify-between text-xs font-mono">
                        <span>WALKTHROUGH CLIP · {listing.province.toUpperCase()}</span>
                        <span>00:{String(listing.videoDurationSec || 24).padStart(2, '0')} MP4</span>
                      </div>
                      <div className="text-center">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#1B5E20]/90">
                          <Play className="h-6 w-6 fill-current text-white" />
                        </div>
                        <p className="mt-3 text-sm font-semibold">
                          {videoPlaying
                            ? 'Playing farm & stock verification walkthrough...'
                            : 'Click to inspect unedited harvest walkthrough'}
                        </p>
                      </div>
                      <div className="w-full rounded-full bg-white/30 p-0.5">
                        <div className="h-1.5 w-2/3 rounded-full bg-[#F59E0B]" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <ListingImage
                    src={listing.images[0]}
                    alt={listing.title}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
            </div>

            <div>
              <h3 className="font-display text-base font-bold text-[#111827]">
                Commodity Specifications
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">{listing.description}</p>
            </div>

            <div className="border-t border-[#E5E7EB] pt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-base font-bold text-[#111827]">
                  Verified Buyer Reviews ({ratingSummary.reviewCount})
                </h3>
                {ratingSummary.reviewCount > 0 && (
                  <div className="flex items-center gap-3 text-xs text-[#4B5563] tabular-nums">
                    <span>Quality {ratingSummary.productQualityAvg}/5</span>
                    <span aria-hidden="true">·</span>
                    <span>Communication {ratingSummary.communicationAvg}/5</span>
                    <span aria-hidden="true">·</span>
                    <span>Pricing {ratingSummary.pricingHonestyAvg}/5</span>
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-4">
                {sellerReviews.length === 0 ? (
                  <p className="text-sm text-[#4B5563]">
                    No buyer reviews yet. Reveal the seller&apos;s contact to inquire and leave the first verified review.
                  </p>
                ) : (
                  sellerReviews.map((rev) => (
                    <div key={rev.id} className="border-b border-[#E5E7EB] pb-4 last:border-none">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-[#111827]">{rev.buyerName}</span>
                        <span className="flex items-center gap-1 font-mono text-xs font-semibold text-[#111827] tabular-nums">
                          <Star className="h-3.5 w-3.5 fill-[#F59E0B] text-[#F59E0B]" />
                          {rev.overallRating.toFixed(1)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm text-[#4B5563]">{rev.comment}</p>
                      {rev.sellerReply && (
                        <div className="mt-2.5 rounded-lg bg-[#F9FAF8] p-3 text-xs text-[#374151]">
                          <span className="font-semibold text-[#1B5E20]">Seller Response: </span>
                          {rev.sellerReply}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="mt-6 rounded-xl border border-[#E5E7EB] bg-[#F9FAF8] p-4">
                <h4 className="text-sm font-bold text-[#111827]">Rate This Seller</h4>
                {!canRate ? (
                  <p className="mt-1.5 text-xs text-[#4B5563]">
                    {currentUser
                      ? 'Contact Gate: Reveal this seller’s Phone/WhatsApp contact or initiate WhatsApp from in-app chat first to unlock verified buyer ratings.'
                      : 'Sign in as a Buyer and reveal this seller’s contact details to unlock verified 1-to-5 star ratings.'}
                  </p>
                ) : (
                  <form onSubmit={handleReviewSubmit} className="mt-3 space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label htmlFor="rate-quality" className="block text-xs font-medium text-[#4B5563]">
                          Product Quality (1–5)
                        </label>
                        <select
                          id="rate-quality"
                          value={productQuality}
                          onChange={(e) => setProductQuality(Number(e.target.value))}
                          className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-sm"
                        >
                          {[5, 4, 3, 2, 1].map((n) => (
                            <option key={n} value={n}>
                              {n} Stars
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="rate-comm" className="block text-xs font-medium text-[#4B5563]">
                          Communication (1–5)
                        </label>
                        <select
                          id="rate-comm"
                          value={communication}
                          onChange={(e) => setCommunication(Number(e.target.value))}
                          className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-sm"
                        >
                          {[5, 4, 3, 2, 1].map((n) => (
                            <option key={n} value={n}>
                              {n} Stars
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="rate-price" className="block text-xs font-medium text-[#4B5563]">
                          Pricing Honesty (1–5)
                        </label>
                        <select
                          id="rate-price"
                          value={pricingHonesty}
                          onChange={(e) => setPricingHonesty(Number(e.target.value))}
                          className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-sm"
                        >
                          {[5, 4, 3, 2, 1].map((n) => (
                            <option key={n} value={n}>
                              {n} Stars
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="review-comment" className="sr-only">
                        Review comment
                      </label>
                      <textarea
                        id="review-comment"
                        rows={2}
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        placeholder="Share produce quality, weight accuracy, and communication notes..."
                        className="w-full rounded-lg border border-[#E5E7EB] bg-white p-2.5 text-sm focus:border-[#1B5E20] focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      className="rounded-lg bg-[#1B5E20] px-4 py-2 text-xs font-semibold text-white hover:bg-[#154A19]"
                    >
                      Submit Verified Review
                    </button>
                    {reviewStatus && <p className="text-xs font-medium text-[#1B5E20]">{reviewStatus}</p>}
                  </form>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-5 lg:col-span-5">
            <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAF8] p-5">
              <div className="font-mono text-2xl font-bold text-[#1B5E20] tabular-nums">
                {formatZMW(listing.priceZmw)}
              </div>
              <div className="mt-0.5 text-xs text-[#4B5563]">
                {listing.unitLabel} · Stock: {listing.quantityAvailable}
              </div>

              <div className="mt-4 space-y-2 border-t border-[#E5E7EB] pt-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[#4B5563]">Seller</span>
                  <span className="font-semibold text-[#111827]">
                    {seller?.businessName || seller?.name || 'Verified Farmer'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#4B5563]">Verification</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-[#1B5E20]">
                    <ShieldCheck className="h-4 w-4" />
                    {seller ? VERIFICATION_LABELS[seller.verificationTier] : 'Verified'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#4B5563]">Location</span>
                  <span className="inline-flex items-center gap-1 text-[#111827]">
                    <MapPin className="h-3.5 w-3.5 text-[#C2410C]" />
                    {listing.district}, {listing.province}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#4B5563]">Map Privacy</span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[#111827]">
                    {publicLocation.isPrecise ? (
                      <>
                        <MapPin className="h-3.5 w-3.5 text-[#1B5E20]" />
                        Precise Pin ({publicLocation.lat.toFixed(3)}, {publicLocation.lng.toFixed(3)})
                      </>
                    ) : (
                      <>
                        <Lock className="h-3.5 w-3.5 text-[#D97706]" />
                        General District Area
                      </>
                    )}
                  </span>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-[#F59E0B]/50 bg-[#FFFBEB] p-3.5 text-xs text-[#78350F]">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#D97706]" />
                  <div>
                    <strong className="font-semibold">Buyer Safety Reminder:</strong> Never pay advance deposits or transport fees via Mobile Money before inspecting produce in person or confirming the seller&apos;s Tier 2/3 verification shield.
                  </div>
                </div>
              </div>

              {/* In-App Messaging CTA (No phone number needed upfront!) */}
              <div className="mt-4 space-y-2.5">
                <button
                  type="button"
                  onClick={() => onMessageSeller(listing)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#1B5E20] bg-white px-4 py-2.5 text-sm font-semibold text-[#1B5E20] transition-colors hover:bg-[#EEF3EC]"
                >
                  <MessageSquare className="h-4 w-4" />
                  Message Seller In-App (Private Chat)
                </button>

                {!revealedContact ? (
                  <button
                    type="button"
                    onClick={handleRevealContact}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1B5E20] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#154A19]"
                  >
                    <Phone className="h-4 w-4" />
                    Reveal Phone &amp; WhatsApp Contact
                  </button>
                ) : (
                  <div className="space-y-2.5 rounded-lg border border-[#1B5E20]/30 bg-white p-4">
                    <div className="text-xs font-semibold text-[#1B5E20]">
                      Direct Seller Contact Unlocked
                    </div>
                    <div className="font-mono text-base font-bold text-[#111827] tabular-nums">
                      {revealedContact.phone}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={`tel:${revealedContact.phone}`}
                        className="flex items-center justify-center gap-1.5 rounded-lg bg-[#1B5E20] px-3 py-2 text-xs font-semibold text-white hover:bg-[#154A19]"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        Call Seller
                      </a>
                      <a
                        href={`https://wa.me/${revealedContact.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
                          `Hello ${revealedContact.name}, I saw your "${listing.title}" on AgriLink ZM.`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-[#1B5E20] px-3 py-2 text-xs font-semibold text-[#1B5E20] hover:bg-[#EEF3EC]"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        WhatsApp
                      </a>
                    </div>
                  </div>
                )}

                {contactError && (
                  <div className="mt-3 rounded-lg border border-[#C2410C]/40 bg-[#FFF7ED] p-3 text-xs text-[#9A3412]">
                    <p>{contactError}</p>
                    {needsBuyerFee && (
                      <button
                        type="button"
                        onClick={onOpenBuyerFeeCheckout}
                        className="mt-2 rounded-md bg-[#C2410C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#9A3412]"
                      >
                        Pay Buyer Fee (ZMW {config.buyerFeeAmountZmw.toFixed(2)}) via Mobile Money
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#4B5563]">
                  Spot suspicious activity?
                </span>
                <button
                  type="button"
                  onClick={() => setShowReportForm((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C2410C] hover:underline"
                >
                  <Flag className="h-3.5 w-3.5" />
                  Report Scam / Suspicious Activity
                </button>
              </div>

              {showReportForm && (
                <form onSubmit={handleScamSubmit} className="mt-4 space-y-3 border-t border-[#E5E7EB] pt-4">
                  <div>
                    <label htmlFor="scam-reason" className="block text-xs font-medium text-[#4B5563]">
                      Violation Reason
                    </label>
                    <select
                      id="scam-reason"
                      value={scamReason}
                      onChange={(e) => setScamReason(e.target.value as ScamReason)}
                      className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-xs text-[#111827]"
                    >
                      {SCAM_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="scam-details" className="block text-xs font-medium text-[#4B5563]">
                      Incident Details
                    </label>
                    <textarea
                      id="scam-details"
                      rows={2}
                      value={scamDetails}
                      onChange={(e) => setScamDetails(e.target.value)}
                      placeholder="Explain what happened (e.g., requested deposit before pickup)..."
                      className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] p-2.5 text-xs text-[#111827]"
                    />
                  </div>
                  <div>
                    <label htmlFor="scam-evidence" className="block text-xs font-medium text-[#4B5563]">
                      Screenshot Evidence (Optional WhatsApp chat / PoP)
                    </label>
                    <input
                      id="scam-evidence"
                      type="file"
                      accept="image/*"
                      onChange={handleEvidenceFile}
                      className="mt-1 block w-full text-xs text-[#4B5563]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-[#C2410C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#9A3412]"
                  >
                    Submit Scam Report
                  </button>
                  {scamResult && <p className="text-xs font-medium text-[#C2410C]">{scamResult}</p>}
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
