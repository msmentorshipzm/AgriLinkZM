import React, { useState } from 'react';
import { Bookmark, LayoutGrid, Map as MapIcon, MapPin, Navigation, Play, ShieldCheck, Star } from 'lucide-react';
import {
  DISTRICT_COORDINATES,
  PRODUCT_CATEGORIES,
  PROVINCE_NAMES,
  VERIFICATION_LABELS,
  ZAMBIA_PROVINCES,
} from '../data/zambia.ts';
import type { LatLng, Listing, Review, UserAccount, VerificationTier } from '../types/marketplace.ts';
import {
  computeSellerAggregateRating,
  formatZMW,
  getPublicListingCoordinates,
  haversineDistanceKm,
} from '../utils/marketplaceRules.ts';
import { ListingImage } from './ListingImage.tsx';
import { ZambiaMapView } from './ZambiaMapView.tsx';

interface MarketplaceDirectoryProps {
  listings: Listing[];
  sellersById: Record<string, UserAccount>;
  reviews: Review[];
  currentUser: UserAccount | null;
  query: string;
  province: string;
  district: string;
  category: string;
  minVerification: VerificationTier | 'all';
  maxPrice: string;
  videoOnly: boolean;
  radiusCenter: LatLng | null;
  radiusLabel: string;
  radiusKm: number | null;
  onProvinceChange: (val: string) => void;
  onDistrictChange: (val: string) => void;
  onCategoryChange: (val: string) => void;
  onMinVerificationChange: (val: VerificationTier | 'all') => void;
  onMaxPriceChange: (val: string) => void;
  onVideoOnlyChange: (val: boolean) => void;
  onRadiusChange: (center: LatLng | null, label: string, km: number | null) => void;
  onResetFilters: () => void;
  onSelectListing: (listing: Listing) => void;
  onMessageSeller: (listing: Listing) => void;
  onToggleSave: (listingId: string) => void;
}

export const MarketplaceDirectory: React.FC<MarketplaceDirectoryProps> = ({
  listings,
  sellersById,
  reviews,
  currentUser,
  province,
  district,
  category,
  minVerification,
  maxPrice,
  videoOnly,
  radiusCenter,
  radiusLabel,
  radiusKm,
  onProvinceChange,
  onDistrictChange,
  onCategoryChange,
  onMinVerificationChange,
  onMaxPriceChange,
  onVideoOnlyChange,
  onRadiusChange,
  onResetFilters,
  onSelectListing,
  onMessageSeller,
  onToggleSave,
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [selectedRefDistrict, setSelectedRefDistrict] = useState<string>('Lusaka');

  const districts = province !== 'All' && ZAMBIA_PROVINCES[province] ? ZAMBIA_PROVINCES[province] : [];
  const allDistrictNames = Object.keys(DISTRICT_COORDINATES).sort();

  const handleUseMyLocation = () => {
    setGeoStatus(null);
    if (!navigator.geolocation) {
      setGeoStatus('Browser geolocation unavailable. Select a Zambian reference district instead.');
      return;
    }
    setGeoStatus('Requesting your GPS location...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onRadiusChange(coords, 'My GPS Location', radiusKm || 100);
        setGeoStatus(`GPS locked (${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}).`);
      },
      () => {
        setGeoStatus('GPS permission denied. Choose a district center below to filter by radius.');
      },
      { timeout: 8000 }
    );
  };

  const handleDistrictCenterChange = (distName: string) => {
    setSelectedRefDistrict(distName);
    const coords = DISTRICT_COORDINATES[distName];
    if (coords) {
      onRadiusChange(coords, `${distName} District`, radiusKm || 100);
      setGeoStatus(`Searching within ${radiusKm || 100} km of ${distName}.`);
    }
  };

  return (
    <section id="marketplace-directory" className="scroll-mt-20 mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 border-b border-[#E5E7EB] pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-[#111827] sm:text-3xl">
            Live Agricultural Marketplace
          </h2>
          <p className="mt-1 text-sm text-[#4B5563]">
            Browse verified sellers by province, district, or geolocation radius across Zambia.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-[#4B5563] tabular-nums">
            {listings.length} active {listings.length === 1 ? 'listing' : 'listings'}
          </span>
          <div className="flex items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white p-1">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === 'grid'
                  ? 'bg-[#1B5E20] text-white'
                  : 'text-[#4B5563] hover:text-[#111827]'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Grid View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('map')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === 'map'
                  ? 'bg-[#1B5E20] text-white'
                  : 'text-[#4B5563] hover:text-[#111827]'
              }`}
            >
              <MapIcon className="h-3.5 w-3.5" />
              Zambia Map View
            </button>
          </div>
        </div>
      </div>

      {/* Category Segmented Filter Bar */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onCategoryChange('All')}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
            category === 'All'
              ? 'bg-[#1B5E20] text-white'
              : 'border border-[#E5E7EB] bg-white text-[#4B5563] hover:border-[#1B5E20] hover:text-[#111827]'
          }`}
        >
          All Categories
        </button>
        {PRODUCT_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => onCategoryChange(cat)}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              category === cat
                ? 'bg-[#1B5E20] text-white'
                : 'border border-[#E5E7EB] bg-white text-[#4B5563] hover:border-[#1B5E20] hover:text-[#111827]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Location, Verification & Price Controls */}
      <div className="mt-4 space-y-3 rounded-xl border border-[#E5E7EB] bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label htmlFor="dir-province" className="block text-xs font-medium text-[#4B5563]">
              Province
            </label>
            <select
              id="dir-province"
              value={province}
              onChange={(e) => {
                onProvinceChange(e.target.value);
                onDistrictChange('All');
              }}
              className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm text-[#111827] focus:border-[#1B5E20] focus:outline-none"
            >
              <option value="All">All Provinces</option>
              {PROVINCE_NAMES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="dir-district" className="block text-xs font-medium text-[#4B5563]">
              District
            </label>
            <select
              id="dir-district"
              value={district}
              disabled={districts.length === 0}
              onChange={(e) => onDistrictChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm text-[#111827] disabled:opacity-50 focus:border-[#1B5E20] focus:outline-none"
            >
              <option value="All">{districts.length ? 'All Districts' : 'Select province first'}</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="dir-tier" className="block text-xs font-medium text-[#4B5563]">
              Seller Verification
            </label>
            <select
              id="dir-tier"
              value={minVerification}
              onChange={(e) => onMinVerificationChange(e.target.value as VerificationTier | 'all')}
              className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm text-[#111827] focus:border-[#1B5E20] focus:outline-none"
            >
              <option value="all">Any Verification</option>
              <option value="tier1_id">Tier 1: ID Verified+</option>
              <option value="tier2_business">Tier 2: Verified Business+</option>
              <option value="tier3_site">Tier 3: Site-Verified Only</option>
            </select>
          </div>

          <div>
            <label htmlFor="dir-max-price" className="block text-xs font-medium text-[#4B5563]">
              Max Price (ZMW)
            </label>
            <input
              id="dir-max-price"
              type="number"
              min="0"
              value={maxPrice}
              onChange={(e) => onMaxPriceChange(e.target.value)}
              placeholder="e.g. 1500"
              className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-2 text-sm text-[#111827] tabular-nums focus:border-[#1B5E20] focus:outline-none"
            />
          </div>

          <div className="flex items-end justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 py-2 text-sm font-medium text-[#111827]">
              <input
                type="checkbox"
                checked={videoOnly}
                onChange={(e) => onVideoOnlyChange(e.target.checked)}
                className="h-4 w-4 rounded border-[#E5E7EB] accent-[#1B5E20]"
              />
              <span>Video Verified</span>
            </label>
            <button
              type="button"
              onClick={() => {
                setGeoStatus(null);
                onResetFilters();
              }}
              className="rounded-lg px-2.5 py-2 text-xs font-semibold text-[#C2410C] hover:bg-[#FFF7ED] whitespace-nowrap"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Geolocation Radius Search Row */}
        <div className="flex flex-wrap items-end gap-3 border-t border-[#E5E7EB] pt-3">
          <div>
            <button
              type="button"
              onClick={handleUseMyLocation}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#1B5E20] bg-[#EEF3EC] px-3 py-2 text-xs font-semibold text-[#1B5E20] hover:bg-[#1B5E20] hover:text-white transition-colors"
            >
              <Navigation className="h-3.5 w-3.5" />
              Use My Current Location
            </button>
          </div>

          <div className="min-w-[180px]">
            <label htmlFor="radius-district-center" className="block text-xs font-medium text-[#4B5563]">
              Or Search Near District
            </label>
            <select
              id="radius-district-center"
              value={selectedRefDistrict}
              onChange={(e) => handleDistrictCenterChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-1.5 text-xs text-[#111827]"
            >
              {allDistrictNames.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[140px]">
            <label htmlFor="radius-km-select" className="block text-xs font-medium text-[#4B5563]">
              Radius Distance
            </label>
            <select
              id="radius-km-select"
              value={radiusKm ?? ''}
              onChange={(e) => {
                const km = e.target.value ? Number(e.target.value) : null;
                if (!km) {
                  onRadiusChange(null, '', null);
                } else {
                  const center =
                    radiusCenter || DISTRICT_COORDINATES[selectedRefDistrict] || DISTRICT_COORDINATES.Lusaka;
                  const label = radiusCenter ? radiusLabel : `${selectedRefDistrict} District`;
                  onRadiusChange(center, label, km);
                }
              }}
              className="mt-1 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3 py-1.5 text-xs text-[#111827]"
            >
              <option value="">Any Distance</option>
              <option value="25">Within 25 km</option>
              <option value="50">Within 50 km</option>
              <option value="100">Within 100 km</option>
              <option value="250">Within 250 km</option>
              <option value="500">Within 500 km</option>
            </select>
          </div>

          {radiusCenter && radiusKm && (
            <div className="flex items-center gap-2 py-1.5 text-xs font-medium text-[#1B5E20]">
              <span>
                Active: Within {radiusKm} km of {radiusLabel}
              </span>
              <button
                type="button"
                onClick={() => {
                  setGeoStatus(null);
                  onRadiusChange(null, '', null);
                }}
                className="text-[#C2410C] underline"
              >
                Clear
              </button>
            </div>
          )}

          {geoStatus && <span className="py-1.5 text-xs text-[#4B5563]">{geoStatus}</span>}
        </div>
      </div>

      {/* View Switch: Interactive Map OR Listings Grid */}
      {viewMode === 'map' ? (
        <ZambiaMapView
          listings={listings}
          sellersById={sellersById}
          radiusCenter={radiusCenter}
          radiusKm={radiusKm}
          onSelectListing={onSelectListing}
          onMessageSeller={onMessageSeller}
        />
      ) : listings.length === 0 ? (
        <div className="mt-8 rounded-xl border border-[#E5E7EB] bg-white p-12 text-center">
          <h3 className="font-display text-lg font-bold text-[#111827]">
            No agricultural listings match those filters
          </h3>
          <p className="mt-2 text-sm text-[#4B5563]">
            Try expanding your search radius, clearing your district filter, or removing the price cap.
          </p>
          <button
            type="button"
            onClick={() => {
              setGeoStatus(null);
              onResetFilters();
            }}
            className="mt-5 rounded-lg bg-[#1B5E20] px-4 py-2 text-sm font-semibold text-white hover:bg-[#154A19]"
          >
            Show All Active Listings
          </button>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => {
            const seller = sellersById[listing.sellerId];
            const rating = computeSellerAggregateRating(reviews, listing.sellerId);
            const isSaved = currentUser?.savedListingIds.includes(listing.id) ?? false;
            const verificationLabel = seller
              ? VERIFICATION_LABELS[seller.verificationTier] || 'Pending'
              : 'Verified';
            const publicCoords = getPublicListingCoordinates(listing, seller);
            const distanceKm = radiusCenter
              ? haversineDistanceKm(radiusCenter, publicCoords)
              : null;

            return (
              <article
                key={listing.id}
                className="group flex flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-white transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#EEF3EC]">
                  <ListingImage
                    src={listing.images[0]}
                    alt={listing.title}
                    fallbackLabel={listing.title}
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                  />
                  {listing.hasVideoWalkthrough && (
                    <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md bg-black/75 px-2.5 py-1 text-xs font-medium text-white">
                      <Play className="h-3.5 w-3.5 fill-current text-[#F59E0B]" />
                      <span>Video Walkthrough</span>
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label={isSaved ? `Remove ${listing.title} from saved` : `Save ${listing.title}`}
                    onClick={() => onToggleSave(listing.id)}
                    className={`absolute right-3 top-3 rounded-lg p-2 transition-colors ${
                      isSaved
                        ? 'bg-[#1B5E20] text-white'
                        : 'bg-white/90 text-[#111827] hover:bg-white'
                    }`}
                  >
                    <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />
                  </button>
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-[#4B5563]">
                    <span>{listing.category}</span>
                    <span aria-hidden="true">·</span>
                    <MapPin className="h-3.5 w-3.5 text-[#C2410C]" />
                    <span>
                      {listing.province}, {listing.district}
                    </span>
                    {distanceKm !== null && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-[#1B5E20] tabular-nums">{distanceKm} km</span>
                      </>
                    )}
                  </div>

                  <h3 className="mt-2 font-display text-base font-bold leading-snug text-[#111827]">
                    {listing.title}
                  </h3>

                  <div className="mt-3 flex items-baseline justify-between gap-2">
                    <div>
                      <span className="font-mono text-lg font-bold text-[#1B5E20] tabular-nums">
                        {formatZMW(listing.priceZmw)}
                      </span>
                      <span className="ml-1.5 text-xs text-[#4B5563]">{listing.unitLabel}</span>
                    </div>
                    <span className="text-xs font-medium text-[#4B5563] tabular-nums">
                      {listing.quantityAvailable}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#E5E7EB] pt-3.5 text-xs">
                    <div className="flex min-w-0 items-center gap-1.5 font-medium text-[#111827]">
                      <ShieldCheck
                        className={`h-4 w-4 shrink-0 ${
                          seller?.verificationTier === 'tier3_site'
                            ? 'text-[#1B5E20]'
                            : seller?.verificationTier === 'tier2_business'
                            ? 'text-[#F59E0B]'
                            : 'text-[#4B5563]'
                        }`}
                      />
                      <span className="truncate">
                        {verificationLabel} · {publicCoords.isPrecise ? 'Precise Pin' : 'District Area'}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 text-[#4B5563] tabular-nums">
                      <Star className="h-3.5 w-3.5 fill-[#F59E0B] text-[#F59E0B]" />
                      <span className="font-semibold text-[#111827]">
                        {rating.reviewCount > 0 ? rating.averageRating.toFixed(1) : 'New'}
                      </span>
                      {rating.reviewCount > 0 && <span>({rating.reviewCount})</span>}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectListing(listing)}
                      className="rounded-lg bg-[#1B5E20] px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#154A19]"
                    >
                      Inspect &amp; Contact
                    </button>
                    <button
                      type="button"
                      onClick={() => onMessageSeller(listing)}
                      className="rounded-lg border border-[#1B5E20] px-3 py-2.5 text-xs font-semibold text-[#1B5E20] transition-colors hover:bg-[#EEF3EC]"
                    >
                      Message In-App
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
