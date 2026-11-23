import React, { useEffect, useState } from 'react';
import {
  APILoadingStatus,
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  InfoWindow,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Lock, MapPin, Navigation } from 'lucide-react';
import { ZAMBIA_CENTER } from '../data/zambia.ts';
import type { LatLng, Listing, UserAccount } from '../types/marketplace.ts';
import {
  formatZMW,
  getPublicListingCoordinates,
  haversineDistanceKm,
} from '../utils/marketplaceRules.ts';
import { ListingImage } from './ListingImage.tsx';

interface ZambiaMapViewProps {
  listings: Listing[];
  sellersById: Record<string, UserAccount>;
  radiusCenter: LatLng | null;
  radiusKm: number | null;
  onSelectListing: (listing: Listing) => void;
  onMessageSeller: (listing: Listing) => void;
}

const RadiusCircleOverlay: React.FC<{ center: LatLng | null; radiusKm: number | null }> = ({
  center,
  radiusKm,
}) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !mapsLib?.Circle || !center || !radiusKm) {
      return;
    }
    const circle = new mapsLib.Circle({
      map,
      center,
      radius: radiusKm * 1000,
      strokeColor: '#1B5E20',
      strokeOpacity: 0.65,
      strokeWeight: 1.5,
      fillColor: '#1B5E20',
      fillOpacity: 0.08,
      clickable: false,
    });
    return () => {
      circle.setMap(null);
    };
  }, [map, mapsLib, center, radiusKm]);

  return null;
};

const CameraAutoFocus: React.FC<{ center: LatLng; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    map.panTo(center);
    map.setZoom(zoom);
  }, [map, center.lat, center.lng, zoom]);

  return null;
};

const ListingMapMarker: React.FC<{
  listing: Listing;
  seller?: UserAccount;
  position: { lat: number; lng: number; isPrecise: boolean };
  distanceKm: number | null;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onInspect: () => void;
  onMessage: () => void;
}> = ({
  listing,
  seller,
  position,
  distanceKm,
  isOpen,
  onOpen,
  onClose,
  onInspect,
  onMessage,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: position.lat, lng: position.lng }}
        onClick={onOpen}
        title={`${listing.title} (${formatZMW(listing.priceZmw)})`}
      >
        <Pin
          background={position.isPrecise ? '#1B5E20' : '#F59E0B'}
          borderColor={position.isPrecise ? '#0F3B13' : '#B45309'}
          glyphColor="#FFFFFF"
        />
      </AdvancedMarker>

      {isOpen && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={280}>
          <div className="w-60 space-y-2 p-1 text-[#111827]">
            <div className="h-28 w-full overflow-hidden rounded-lg bg-[#EEF3EC]">
              <ListingImage
                src={listing.images[0]}
                alt={listing.title}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="text-[11px] font-medium text-[#4B5563]">
              {listing.province}, {listing.district}
              {distanceKm !== null ? ` · ${distanceKm} km away` : ''}
            </div>
            <div className="font-display text-sm font-bold leading-snug">{listing.title}</div>
            <div className="font-mono text-sm font-bold text-[#1B5E20] tabular-nums">
              {formatZMW(listing.priceZmw)}{' '}
              <span className="font-sans text-[11px] font-normal text-[#4B5563]">
                {listing.unitLabel}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-[#4B5563]">
              {position.isPrecise ? (
                <>
                  <MapPin className="h-3 w-3 text-[#1B5E20]" />
                  <span>Precise Farm/Depot Pin · {seller?.businessName || seller?.name}</span>
                </>
              ) : (
                <>
                  <Lock className="h-3 w-3 text-[#D97706]" />
                  <span>General District Area (Privacy Protected)</span>
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={onInspect}
                className="rounded-md bg-[#1B5E20] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#154A19]"
              >
                Inspect
              </button>
              <button
                type="button"
                onClick={onMessage}
                className="rounded-md border border-[#1B5E20] px-2.5 py-1.5 text-xs font-semibold text-[#1B5E20] hover:bg-[#EEF3EC]"
              >
                Message
              </button>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

const MapLoadingGuard: React.FC<{
  children: React.ReactNode;
  fallback: React.ReactNode;
}> = ({ children, fallback }) => {
  const status = useApiLoadingStatus();
  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
};

export const ZambiaMapView: React.FC<ZambiaMapViewProps> = ({
  listings,
  sellersById,
  radiusCenter,
  radiusKm,
  onSelectListing,
  onMessageSeller,
}) => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);

  const mapCenter = radiusCenter || ZAMBIA_CENTER;
  const mapZoom = radiusCenter ? (radiusKm && radiusKm <= 50 ? 10 : radiusKm && radiusKm <= 150 ? 8 : 7) : 6;

  const plottedListings = listings.map((listing) => {
    const seller = sellersById[listing.sellerId];
    const coords = getPublicListingCoordinates(listing, seller);
    const distanceKm = radiusCenter ? haversineDistanceKm(radiusCenter, coords) : null;
    return { listing, seller, coords, distanceKm };
  });

  const directorySidebar = (
    <div className="flex max-h-[540px] flex-col divide-y divide-[#E5E7EB] overflow-y-auto rounded-xl border border-[#E5E7EB] bg-white">
      <div className="bg-[#F9FAF8] px-4 py-3 text-xs font-semibold text-[#111827]">
        {plottedListings.length} Mapped Agricultural {plottedListings.length === 1 ? 'Listing' : 'Listings'}
      </div>
      {plottedListings.length === 0 ? (
        <div className="p-6 text-center text-sm text-[#4B5563]">
          No listings found within this geographic radius. Try increasing the distance or selecting all provinces.
        </div>
      ) : (
        plottedListings.map(({ listing, seller, coords, distanceKm }) => (
          <div key={listing.id} className="p-4 hover:bg-[#F9FAF8]">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-medium text-[#4B5563]">
                  {listing.province}, {listing.district}
                  {distanceKm !== null ? ` · ${distanceKm} km away` : ''}
                </div>
                <h4 className="mt-1 font-display text-sm font-bold text-[#111827]">{listing.title}</h4>
                <div className="mt-1 font-mono text-sm font-bold text-[#1B5E20] tabular-nums">
                  {formatZMW(listing.priceZmw)}{' '}
                  <span className="font-sans text-xs font-normal text-[#4B5563]">{listing.unitLabel}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[#4B5563]">
                  {coords.isPrecise ? (
                    <>
                      <MapPin className="h-3.5 w-3.5 text-[#1B5E20]" />
                      <span>
                        Precise Pin ({coords.lat.toFixed(3)}, {coords.lng.toFixed(3)})
                      </span>
                    </>
                  ) : (
                    <>
                      <Lock className="h-3.5 w-3.5 text-[#D97706]" />
                      <span>General District Privacy Mode · {seller?.businessName || seller?.name}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedListingId(listing.id);
                }}
                className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#111827] hover:border-[#1B5E20]"
              >
                Focus Pin
              </button>
              <button
                type="button"
                onClick={() => onSelectListing(listing)}
                className="rounded-lg bg-[#1B5E20] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#154A19]"
              >
                View Listing
              </button>
              <button
                type="button"
                onClick={() => onMessageSeller(listing)}
                className="rounded-lg border border-[#1B5E20] px-2.5 py-1.5 text-xs font-semibold text-[#1B5E20] hover:bg-[#EEF3EC]"
              >
                Chat
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );

  const mapFallback = (
    <div className="flex h-[540px] flex-col items-center justify-center rounded-xl border border-[#E5E7EB] bg-[#EEF3EC] p-6 text-center">
      <Navigation className="h-10 w-10 text-[#1B5E20]" />
      <h3 className="mt-3 font-display text-lg font-bold text-[#111827]">
        Zambia Interactive Geolocation Directory
      </h3>
      <p className="mt-1 max-w-md text-sm text-[#4B5563]">
        Live distance filtering across all 10 Zambian provinces is active on the list panel. Interactive Google Map tiles require a configured Maps API key.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs text-[#374151]">
        <span className="font-mono">
          Center: {mapCenter.lat.toFixed(4)}, {mapCenter.lng.toFixed(4)}
        </span>
        {radiusKm && <span className="font-mono">· Radius: {radiusKm} km</span>}
      </div>
    </div>
  );

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="lg:col-span-8">
        {apiKey ? (
          <APIProvider apiKey={apiKey} language="en" region="ZM" libraries={['marker']}>
            <MapLoadingGuard fallback={mapFallback}>
              <div className="h-[540px] w-full overflow-hidden rounded-xl border border-[#E5E7EB] bg-[#EEF3EC]">
                <GoogleMap
                  mapId="DEMO_MAP_ID"
                  defaultCenter={mapCenter}
                  defaultZoom={mapZoom}
                  gestureHandling="greedy"
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  style={{ width: '100%', height: '100%' }}
                >
                  <CameraAutoFocus center={mapCenter} zoom={mapZoom} />
                  <RadiusCircleOverlay center={radiusCenter} radiusKm={radiusKm} />

                  {radiusCenter && (
                    <AdvancedMarker position={radiusCenter} title="Your Search Location">
                      <Pin background="#C2410C" borderColor="#7C2D12" glyphColor="#FFFFFF" scale={1.1} />
                    </AdvancedMarker>
                  )}

                  {plottedListings.map(({ listing, seller, coords, distanceKm }) => (
                    <ListingMapMarker
                      key={listing.id}
                      listing={listing}
                      seller={seller}
                      position={coords}
                      distanceKm={distanceKm}
                      isOpen={selectedListingId === listing.id}
                      onOpen={() => setSelectedListingId(listing.id)}
                      onClose={() => setSelectedListingId(null)}
                      onInspect={() => onSelectListing(listing)}
                      onMessage={() => onMessageSeller(listing)}
                    />
                  ))}
                </GoogleMap>
              </div>
            </MapLoadingGuard>
          </APIProvider>
        ) : (
          mapFallback
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[#4B5563]">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-[#1B5E20]" />
              Green Pin: Verified Seller Precise Farm/Depot
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-[#D97706]" />
              Amber Pin: General District Privacy Area
            </span>
          </div>
          {radiusCenter && (
            <span className="font-mono text-[#111827] tabular-nums">
              Search Center: {radiusCenter.lat.toFixed(3)}, {radiusCenter.lng.toFixed(3)}
            </span>
          )}
        </div>
      </div>

      <div className="lg:col-span-4">{directorySidebar}</div>
    </div>
  );
};
