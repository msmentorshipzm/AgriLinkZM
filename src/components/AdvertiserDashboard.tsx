import React, { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Eye,
  Lock,
  MapPin,
  MessageSquare,
  Navigation,
  Plus,
  ShieldCheck,
  Trash2,
  Video,
} from 'lucide-react';
import {
  PRODUCT_CATEGORIES,
  PROVINCE_NAMES,
  VERIFICATION_LABELS,
  ZAMBIA_PROVINCES,
  getDistrictCoordinates,
} from '../data/zambia.ts';
import type {
  AnalyticsStreamEvent,
  ChatConversation,
  KycSubmission,
  Listing,
  LocationPrivacyMode,
  PaymentRecord,
  PlatformConfig,
  ProductCategory,
  Review,
  UserAccount,
} from '../types/marketplace.ts';
import { evaluateUserPendingPayment } from '../utils/billingNotifications.ts';
import { computeTrialStatus, formatZMW } from '../utils/marketplaceRules.ts';

interface AdvertiserDashboardProps {
  currentUser: UserAccount;
  config: PlatformConfig;
  listings: Listing[];
  reviews: Review[];
  payments?: PaymentRecord[];
  kycSubmissions: KycSubmission[];
  conversations: ChatConversation[];
  recentEvents: AnalyticsStreamEvent[];
  onCreateListing: (payload: Partial<Listing>) => Promise<string | null>;
  onUpdateListing: (listingId: string, updates: Partial<Listing>) => Promise<string | null>;
  onDeleteListing: (listingId: string) => Promise<string | null>;
  onSubmitKyc: (payload: Partial<KycSubmission>) => Promise<string | null>;
  onReplyReview: (reviewId: string, reply: string) => Promise<string | null>;
  onOpenPayment: () => void;
  onOpenMessages: () => void;
}

const SAMPLE_STOCK_IMAGES = [
  { label: 'White Maize Sacks', url: '/src/assets/images/listing_maize_sacks_1795467060330.jpg' },
  { label: 'Broiler Poultry House', url: '/src/assets/images/listing_broiler_poultry_1795467060137.jpg' },
  { label: 'Fresh Tomato Crates', url: '/src/assets/images/listing_tomato_crates_1795467060395.jpg' },
  { label: 'Lake Kariba Tilapia', url: '/src/assets/images/listing_tilapia_fish_1795467060008.jpg' },
  { label: 'Harvested Soya Beans', url: '/src/assets/images/listing_soya_beans_1795467060008.jpg' },
  { label: 'Utility Farm Tractor', url: '/src/assets/images/listing_tractor_equipment_1795467061489.jpg' },
];

async function compressListingPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 960;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = () => resolve(String(reader.result));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Failed to load photo'));
    reader.readAsDataURL(file);
  });
}

export const AdvertiserDashboard: React.FC<AdvertiserDashboardProps> = ({
  currentUser,
  config,
  listings,
  reviews,
  payments = [],
  kycSubmissions,
  conversations,
  recentEvents,
  onCreateListing,
  onUpdateListing,
  onDeleteListing,
  onSubmitKyc,
  onReplyReview,
  onOpenPayment,
  onOpenMessages,
}) => {
  const [activeTab, setActiveTab] = useState<'listings' | 'kyc' | 'reviews'>('listings');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create Listing State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ProductCategory>('Crops & Grains');
  const [priceZmw, setPriceZmw] = useState('');
  const [unitLabel, setUnitLabel] = useState('per 50kg bag');
  const [quantityAvailable, setQuantityAvailable] = useState('');
  const [province, setProvince] = useState(currentUser.province || 'Lusaka');
  const [district, setDistrict] = useState(currentUser.district || 'Lusaka');
  const initialCoords =
    currentUser.farmCoordinates || getDistrictCoordinates(currentUser.province, currentUser.district);
  const [coordLat, setCoordLat] = useState(String(initialCoords.lat));
  const [coordLng, setCoordLng] = useState(String(initialCoords.lng));
  const [locationPrivacy, setLocationPrivacy] = useState<LocationPrivacyMode>(
    currentUser.defaultLocationPrivacy || 'district_general'
  );
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState(SAMPLE_STOCK_IMAGES[0].url);
  const [hasVideoWalkthrough, setHasVideoWalkthrough] = useState(true);
  const [formFeedback, setFormFeedback] = useState<string | null>(null);

  // KYC State
  const [requestedTier, setRequestedTier] = useState<'tier2_business' | 'tier3_site'>('tier2_business');
  const [pacraNumber, setPacraNumber] = useState(currentUser.pacraNumber || '');
  const [zraTpin, setZraTpin] = useState(currentUser.zraTpin || '');
  const [siteGpsPin, setSiteGpsPin] = useState(
    currentUser.siteGpsPin || `${initialCoords.lat.toFixed(4)}, ${initialCoords.lng.toFixed(4)}`
  );
  const [walkthroughVideoRef, setWalkthroughVideoRef] = useState('farm-depot-walkthrough.mp4');
  const [kycStatus, setKycStatus] = useState<string | null>(null);

  // Review Replies
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyStatus, setReplyStatus] = useState<string | null>(null);

  const trialEval = computeTrialStatus(currentUser, config);
  const pendingPayment = evaluateUserPendingPayment(currentUser, config, payments);
  const myListings = listings.filter((l) => l.sellerId === currentUser.id);
  const myReviews = reviews.filter((r) => r.sellerId === currentUser.id);
  const myKyc = kycSubmissions.filter((k) => k.userId === currentUser.id);
  const myConversations = conversations.filter(
    (c) => c.sellerId === currentUser.id || c.buyerId === currentUser.id
  );
  const sellerEvents = recentEvents.filter((e) => !e.sellerId || e.sellerId === currentUser.id);

  const totalImpressions = myListings.reduce((acc, l) => acc + l.impressions, 0);
  const totalViews = myListings.reduce((acc, l) => acc + l.views, 0);
  const totalVideoPlays = myListings.reduce((acc, l) => acc + l.videoPlays, 0);
  const totalContactReveals = myListings.reduce((acc, l) => acc + l.contactReveals, 0);

  const canExposePrecisePin =
    currentUser.verificationTier === 'tier2_business' || currentUser.verificationTier === 'tier3_site';

  const handleProvinceChange = (nextProv: string) => {
    setProvince(nextProv);
    const list = ZAMBIA_PROVINCES[nextProv] || [];
    const nextDist = list[0] || '';
    setDistrict(nextDist);
    const coords = getDistrictCoordinates(nextProv, nextDist);
    setCoordLat(String(coords.lat));
    setCoordLng(String(coords.lng));
  };

  const handleDistrictChange = (nextDist: string) => {
    setDistrict(nextDist);
    const coords = getDistrictCoordinates(province, nextDist);
    setCoordLat(String(coords.lat));
    setCoordLng(String(coords.lng));
  };

  const handleUseBrowserGps = () => {
    if (!navigator.geolocation) {
      setFormFeedback('Browser GPS unavailable; using selected Zambian district center.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoordLat(pos.coords.latitude.toFixed(5));
        setCoordLng(pos.coords.longitude.toFixed(5));
        setFormFeedback('Farm/depot GPS coordinates captured.');
      },
      () => {
        setFormFeedback('GPS permission declined; district centroid remains populated.');
      },
      { timeout: 6000 }
    );
  };

  const handleCustomPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressListingPhoto(file);
      setImageUrl(compressed);
    } catch {
      setFormFeedback('Could not compress selected photo.');
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);
    const price = Number(priceZmw);
    if (!title.trim() || !Number.isFinite(price) || price <= 0) {
      setFormFeedback('Enter a valid product title and ZMW price greater than 0.');
      return;
    }
    const lat = Number(coordLat);
    const lng = Number(coordLng);

    const err = await onCreateListing({
      title: title.trim(),
      category,
      priceZmw: price,
      unitLabel: unitLabel.trim() || 'per unit',
      quantityAvailable: quantityAvailable.trim() || 'Available now',
      province,
      district,
      coordinates:
        Number.isFinite(lat) && Number.isFinite(lng)
          ? { lat, lng }
          : getDistrictCoordinates(province, district),
      locationPrivacy: canExposePrecisePin ? locationPrivacy : 'district_general',
      description: description.trim(),
      images: [imageUrl],
      hasVideoWalkthrough,
    });

    if (err) {
      setFormFeedback(err);
    } else {
      setTitle('');
      setPriceZmw('');
      setQuantityAvailable('');
      setDescription('');
      setShowCreateForm(false);
      setFormFeedback('Listing published live to the AgriLink ZM marketplace.');
    }
  };

  const handleKycSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setKycStatus(null);
    const err = await onSubmitKyc({
      requestedTier,
      pacraNumber: pacraNumber.trim(),
      zraTpin: zraTpin.trim(),
      siteGpsPin: siteGpsPin.trim(),
      walkthroughVideoRef: walkthroughVideoRef.trim(),
    });
    if (err) {
      setKycStatus(err);
    } else {
      setKycStatus('KYC dossier submitted to Verification Officers.');
    }
  };

  const handleReplySubmit = async (reviewId: string) => {
    setReplyStatus(null);
    const text = (replyDrafts[reviewId] || '').trim();
    if (!text) return;
    const err = await onReplyReview(reviewId, text);
    if (err) {
      setReplyStatus(err);
    } else {
      setReplyDrafts((prev) => ({ ...prev, [reviewId]: '' }));
      setReplyStatus('Public seller response posted.');
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header Row */}
      <div className="flex flex-col gap-4 border-b border-[#E5E7EB] pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs font-semibold text-[#1B5E20]">
            {VERIFICATION_LABELS[currentUser.verificationTier]} · {currentUser.province}, {currentUser.district}
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-[#111827]">
            {currentUser.businessName || currentUser.name} — Seller Dashboard
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onOpenMessages}
            className="inline-flex items-center gap-2 rounded-lg border border-[#1B5E20] bg-white px-4 py-2 text-sm font-semibold text-[#1B5E20] hover:bg-[#EEF3EC]"
          >
            <MessageSquare className="h-4 w-4" />
            Buyer Messages ({myConversations.length})
          </button>
          {config.advertiserPaymentRequired && (
            <button
              type="button"
              onClick={onOpenPayment}
              className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-[#111827] hover:border-[#1B5E20]"
            >
              Pay / Renew (ZMW {config.advertiserMonthlyFeeZmw.toFixed(0)})
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setActiveTab('listings');
              setShowCreateForm((v) => !v);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B5E20] px-4 py-2 text-sm font-semibold text-white hover:bg-[#154A19]"
          >
            <Plus className="h-4 w-4" />
            Publish New Listing
          </button>
        </div>
      </div>

      {/* Trial & Billing Status Banner (Visible for ALL unpaid advertisers once Super Admin activates advertiser payments) */}
      {pendingPayment && (
        <div
          className={`mt-6 flex flex-col items-start justify-between gap-4 rounded-xl border p-4 sm:flex-row sm:items-center ${
            pendingPayment.isOverdue
              ? 'border-[#C2410C]/40 bg-[#FFF7ED] text-[#9A3412]'
              : 'border-[#F59E0B]/50 bg-[#FFFBEB] text-[#78350F]'
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="text-sm">
              <strong>{pendingPayment.bannerTitle}:</strong>{' '}
              {pendingPayment.bannerDescription}
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenPayment}
            className="shrink-0 rounded-lg bg-[#1B5E20] px-4 py-2 text-xs font-semibold text-white hover:bg-[#154A19] whitespace-nowrap"
          >
            {pendingPayment.buttonLabel}
          </button>
        </div>
      )}

      {config.advertiserPaymentRequired && trialEval.effectiveAccountStatus === 'active_paid' && (
        <div className="mt-6 flex items-center justify-between rounded-xl border border-[#1B5E20]/25 bg-[#EEF3EC] px-4 py-3 text-xs font-medium text-[#1B5E20]">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Active Paid Subscription · {trialEval.daysRemaining} days remaining on current billing cycle.
          </span>
          <span className="font-mono font-bold tabular-nums">ZMW {config.advertiserMonthlyFeeZmw.toFixed(2)}/mo</span>
        </div>
      )}

      {/* Real-Time KPI Row */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
          <div className="flex items-center justify-between text-xs font-medium text-[#4B5563]">
            <span>Total Impressions</span>
            <BarChart3 className="h-4 w-4 text-[#1B5E20]" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[#111827] tabular-nums">
            {totalImpressions.toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
          <div className="flex items-center justify-between text-xs font-medium text-[#4B5563]">
            <span>Listing Views</span>
            <Eye className="h-4 w-4 text-[#1B5E20]" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[#111827] tabular-nums">
            {totalViews.toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
          <div className="flex items-center justify-between text-xs font-medium text-[#4B5563]">
            <span>Walkthrough Plays</span>
            <Video className="h-4 w-4 text-[#F59E0B]" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[#111827] tabular-nums">
            {totalVideoPlays.toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
          <div className="flex items-center justify-between text-xs font-medium text-[#4B5563]">
            <span>Buyer Contact Clicks</span>
            <MessageSquare className="h-4 w-4 text-[#C2410C]" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[#1B5E20] tabular-nums">
            {totalContactReveals.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="mt-8 flex flex-wrap gap-2 border-b border-[#E5E7EB] pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('listings')}
          className={`rounded-lg px-4 py-2 text-xs font-semibold ${
            activeTab === 'listings'
              ? 'bg-[#1B5E20] text-white'
              : 'border border-[#E5E7EB] bg-white text-[#4B5563]'
          }`}
        >
          My Listings &amp; Live Feed ({myListings.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('kyc')}
          className={`rounded-lg px-4 py-2 text-xs font-semibold ${
            activeTab === 'kyc'
              ? 'bg-[#1B5E20] text-white'
              : 'border border-[#E5E7EB] bg-white text-[#4B5563]'
          }`}
        >
          KYC Verification ({VERIFICATION_LABELS[currentUser.verificationTier]})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('reviews')}
          className={`rounded-lg px-4 py-2 text-xs font-semibold ${
            activeTab === 'reviews'
              ? 'bg-[#1B5E20] text-white'
              : 'border border-[#E5E7EB] bg-white text-[#4B5563]'
          }`}
        >
          Buyer Reviews ({myReviews.length})
        </button>
      </div>

      {activeTab === 'listings' && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-8">
            {formFeedback && (
              <div className="rounded-lg border border-[#1B5E20]/30 bg-[#EEF3EC] px-4 py-3 text-xs font-medium text-[#1B5E20]">
                {formFeedback}
              </div>
            )}

            {showCreateForm && (
              <form
                onSubmit={handleCreateSubmit}
                className="space-y-4 rounded-xl border border-[#E5E7EB] bg-white p-6"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold text-[#111827]">
                    Create Agricultural Product Listing
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="text-xs font-semibold text-[#4B5563] hover:text-[#111827]"
                  >
                    Cancel
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="lst-title" className="block text-xs font-medium text-[#4B5563]">
                      Listing Title *
                    </label>
                    <input
                      id="lst-title"
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Grade A Shelled White Maize (50kg Bags)"
                      className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm text-[#111827]"
                    />
                  </div>

                  <div>
                    <label htmlFor="lst-cat" className="block text-xs font-medium text-[#4B5563]">
                      Category *
                    </label>
                    <select
                      id="lst-cat"
                      value={category}
                      onChange={(e) => setCategory(e.target.value as ProductCategory)}
                      className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm text-[#111827]"
                    >
                      {PRODUCT_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="lst-price" className="block text-xs font-medium text-[#4B5563]">
                      Price (ZMW) *
                    </label>
                    <input
                      id="lst-price"
                      type="number"
                      min="1"
                      value={priceZmw}
                      onChange={(e) => setPriceZmw(e.target.value)}
                      placeholder="320"
                      className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 font-mono text-sm text-[#111827]"
                    />
                  </div>

                  <div>
                    <label htmlFor="lst-unit" className="block text-xs font-medium text-[#4B5563]">
                      Unit Label
                    </label>
                    <input
                      id="lst-unit"
                      type="text"
                      value={unitLabel}
                      onChange={(e) => setUnitLabel(e.target.value)}
                      placeholder="per 50kg bag"
                      className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm text-[#111827]"
                    />
                  </div>

                  <div>
                    <label htmlFor="lst-qty" className="block text-xs font-medium text-[#4B5563]">
                      Quantity Available
                    </label>
                    <input
                      id="lst-qty"
                      type="text"
                      value={quantityAvailable}
                      onChange={(e) => setQuantityAvailable(e.target.value)}
                      placeholder="e.g. 500 bags"
                      className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm text-[#111827]"
                    />
                  </div>

                  <div>
                    <label htmlFor="lst-prov" className="block text-xs font-medium text-[#4B5563]">
                      Province *
                    </label>
                    <select
                      id="lst-prov"
                      value={province}
                      onChange={(e) => handleProvinceChange(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm text-[#111827]"
                    >
                      {PROVINCE_NAMES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="lst-dist" className="block text-xs font-medium text-[#4B5563]">
                      District *
                    </label>
                    <select
                      id="lst-dist"
                      value={district}
                      onChange={(e) => handleDistrictChange(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm text-[#111827]"
                    >
                      {(ZAMBIA_PROVINCES[province] || []).map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Farm / Depot Coordinates & Location Privacy Controls */}
                  <div className="sm:col-span-2 rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#111827]">
                        Farm / Depot Geolocation &amp; Public Privacy
                      </span>
                      <button
                        type="button"
                        onClick={handleUseBrowserGps}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[#1B5E20] bg-white px-2.5 py-1 text-xs font-semibold text-[#1B5E20] hover:bg-[#EEF3EC]"
                      >
                        <Navigation className="h-3 w-3" />
                        Capture Current GPS Pin
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label htmlFor="lst-lat" className="block text-xs font-medium text-[#4B5563]">
                          Latitude
                        </label>
                        <input
                          id="lst-lat"
                          type="text"
                          value={coordLat}
                          onChange={(e) => setCoordLat(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 font-mono text-xs text-[#111827]"
                        />
                      </div>
                      <div>
                        <label htmlFor="lst-lng" className="block text-xs font-medium text-[#4B5563]">
                          Longitude
                        </label>
                        <input
                          id="lst-lng"
                          type="text"
                          value={coordLng}
                          onChange={(e) => setCoordLng(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 font-mono text-xs text-[#111827]"
                        />
                      </div>
                      <div>
                        <label htmlFor="lst-privacy" className="block text-xs font-medium text-[#4B5563]">
                          Public Map Display
                        </label>
                        <select
                          id="lst-privacy"
                          value={canExposePrecisePin ? locationPrivacy : 'district_general'}
                          onChange={(e) => setLocationPrivacy(e.target.value as LocationPrivacyMode)}
                          disabled={!canExposePrecisePin}
                          className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs text-[#111827] disabled:opacity-60"
                        >
                          <option value="district_general">General District Area (Masked)</option>
                          <option value="precise_pin">
                            Precise Farm/Depot Pin (Tier 2/3 Verified Only)
                          </option>
                        </select>
                      </div>
                    </div>
                    {!canExposePrecisePin && (
                      <p className="text-[11px] text-[#4B5563]">
                        Complete Tier 2 (PACRA/ZRA) or Tier 3 KYC to unlock precise farm/depot map pins; buyers currently see your general district center.
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="lst-photo-preset" className="block text-xs font-medium text-[#4B5563]">
                      Commodity Photo Preset
                    </label>
                    <select
                      id="lst-photo-preset"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm text-[#111827]"
                    >
                      {SAMPLE_STOCK_IMAGES.map((img) => (
                        <option key={img.url} value={img.url}>
                          {img.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="lst-photo-file" className="block text-xs font-medium text-[#4B5563]">
                      Or Upload Farm Photo (Auto-Compressed)
                    </label>
                    <input
                      id="lst-photo-file"
                      type="file"
                      accept="image/*"
                      onChange={handleCustomPhotoUpload}
                      className="mt-1.5 block w-full text-xs text-[#4B5563]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="lst-desc" className="block text-xs font-medium text-[#4B5563]">
                      Specifications &amp; Pickup Details
                    </label>
                    <textarea
                      id="lst-desc"
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe moisture percentage, breed/variety, packaging, and depot hours..."
                      className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] p-3 text-sm text-[#111827]"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs font-medium text-[#111827]">
                  <input
                    type="checkbox"
                    checked={hasVideoWalkthrough}
                    onChange={(e) => setHasVideoWalkthrough(e.target.checked)}
                    className="h-4 w-4 accent-[#1B5E20]"
                  />
                  <span>Include 24s unedited stock walkthrough video</span>
                </label>

                <button
                  type="submit"
                  className="rounded-lg bg-[#1B5E20] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#154A19]"
                >
                  Publish Advert Live
                </button>
              </form>
            )}

            {/* Seller Listings Management Table */}
            <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
              <div className="border-b border-[#E5E7EB] bg-[#F9FAF8] px-5 py-3.5 text-sm font-bold text-[#111827]">
                Published Agricultural Listings
              </div>
              {myListings.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#4B5563]">
                  You have no listings yet. Click &ldquo;Publish New Listing&rdquo; to showcase your produce.
                </div>
              ) : (
                <div className="divide-y divide-[#E5E7EB]">
                  {myListings.map((item) => (
                    <div key={item.id} className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#4B5563]">
                          <span
                            className={`font-semibold ${
                              item.status === 'active'
                                ? 'text-[#1B5E20]'
                                : item.status === 'under_investigation'
                                ? 'text-[#C2410C]'
                                : 'text-[#D97706]'
                            }`}
                          >
                            {item.status.replace('_', ' ').toUpperCase()}
                          </span>
                          <span>·</span>
                          <span>
                            {item.province}, {item.district}
                          </span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            {item.locationPrivacy === 'precise_pin' ? (
                              <>
                                <MapPin className="h-3 w-3 text-[#1B5E20]" />
                                Precise Pin
                              </>
                            ) : (
                              <>
                                <Lock className="h-3 w-3 text-[#D97706]" />
                                District Area
                              </>
                            )}
                          </span>
                        </div>
                        <h3 className="mt-1 font-display text-base font-bold text-[#111827]">
                          {item.title}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-xs text-[#4B5563] tabular-nums">
                          <span className="font-bold text-[#1B5E20]">{formatZMW(item.priceZmw)}</span>
                          <span>{item.views} views</span>
                          <span>{item.contactReveals} contact clicks</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {canExposePrecisePin && (
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateListing(item.id, {
                                locationPrivacy:
                                  item.locationPrivacy === 'precise_pin'
                                    ? 'district_general'
                                    : 'precise_pin',
                              })
                            }
                            className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-semibold text-[#111827] hover:border-[#1B5E20]"
                          >
                            {item.locationPrivacy === 'precise_pin' ? 'Mask to District' : 'Show Precise Pin'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateListing(item.id, {
                              status: item.status === 'active' ? 'sold_out' : 'active',
                            })
                          }
                          className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-semibold text-[#111827] hover:border-[#1B5E20]"
                        >
                          {item.status === 'active' ? 'Mark Sold Out' : 'Reactivate'}
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${item.title}`}
                          onClick={() => onDeleteListing(item.id)}
                          className="rounded-lg border border-[#E5E7EB] p-1.5 text-[#C2410C] hover:bg-[#FFF7ED]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Rail: Live SSE Analytics Stream */}
          <div className="lg:col-span-4">
            <div className="rounded-xl border border-[#E5E7EB] bg-white">
              <div className="border-b border-[#E5E7EB] bg-[#F9FAF8] px-5 py-3.5 text-sm font-bold text-[#111827]">
                Live Buyer Engagement Stream
              </div>
              <div className="max-h-[460px] divide-y divide-[#E5E7EB] overflow-y-auto">
                {sellerEvents.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#4B5563]">
                    Waiting for live impressions, video plays, and contact clicks...
                  </div>
                ) : (
                  sellerEvents.slice(0, 12).map((evt) => (
                    <div key={evt.id} className="px-5 py-3.5 text-xs">
                      <div className="font-semibold text-[#111827]">{evt.message}</div>
                      <div className="mt-1 font-mono text-[11px] text-[#6B7280] tabular-nums">
                        {new Date(evt.timestamp).toLocaleTimeString()} · {evt.province || 'Zambia'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'kyc' && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form
            onSubmit={handleKycSubmit}
            className="space-y-4 rounded-xl border border-[#E5E7EB] bg-white p-6 lg:col-span-7"
          >
            <h2 className="font-display text-lg font-bold text-[#111827]">
              Upgrade Seller Verification (Tier 2 / Tier 3)
            </h2>
            <p className="text-xs text-[#4B5563]">
              Tier 2 &amp; Tier 3 verification unlocks higher marketplace ranking and permits showing your precise farm/depot GPS pin on the Zambia Map.
            </p>

            <div>
              <label htmlFor="kyc-tier" className="block text-xs font-medium text-[#4B5563]">
                Requested Verification Level
              </label>
              <select
                id="kyc-tier"
                value={requestedTier}
                onChange={(e) => setRequestedTier(e.target.value as 'tier2_business' | 'tier3_site')}
                className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm text-[#111827]"
              >
                <option value="tier2_business">Tier 2: Verified Business (PACRA + ZRA TPIN)</option>
                <option value="tier3_site">Tier 3: Site-Verified (Farm GPS Pin + Walkthrough Video)</option>
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="kyc-pacra" className="block text-xs font-medium text-[#4B5563]">
                  PACRA Registration No.
                </label>
                <input
                  id="kyc-pacra"
                  type="text"
                  value={pacraNumber}
                  onChange={(e) => setPacraNumber(e.target.value)}
                  placeholder="120220045891"
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="kyc-tpin" className="block text-xs font-medium text-[#4B5563]">
                  ZRA TPIN
                </label>
                <input
                  id="kyc-tpin"
                  type="text"
                  value={zraTpin}
                  onChange={(e) => setZraTpin(e.target.value)}
                  placeholder="1004582910"
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm"
                />
              </div>
            </div>

            {requestedTier === 'tier3_site' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="kyc-gps" className="block text-xs font-medium text-[#4B5563]">
                    Farm / Warehouse GPS Pin
                  </label>
                  <input
                    id="kyc-gps"
                    type="text"
                    value={siteGpsPin}
                    onChange={(e) => setSiteGpsPin(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 font-mono text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="kyc-video" className="block text-xs font-medium text-[#4B5563]">
                    Unedited Walkthrough Video Reference
                  </label>
                  <input
                    id="kyc-video"
                    type="text"
                    value={walkthroughVideoRef}
                    onChange={(e) => setWalkthroughVideoRef(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-xs"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-[#1B5E20] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#154A19]"
            >
              <ShieldCheck className="h-4 w-4" />
              Submit KYC Verification Request
            </button>
            {kycStatus && <p className="text-xs font-medium text-[#1B5E20]">{kycStatus}</p>}
          </form>

          <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 lg:col-span-5">
            <h3 className="font-display text-base font-bold text-[#111827]">
              Submitted KYC History
            </h3>
            <div className="mt-4 space-y-3">
              {myKyc.length === 0 ? (
                <p className="text-xs text-[#4B5563]">
                  Current Tier: {VERIFICATION_LABELS[currentUser.verificationTier]}. No upgrade requests submitted yet.
                </p>
              ) : (
                myKyc.map((sub) => (
                  <div key={sub.id} className="rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] p-3 text-xs">
                    <div className="flex items-center justify-between font-bold text-[#111827]">
                      <span>{VERIFICATION_LABELS[sub.requestedTier]}</span>
                      <span className="uppercase text-[#1B5E20]">{sub.status}</span>
                    </div>
                    <div className="mt-1 text-[#4B5563]">
                      PACRA: {sub.pacraNumber || 'N/A'} · TPIN: {sub.zraTpin || 'N/A'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'reviews' && (
        <div className="mt-6 space-y-4">
          {replyStatus && (
            <div className="rounded-lg border border-[#1B5E20]/30 bg-[#EEF3EC] px-4 py-2.5 text-xs font-medium text-[#1B5E20]">
              {replyStatus}
            </div>
          )}
          {myReviews.length === 0 ? (
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-8 text-center text-sm text-[#4B5563]">
              No buyer reviews yet. Reviews unlock automatically when buyers reveal your Phone/WhatsApp contact.
            </div>
          ) : (
            myReviews.map((rev) => (
              <div key={rev.id} className="rounded-xl border border-[#E5E7EB] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[#111827]">{rev.buyerName}</span>
                  <span className="font-mono text-xs font-bold text-[#1B5E20] tabular-nums">
                    Overall {rev.overallRating.toFixed(1)} / 5 · Quality {rev.productQuality} · Comm {rev.communication} · Price {rev.pricingHonesty}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[#4B5563]">{rev.comment}</p>
                {rev.sellerReply ? (
                  <div className="mt-3 rounded-lg bg-[#F9FAF8] p-3 text-xs text-[#374151]">
                    <strong className="text-[#1B5E20]">Your Public Reply:</strong> {rev.sellerReply}
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      value={replyDrafts[rev.id] || ''}
                      onChange={(e) =>
                        setReplyDrafts((prev) => ({ ...prev, [rev.id]: e.target.value }))
                      }
                      placeholder="Write a single public response to this buyer review..."
                      className="flex-1 rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleReplySubmit(rev.id)}
                      className="rounded-lg bg-[#1B5E20] px-4 py-2 text-xs font-semibold text-white hover:bg-[#154A19]"
                    >
                      Post Reply
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </main>
  );
};
