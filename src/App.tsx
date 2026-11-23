import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyRound, MessageSquare } from 'lucide-react';
import { AdminPortal, type DispatchedStaffEmail } from './components/AdminPortal.tsx';
import { AdvertiserDashboard } from './components/AdvertiserDashboard.tsx';
import { AuthModal, type AuthModalMode } from './components/AuthModal.tsx';
import { BuyerPortal } from './components/BuyerPortal.tsx';
import { GeminiChatbotDrawer } from './components/GeminiChatbotDrawer.tsx';
import { HeroSection } from './components/HeroSection.tsx';
import { LandingSections } from './components/LandingSections.tsx';
import { ListingDetailModal } from './components/ListingDetailModal.tsx';
import { MarketplaceDirectory } from './components/MarketplaceDirectory.tsx';
import { MessagingDrawer } from './components/MessagingDrawer.tsx';
import { Navbar, type AppView } from './components/Navbar.tsx';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import { PaymentCheckoutModal } from './components/PaymentCheckoutModal.tsx';
import type {
  AnalyticsStreamEvent,
  ChatConversation,
  ChatMessage,
  EmailNotificationRecord,
  KycSubmission,
  LatLng,
  Listing,
  ListingStatus,
  MarketplaceState,
  PaymentRecord,
  PlatformConfig,
  ScamReason,
  StaffPermission,
  UserAccount,
  VerificationTier,
} from './types/marketplace.ts';
import { filterAndRankListings } from './utils/marketplaceRules.ts';

type ClientMarketplaceState = Omit<MarketplaceState, 'users' | 'emailNotifications'> & {
  users: UserAccount[];
  emailNotifications?: EmailNotificationRecord[];
  adminNeedsSetup?: boolean;
  onlineCount?: number;
};

const FALLBACK_CONFIG: PlatformConfig = {
  platformLaunchedAt: Date.now(),
  defaultTrialDays: 30,
  advertiserMonthlyFeeZmw: 150,
  advertiserPaymentRequired: false,
  buyerFeeEnabled: false,
  buyerFeeAmountZmw: 3,
  buyerTractionMonthsOverride: false,
  dormancyThresholdDays: 60,
  manualMomoNumber: '0976 405 828',
  manualAirtelNumber: '0977 882 310',
};

export default function App() {
  const [state, setState] = useState<ClientMarketplaceState | null>(null);
  const [onlineCount, setOnlineCount] = useState(1);
  // Session token & signed-in user are kept strictly in React memory so passwords are required on every sign-in.
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<AppView>('marketplace');
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  // Filters
  const [query, setQuery] = useState('');
  const [province, setProvince] = useState('All');
  const [district, setDistrict] = useState('All');
  const [category, setCategory] = useState('All');
  const [minVerification, setMinVerification] = useState<VerificationTier | 'all'>('all');
  const [maxPrice, setMaxPrice] = useState('');
  const [videoOnly, setVideoOnly] = useState(false);
  const [radiusCenter, setRadiusCenter] = useState<LatLng | null>(null);
  const [radiusLabel, setRadiusLabel] = useState('');
  const [radiusKm, setRadiusKm] = useState<number | null>(null);

  // Modals & Drawers
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authDefaultTab, setAuthDefaultTab] = useState<AuthModalMode>('login');
  const [paymentModalType, setPaymentModalType] = useState<
    'advertiser_subscription' | 'buyer_account_fee' | null
  >(null);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  const fetchBootstrap = useCallback(
    async (tokenOverride?: string | null) => {
      const token = tokenOverride !== undefined ? tokenOverride : authToken;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/bootstrap', { headers });
      if (res.ok) {
        const data = (await res.json()) as ClientMarketplaceState;
        setState(data);
        if (typeof data.onlineCount === 'number') {
          setOnlineCount(data.onlineCount);
        }
      }
    },
    [authToken]
  );

  const fetchBootstrapRef = useRef(fetchBootstrap);
  fetchBootstrapRef.current = fetchBootstrap;

  useEffect(() => {
    void fetchBootstrap();
  }, [fetchBootstrap]);

  // Google Maps Platform Case A Quota Listener
  useEffect(() => {
    const handler = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  // Real-time SSE Analytics Stream
  useEffect(() => {
    const es = new EventSource('/api/analytics/stream');
    es.addEventListener('connected', (e) => {
      try {
        const parsed = JSON.parse((e as MessageEvent).data) as { onlineCount?: number };
        if (typeof parsed.onlineCount === 'number') setOnlineCount(parsed.onlineCount);
      } catch {
        // ignore parse errors
      }
    });
    es.addEventListener('marketplace', (e) => {
      try {
        const parsed = JSON.parse((e as MessageEvent).data) as {
          event: AnalyticsStreamEvent;
          onlineCount?: number;
        };
        if (typeof parsed.onlineCount === 'number') setOnlineCount(parsed.onlineCount);
        setState((prev) => {
          if (!prev) return prev;
          const already = prev.recentEvents.some((ev) => ev.id === parsed.event.id);
          if (already) return prev;
          return {
            ...prev,
            recentEvents: [parsed.event, ...prev.recentEvents].slice(0, 40),
          };
        });
        if (parsed.event.type === 'config_update') {
          void fetchBootstrapRef.current();
        }
      } catch {
        // ignore
      }
    });
    return () => es.close();
  }, []);

  // Real-time WebSocket In-App Messaging Connection authenticated by signed Bearer token
  useEffect(() => {
    if (!authToken || !currentUserId) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/ws/chat?token=${encodeURIComponent(authToken)}`
    );
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const payload = JSON.parse(String(ev.data)) as {
          type: string;
          conversation?: ChatConversation;
          message?: ChatMessage;
        };
        if (payload.type === 'conversation:created' && payload.conversation) {
          setState((prev) => {
            if (!prev) return prev;
            const exists = prev.conversations.some((c) => c.id === payload.conversation!.id);
            if (exists) return prev;
            return {
              ...prev,
              conversations: [payload.conversation!, ...prev.conversations],
            };
          });
        } else if (payload.type === 'message:created' && payload.message) {
          setState((prev) => {
            if (!prev) return prev;
            const exists = prev.messages.some((m) => m.id === payload.message!.id);
            const nextMessages = exists ? prev.messages : [...prev.messages, payload.message!];
            const nextConvs = payload.conversation
              ? prev.conversations.map((c) =>
                  c.id === payload.conversation!.id ? payload.conversation! : c
                )
              : prev.conversations;
            return {
              ...prev,
              messages: nextMessages,
              conversations: nextConvs,
            };
          });
        }
      } catch {
        // ignore invalid frames
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [authToken, currentUserId]);

  const currentUser = useMemo(() => {
    if (!state || !currentUserId) return null;
    return state.users.find((u) => u.id === currentUserId) || null;
  }, [state, currentUserId]);

  const sellersById = useMemo(() => {
    const record: Record<string, UserAccount> = {};
    if (!state) return record;
    for (const u of state.users) {
      record[u.id] = u;
    }
    return record;
  }, [state]);

  const filteredListings = useMemo(() => {
    if (!state) return [];
    const maxP = maxPrice.trim() ? Number(maxPrice) : null;
    return filterAndRankListings(state.listings, sellersById, state.reviews, {
      query,
      province,
      district,
      category,
      minVerification,
      maxPriceZmw: maxP,
      videoOnly,
      radiusCenter,
      radiusKm,
    });
  }, [
    state,
    sellersById,
    query,
    province,
    district,
    category,
    minVerification,
    maxPrice,
    videoOnly,
    radiusCenter,
    radiusKm,
  ]);

  const selectedListing = useMemo(() => {
    if (!state || !selectedListingId) return null;
    return state.listings.find((l) => l.id === selectedListingId) || null;
  }, [state, selectedListingId]);

  const apiCall = async <T,>(
    url: string,
    method: string,
    body?: unknown,
    tokenOverride?: string | null
  ): Promise<{
    data?: T;
    error?: string;
    requiresBuyerFee?: boolean;
    requiresVerification?: boolean;
    email?: string;
  }> => {
    const token = tokenOverride !== undefined ? tokenOverride : authToken;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as T & {
      error?: string;
      requiresBuyerFee?: boolean;
      requiresVerification?: boolean;
      email?: string;
    };
    if (!res.ok) {
      return {
        error: json.error || 'Request failed.',
        requiresBuyerFee: json.requiresBuyerFee,
        requiresVerification: json.requiresVerification,
        email: json.email,
      };
    }
    return { data: json };
  };

  const applyAuthenticatedSession = async (user: UserAccount, token: string) => {
    setAuthToken(token);
    setCurrentUserId(user.id);
    setAuthModalOpen(false);
    await fetchBootstrap(token);
    if (user.role === 'super_admin' || user.role === 'staff') {
      setActiveView('admin');
    } else if (user.role === 'advertiser') {
      setActiveView('advertiser');
    } else {
      setActiveView('marketplace');
    }
  };

  const handleLogin = async (payload: { identifier: string; password: string }) => {
    const res = await apiCall<{ user: UserAccount; token: string }>(
      '/api/auth/login',
      'POST',
      payload,
      null
    );
    if (res.error || !res.data) {
      return {
        error: res.error || 'Sign in failed.',
        requiresVerification: res.requiresVerification,
        email: res.email,
      };
    }
    await applyAuthenticatedSession(res.data.user, res.data.token);
    return {};
  };

  const handleClaimAdmin = async (password: string) => {
    const res = await apiCall<{ user: UserAccount; token: string }>(
      '/api/auth/claim-admin',
      'POST',
      { password },
      null
    );
    if (res.error || !res.data) return res.error || 'Unable to set Super Admin password.';
    await applyAuthenticatedSession(res.data.user, res.data.token);
    return null;
  };

  const handleRegister = async (payload: {
    name: string;
    username?: string;
    businessName?: string;
    email: string;
    phone: string;
    password: string;
    role: 'buyer' | 'advertiser';
    province: string;
    district: string;
    nrcNumber?: string;
    momoAccountName?: string;
  }) => {
    const res = await apiCall<{
      requiresVerification: boolean;
      email: string;
      username: string;
      deliveryMode: string;
      previewVerificationCode?: string;
      message: string;
    }>('/api/auth/register', 'POST', payload, null);
    if (res.error || !res.data) return { error: res.error || 'Registration failed.' };
    await fetchBootstrap();
    return {
      email: res.data.email,
      username: res.data.username,
      previewVerificationCode: res.data.previewVerificationCode,
      deliveryMode: res.data.deliveryMode,
      message: res.data.message,
    };
  };

  const handleVerifyEmail = async (payload: { identifier: string; code: string }) => {
    const res = await apiCall<{
      verified: boolean;
      email?: string;
      username?: string;
      message?: string;
    }>('/api/auth/verify-email', 'POST', payload, null);
    if (res.error || !res.data) return { error: res.error || 'Verification failed.' };
    return {
      email: res.data.email,
      username: res.data.username,
      message: res.data.message,
    };
  };

  const handleResendVerification = async (identifier: string) => {
    const res = await apiCall<{
      sent?: boolean;
      alreadyVerified?: boolean;
      previewVerificationCode?: string;
      message?: string;
    }>('/api/auth/resend-verification', 'POST', { identifier }, null);
    if (res.error || !res.data) return { error: res.error || 'Could not resend verification code.' };
    return {
      previewVerificationCode: res.data.previewVerificationCode,
      message: res.data.message,
    };
  };

  const handleChangePassword = async (payload: {
    currentPassword: string;
    newPassword: string;
  }) => {
    const res = await apiCall<{ user: UserAccount; message: string }>(
      '/api/auth/change-password',
      'POST',
      payload
    );
    if (res.error) return res.error;
    await fetchBootstrap();
    return null;
  };

  const handleLogout = () => {
    setAuthToken(null);
    setCurrentUserId(null);
    setMessagesOpen(false);
    setActiveView('marketplace');
    void fetchBootstrap(null);
  };

  const handleToggleSave = async (listingId: string) => {
    if (!currentUser) {
      setAuthDefaultTab('login');
      setAuthModalOpen(true);
      return;
    }
    const res = await apiCall<{ savedListingIds: string[] }>(
      `/api/listings/${listingId}/toggle-save`,
      'POST'
    );
    if (res.data) {
      await fetchBootstrap();
    }
  };

  const handleMessageSeller = async (listing: Listing) => {
    if (!currentUser) {
      setAuthDefaultTab('login');
      setAuthModalOpen(true);
      return;
    }
    if (currentUser.id === listing.sellerId) {
      setMessagesOpen(true);
      return;
    }
    const res = await apiCall<{ conversation: ChatConversation; messages: ChatMessage[] }>(
      '/api/chat/conversations',
      'POST',
      { sellerId: listing.sellerId, listingId: listing.id }
    );
    if (res.data) {
      await fetchBootstrap();
      setActiveConversationId(res.data.conversation.id);
      setMessagesOpen(true);
    }
  };

  const handleTrackEvent = async (
    listingId: string,
    type: 'view' | 'video_play' | 'contact_reveal'
  ) => {
    const res = await apiCall<{
      listing: Listing;
      sellerContact?: { phone: string; whatsapp: string; name: string };
    }>('/api/analytics/event', 'POST', { listingId, type });
    if (res.error) {
      return { error: res.error, requiresBuyerFee: res.requiresBuyerFee };
    }
    await fetchBootstrap();
    return { sellerContact: res.data?.sellerContact };
  };

  const handleResetFilters = () => {
    setQuery('');
    setProvince('All');
    setDistrict('All');
    setCategory('All');
    setMinVerification('all');
    setMaxPrice('');
    setVideoOnly(false);
    setRadiusCenter(null);
    setRadiusLabel('');
    setRadiusKm(null);
  };

  const config = state?.config || FALLBACK_CONFIG;
  const hasSeededData = Boolean(
    state?.users.some((u) => /^usr-(adv|buy|staff)-\d+$/.test(u.id)) ||
      state?.listings.some((l) => /^lst-\d+$/.test(l.id))
  );

  return (
    <div className="min-h-screen bg-[#F9FAF8] text-[#111827]">
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      <Navbar
        currentUser={currentUser}
        config={config}
        activeView={activeView}
        onNavigateView={setActiveView}
        onOpenAuth={(tab) => {
          setAuthDefaultTab(tab);
          setAuthModalOpen(true);
        }}
        onOpenChangePassword={() => {
          setAuthDefaultTab('change_password');
          setAuthModalOpen(true);
        }}
        onLogout={handleLogout}
      />

      {currentUser?.mustChangePassword && activeView !== 'admin' && (
        <div className="border-b border-[#F59E0B] bg-[#FFFBEB] px-4 py-2.5 text-xs text-[#78350F]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <KeyRound className="h-4 w-4 text-[#B45309]" />
              You signed in with a temporary password. Change it immediately to secure your account.
            </span>
            <button
              type="button"
              onClick={() => {
                setAuthDefaultTab('change_password');
                setAuthModalOpen(true);
              }}
              className="rounded-md bg-[#1B5E20] px-3 py-1 font-semibold text-white hover:bg-[#154A19]"
            >
              Change Password Now
            </button>
          </div>
        </div>
      )}

      {!state ? (
        <div className="mx-auto max-w-7xl px-4 py-24 text-center text-sm text-[#4B5563]">
          Loading AgriLink ZM marketplace across all 10 Zambian provinces...
        </div>
      ) : activeView === 'advertiser' && currentUser ? (
        <AdvertiserDashboard
          currentUser={currentUser}
          config={config}
          listings={state.listings}
          reviews={state.reviews}
          kycSubmissions={state.kycSubmissions}
          conversations={state.conversations}
          recentEvents={state.recentEvents}
          onCreateListing={async (payload) => {
            const res = await apiCall('/api/listings', 'POST', payload);
            if (!res.error) await fetchBootstrap();
            return res.error || null;
          }}
          onUpdateListing={async (listingId, updates) => {
            const res = await apiCall(`/api/listings/${listingId}`, 'PATCH', updates);
            if (!res.error) await fetchBootstrap();
            return res.error || null;
          }}
          onDeleteListing={async (listingId) => {
            const res = await apiCall(`/api/listings/${listingId}`, 'DELETE');
            if (!res.error) await fetchBootstrap();
            return res.error || null;
          }}
          onSubmitKyc={async (payload) => {
            const res = await apiCall('/api/kyc', 'POST', payload);
            if (!res.error) await fetchBootstrap();
            return res.error || null;
          }}
          onReplyReview={async (reviewId, reply) => {
            const res = await apiCall(`/api/reviews/${reviewId}/reply`, 'POST', { reply });
            if (!res.error) await fetchBootstrap();
            return res.error || null;
          }}
          onOpenPayment={() => setPaymentModalType('advertiser_subscription')}
          onOpenMessages={() => setMessagesOpen(true)}
        />
      ) : activeView === 'buyer' && currentUser ? (
        <BuyerPortal
          currentUser={currentUser}
          config={config}
          listings={state.listings}
          sellersById={sellersById}
          contactReveals={state.contactReveals}
          scamReports={state.scamReports}
          conversations={state.conversations}
          onInspectListing={(l) => setSelectedListingId(l.id)}
          onToggleSave={handleToggleSave}
          onOpenPayment={() => setPaymentModalType('buyer_account_fee')}
          onOpenMessages={() => setMessagesOpen(true)}
          onBrowseMarketplace={() => setActiveView('marketplace')}
        />
      ) : activeView === 'admin' &&
        currentUser &&
        (currentUser.role === 'super_admin' || currentUser.role === 'staff') ? (
        <AdminPortal
          currentUser={currentUser}
          config={config}
          users={state.users}
          listings={state.listings}
          payments={state.payments}
          kycSubmissions={state.kycSubmissions}
          scamReports={state.scamReports}
          blacklist={state.blacklist}
          conversations={state.conversations}
          messages={state.messages}
          recentEvents={state.recentEvents}
          emailNotifications={state.emailNotifications || []}
          onlineCount={onlineCount}
          onUpdateConfig={async (updates) => {
            const res = await apiCall('/api/admin/config', 'PATCH', updates);
            if (!res.error) await fetchBootstrap();
            return res.error || null;
          }}
          onPaymentDecision={async (paymentId, decision) => {
            const res = await apiCall(`/api/admin/payments/${paymentId}/decision`, 'POST', {
              decision,
            });
            if (!res.error) await fetchBootstrap();
            return res.error || null;
          }}
          onKycDecision={async (kycId, decision) => {
            const res = await apiCall(`/api/admin/kyc/${kycId}/decision`, 'POST', { decision });
            if (!res.error) await fetchBootstrap();
            return res.error || null;
          }}
          onScamDecision={async (reportId, action) => {
            const res = await apiCall(`/api/admin/scam-reports/${reportId}/decision`, 'POST', {
              action,
            });
            if (!res.error) await fetchBootstrap();
            return res.error || null;
          }}
          onDormancyScan={async (deactivateFlagged) => {
            const res = await apiCall<{ flaggedCount: number }>('/api/admin/dormancy-scan', 'POST', {
              deactivateFlagged,
            });
            if (!res.error) await fetchBootstrap();
            return { flaggedCount: res.data?.flaggedCount, error: res.error };
          }}
          onUpdateUserStatus={async (userId, accountStatus) => {
            const res = await apiCall(`/api/admin/users/${userId}/status`, 'PATCH', {
              accountStatus,
            });
            if (!res.error) await fetchBootstrap();
            return res.error || null;
          }}
          onUpdateUser={async (userId, updates) => {
            const res = await apiCall(`/api/admin/users/${userId}`, 'PATCH', updates);
            if (!res.error) await fetchBootstrap();
            return res.error || null;
          }}
          onDeleteUser={async (userId) => {
            const res = await apiCall(`/api/admin/users/${userId}`, 'DELETE');
            if (!res.error) await fetchBootstrap();
            return res.error || null;
          }}
          onUpdateListingStatus={async (listingId, status) => {
            const res = await apiCall(`/api/listings/${listingId}`, 'PATCH', { status });
            if (!res.error) await fetchBootstrap();
            return res.error || null;
          }}
          onDeleteListing={async (listingId) => {
            const res = await apiCall(`/api/listings/${listingId}`, 'DELETE');
            if (!res.error) await fetchBootstrap();
            return res.error || null;
          }}
          onCreateStaff={async (payload) => {
            const res = await apiCall<{
              staff: UserAccount;
              dispatchedEmail: DispatchedStaffEmail;
            }>('/api/admin/staff', 'POST', payload);
            if (!res.error) await fetchBootstrap();
            return {
              error: res.error,
              staff: res.data?.staff,
              dispatchedEmail: res.data?.dispatchedEmail || null,
            };
          }}
          onUpdateStaffPermissions={async (staffId, permissions: StaffPermission[]) => {
            const res = await apiCall(`/api/admin/staff/${staffId}/permissions`, 'PATCH', {
              permissions,
            });
            if (!res.error) await fetchBootstrap();
            return res.error || null;
          }}
          onSendBillingReminder={async (userId, channel) => {
            const res = await apiCall('/api/admin/billing-reminder', 'POST', { userId, channel });
            return res.error || null;
          }}
          onChangePassword={handleChangePassword}
          hasSeededData={hasSeededData}
          onClearDemoData={async () => {
            const res = await apiCall<{ remainingUsers?: number; remainingListings?: number }>(
              '/api/admin/clear-demo-data',
              'POST'
            );
            if (!res.error) await fetchBootstrap();
            return {
              error: res.error,
              remainingUsers: res.data?.remainingUsers,
              remainingListings: res.data?.remainingListings,
            };
          }}
        />
      ) : (
        <>
          <HeroSection
            query={query}
            province={province}
            category={category}
            config={config}
            activeListingsCount={filteredListings.length}
            onQueryChange={setQuery}
            onProvinceChange={(val) => {
              setProvince(val);
              setDistrict('All');
            }}
            onCategoryChange={setCategory}
            onSearchSubmit={() => {
              document.getElementById('marketplace-directory')?.scrollIntoView({ behavior: 'smooth' });
            }}
            onStartTrial={() => {
              setAuthDefaultTab('register_advertiser');
              setAuthModalOpen(true);
            }}
          />

          <MarketplaceDirectory
            listings={filteredListings}
            sellersById={sellersById}
            reviews={state.reviews}
            currentUser={currentUser}
            query={query}
            province={province}
            district={district}
            category={category}
            minVerification={minVerification}
            maxPrice={maxPrice}
            videoOnly={videoOnly}
            radiusCenter={radiusCenter}
            radiusLabel={radiusLabel}
            radiusKm={radiusKm}
            onProvinceChange={setProvince}
            onDistrictChange={setDistrict}
            onCategoryChange={setCategory}
            onMinVerificationChange={setMinVerification}
            onMaxPriceChange={setMaxPrice}
            onVideoOnlyChange={setVideoOnly}
            onRadiusChange={(center, label, km) => {
              setRadiusCenter(center);
              setRadiusLabel(label);
              setRadiusKm(km);
            }}
            onResetFilters={handleResetFilters}
            onSelectListing={(l) => setSelectedListingId(l.id)}
            onMessageSeller={handleMessageSeller}
            onToggleSave={handleToggleSave}
          />

          <LandingSections
            config={config}
            onStartAdvertiserTrial={() => {
              setAuthDefaultTab('register_advertiser');
              setAuthModalOpen(true);
            }}
            onRegisterBuyer={() => {
              setAuthDefaultTab('register_buyer');
              setAuthModalOpen(true);
            }}
            onSelectProvince={(prov) => {
              setProvince(prov);
              setDistrict('All');
              document.getElementById('marketplace-directory')?.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        </>
      )}

      {/* Docked Gemini Multi-Turn AI Assistant */}
      <GeminiChatbotDrawer />

      {/* Quick In-App Messages Dock Button for Buyers & Advertisers */}
      {currentUser &&
        state &&
        (currentUser.role === 'buyer' || currentUser.role === 'advertiser') && (
          <button
            type="button"
            onClick={() => setMessagesOpen(true)}
            className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-lg border border-[#1B5E20] bg-[#1B5E20] px-4 py-2.5 text-xs font-semibold text-white shadow-lg transition-colors hover:bg-[#154A19]"
          >
            <MessageSquare className="h-4 w-4" />
            <span>
              Messages (
              {
                state.conversations.filter(
                  (c) => c.buyerId === currentUser.id || c.sellerId === currentUser.id
                ).length
              }
              )
            </span>
          </button>
        )}

      {/* Modals */}
      {selectedListing && state && (
        <ListingDetailModal
          listing={selectedListing}
          seller={sellersById[selectedListing.sellerId]}
          reviews={state.reviews}
          contactReveals={state.contactReveals}
          currentUser={currentUser}
          config={config}
          onClose={() => setSelectedListingId(null)}
          onRequireAuth={() => {
            setAuthDefaultTab('login');
            setAuthModalOpen(true);
          }}
          onMessageSeller={handleMessageSeller}
          onTrackEvent={handleTrackEvent}
          onOpenBuyerFeeCheckout={() => setPaymentModalType('buyer_account_fee')}
          onSubmitReview={async (payload) => {
            const res = await apiCall('/api/reviews', 'POST', payload);
            if (!res.error) await fetchBootstrap();
            return res.error || null;
          }}
          onSubmitScamReport={async (payload: {
            listingId: string;
            reason: ScamReason;
            details: string;
            evidenceDataUrl?: string;
          }) => {
            const res = await apiCall<{ autoFrozen?: boolean }>('/api/scam-reports', 'POST', payload);
            if (!res.error) await fetchBootstrap();
            return { autoFrozen: res.data?.autoFrozen, error: res.error };
          }}
        />
      )}

      <AuthModal
        isOpen={authModalOpen}
        defaultTab={authDefaultTab}
        defaultTrialDays={config.defaultTrialDays}
        advertiserPaymentRequired={config.advertiserPaymentRequired}
        adminNeedsSetup={Boolean(state?.adminNeedsSetup)}
        currentUser={currentUser}
        onClose={() => setAuthModalOpen(false)}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onVerifyEmail={handleVerifyEmail}
        onResendVerification={handleResendVerification}
        onClaimAdmin={handleClaimAdmin}
        onChangePassword={handleChangePassword}
      />

      {currentUser && paymentModalType && (
        <PaymentCheckoutModal
          isOpen={Boolean(paymentModalType)}
          paymentType={paymentModalType}
          currentUser={currentUser}
          config={config}
          onClose={() => setPaymentModalType(null)}
          onSubmitManualPop={async (payload: {
            paymentType: 'advertiser_subscription' | 'buyer_account_fee';
            network: PaymentRecord['network'];
            transactionId: string;
            proofImageUrl?: string;
          }) => {
            const res = await apiCall('/api/payments/pop', 'POST', payload);
            if (!res.error) await fetchBootstrap();
            return res.error || null;
          }}
          onSubmitFlutterwaveUssd={async (payload: {
            paymentType: 'advertiser_subscription' | 'buyer_account_fee';
            network: PaymentRecord['network'];
            momoPhone: string;
          }) => {
            const res = await apiCall('/api/payments/flutterwave-ussd', 'POST', payload);
            if (!res.error) await fetchBootstrap();
            return res.error || null;
          }}
        />
      )}

      {currentUser && state && (
        <MessagingDrawer
          isOpen={messagesOpen}
          currentUser={currentUser}
          conversations={state.conversations}
          messages={state.messages}
          activeConversationId={activeConversationId}
          onSelectConversation={setActiveConversationId}
          onClose={() => setMessagesOpen(false)}
          onSendMessage={async (payload) => {
            const res = await apiCall('/api/chat/messages', 'POST', payload);
            if (!res.error) await fetchBootstrap();
            return res.error || null;
          }}
          onWhatsAppHandoff={async (convId) => {
            const res = await apiCall<{ whatsappUrl?: string }>(
              `/api/chat/conversations/${convId}/whatsapp-handoff`,
              'POST'
            );
            if (!res.error) await fetchBootstrap();
            return {
              whatsappUrl: res.data?.whatsappUrl,
              error: res.error,
              requiresBuyerFee: res.requiresBuyerFee,
            };
          }}
          onOpenBuyerFeeCheckout={() => setPaymentModalType('buyer_account_fee')}
        />
      )}

      <OfflineIndicator />
    </div>
  );
}
