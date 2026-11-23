export type UserRole = 'advertiser' | 'buyer' | 'staff' | 'super_admin';

export type StaffPermission =
  | 'verify_payments'
  | 'verify_kyc'
  | 'billing_followup'
  | 'moderate_trust';

export type VerificationTier =
  | 'unverified'
  | 'tier1_id'
  | 'tier2_business'
  | 'tier3_site';

export type AccountStatus =
  | 'trial_active'
  | 'active_paid'
  | 'payment_required'
  | 'under_investigation'
  | 'frozen'
  | 'dormant'
  | 'suspended'
  | 'banned';

export type ListingStatus =
  | 'active'
  | 'pending_moderation'
  | 'under_investigation'
  | 'paused_payment'
  | 'sold_out'
  | 'archived';

export type LocationPrivacyMode = 'district_general' | 'precise_pin';

export interface LatLng {
  lat: number;
  lng: number;
}

export type ProductCategory =
  | 'Crops & Grains'
  | 'Horticulture'
  | 'Livestock'
  | 'Poultry'
  | 'Fisheries & Aquaculture'
  | 'Agro-Inputs'
  | 'Farm Equipment';

export type ScamReason =
  | 'Requested upfront deposit before delivery'
  | 'Fake or stolen photos'
  | 'Non-existent produce'
  | 'Misleading location or price';

export interface UserAccount {
  id: string;
  systemId?: string;
  adminNote?: string;
  name: string;
  username?: string;
  delegatedRoleTitle?: string;
  businessName?: string;
  email: string;
  phone: string;
  whatsapp?: string;
  role: UserRole;
  staffPermissions: StaffPermission[];
  province: string;
  district: string;
  verificationTier: VerificationTier;
  nrcNumber?: string;
  momoAccountName?: string;
  pacraNumber?: string;
  zraTpin?: string;
  siteGpsPin?: string;
  defaultLocationPrivacy?: LocationPrivacyMode;
  farmCoordinates?: LatLng;
  accountStatus: AccountStatus;
  emailVerified?: boolean;
  mustChangePassword?: boolean;
  trialStartAt: number;
  trialDaysAllocated: number;
  paidUntilAt?: number;
  buyerFeePaidUntilAt?: number;
  lastActiveAt: number;
  createdAt: number;
  savedListingIds: string[];
}

export interface ServerUserAccount extends UserAccount {
  passwordHash?: string;
  verificationCodeHash?: string;
  verificationExpiresAt?: number;
}

export interface Listing {
  id: string;
  sellerId: string;
  title: string;
  category: ProductCategory;
  description: string;
  priceZmw: number;
  unitLabel: string;
  quantityAvailable: string;
  province: string;
  district: string;
  coordinates?: LatLng;
  locationPrivacy: LocationPrivacyMode;
  images: string[];
  hasVideoWalkthrough: boolean;
  videoUrl?: string;
  videoDurationSec?: number;
  status: ListingStatus;
  impressions: number;
  views: number;
  uniqueVisitors: number;
  videoPlays: number;
  contactReveals: number;
  createdAt: number;
  updatedAt: number;
}

export interface ContactRevealRecord {
  id: string;
  listingId: string;
  sellerId: string;
  buyerId: string;
  createdAt: number;
}

export interface Review {
  id: string;
  sellerId: string;
  buyerId: string;
  buyerName: string;
  listingId: string;
  productQuality: number;
  communication: number;
  pricingHonesty: number;
  overallRating: number;
  comment: string;
  sellerReply?: string;
  sellerRepliedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ScamReport {
  id: string;
  listingId: string;
  sellerId: string;
  reporterBuyerId: string;
  reporterName: string;
  reason: ScamReason;
  details: string;
  evidenceDataUrl?: string;
  status: 'open' | 'resolved_frozen' | 'dismissed';
  createdAt: number;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  paymentType: 'advertiser_subscription' | 'buyer_account_fee';
  method: 'manual_pop' | 'flutterwave_ussd';
  network: 'MTN MoMo' | 'Airtel Money' | 'Zamtel Kwacha';
  amountZmw: number;
  referenceCode: string;
  transactionId: string;
  proofImageUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewNote?: string;
  createdAt: number;
}

export interface KycSubmission {
  id: string;
  userId: string;
  userName: string;
  requestedTier: 'tier1_id' | 'tier2_business' | 'tier3_site';
  phoneOtpVerified: boolean;
  nrcNumber?: string;
  nrcFrontName?: string;
  nrcBackName?: string;
  momoAccountName?: string;
  pacraNumber?: string;
  zraTpin?: string;
  certificateRef?: string;
  siteGpsPin?: string;
  walkthroughVideoRef?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewNote?: string;
  createdAt: number;
}

export interface ChatConversation {
  id: string;
  listingId?: string;
  listingTitle?: string;
  sellerId: string;
  sellerName: string;
  buyerId: string;
  buyerName: string;
  whatsappHandoffAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  type: 'text' | 'image' | 'voice' | 'system_handoff';
  text?: string;
  mediaDataUrl?: string;
  audioDurationSec?: number;
  createdAt: number;
}

export interface PlatformConfig {
  platformLaunchedAt: number;
  defaultTrialDays: number;
  advertiserMonthlyFeeZmw: number;
  advertiserPaymentRequired: boolean;
  buyerFeeEnabled: boolean;
  buyerFeeAmountZmw: number;
  buyerTractionMonthsOverride: boolean;
  dormancyThresholdDays: number;
  manualMomoNumber: string;
  manualAirtelNumber: string;
}

export interface AnalyticsStreamEvent {
  id: string;
  type:
    | 'impression'
    | 'view'
    | 'video_play'
    | 'contact_reveal'
    | 'scam_report'
    | 'listing_auto_frozen'
    | 'payment_update'
    | 'kyc_update'
    | 'config_update'
    | 'chat_message';
  listingId?: string;
  listingTitle?: string;
  sellerId?: string;
  province?: string;
  message: string;
  timestamp: number;
}

export interface BlacklistRecord {
  id: string;
  userId: string;
  nrcHash: string;
  phoneHash: string;
  momoHash: string;
  reason: string;
  bannedAt: number;
}

export interface EmailNotificationRecord {
  id: string;
  toEmail: string;
  toName: string;
  fromEmail: string;
  subject: string;
  body: string;
  type: 'account_verification' | 'staff_delegation_credentials' | 'password_changed';
  username?: string;
  roleTitle?: string;
  grantedPermissions?: StaffPermission[];
  deliveryMode: 'email_and_inbox' | 'in_app_dispatch';
  createdAt: number;
}

export interface MarketplaceState {
  config: PlatformConfig;
  users: ServerUserAccount[];
  listings: Listing[];
  contactReveals: ContactRevealRecord[];
  reviews: Review[];
  scamReports: ScamReport[];
  payments: PaymentRecord[];
  kycSubmissions: KycSubmission[];
  conversations: ChatConversation[];
  messages: ChatMessage[];
  blacklist: BlacklistRecord[];
  recentEvents: AnalyticsStreamEvent[];
  emailNotifications: EmailNotificationRecord[];
}
