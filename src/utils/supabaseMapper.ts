import type {
  AnalyticsStreamEvent,
  BlacklistRecord,
  ChatConversation,
  ChatMessage,
  ContactRevealRecord,
  EmailNotificationRecord,
  KycSubmission,
  Listing,
  PaymentRecord,
  PlatformConfig,
  Review,
  ScamReport,
  ServerUserAccount,
  StaffPermission,
} from '../types/marketplace.ts';

export interface PlatformConfigRow {
  id: string;
  platform_launched_at: number;
  default_trial_days: number;
  advertiser_monthly_fee_zmw: number;
  advertiser_payment_required: boolean;
  buyer_fee_enabled: boolean;
  buyer_fee_amount_zmw: number;
  buyer_traction_months_override: boolean;
  dormancy_threshold_days: number;
  manual_momo_number: string;
  manual_airtel_number: string;
}

export interface UserRow {
  id: string;
  auth_user_id: string | null;
  system_id: string | null;
  admin_note: string | null;
  name: string;
  username: string | null;
  delegated_role_title: string | null;
  business_name: string | null;
  email: string;
  phone: string;
  whatsapp: string | null;
  role: ServerUserAccount['role'];
  staff_permissions: StaffPermission[];
  province: string;
  district: string;
  verification_tier: ServerUserAccount['verificationTier'];
  nrc_number: string | null;
  momo_account_name: string | null;
  pacra_number: string | null;
  zra_tpin: string | null;
  site_gps_pin: string | null;
  default_location_privacy: ServerUserAccount['defaultLocationPrivacy'] | null;
  farm_lat: number | null;
  farm_lng: number | null;
  account_status: ServerUserAccount['accountStatus'];
  email_verified: boolean;
  must_change_password: boolean;
  password_hash: string | null;
  verification_code_hash: string | null;
  verification_expires_at: number | null;
  trial_start_at: number;
  trial_days_allocated: number;
  paid_until_at: number | null;
  buyer_fee_paid_until_at: number | null;
  last_active_at: number;
  created_at: number;
  saved_listing_ids: string[];
}

export interface ListingRow {
  id: string;
  seller_id: string;
  title: string;
  category: Listing['category'];
  description: string;
  price_zmw: number;
  unit_label: string;
  quantity_available: string;
  province: string;
  district: string;
  lat: number | null;
  lng: number | null;
  location_privacy: Listing['locationPrivacy'];
  images: string[];
  has_video_walkthrough: boolean;
  video_url: string | null;
  video_duration_sec: number | null;
  status: Listing['status'];
  impressions: number;
  views: number;
  unique_visitors: number;
  video_plays: number;
  contact_reveals: number;
  created_at: number;
  updated_at: number;
}

export interface ContactRevealRow {
  id: string;
  listing_id: string;
  seller_id: string;
  buyer_id: string;
  created_at: number;
}

export interface ReviewRow {
  id: string;
  seller_id: string;
  buyer_id: string;
  buyer_name: string;
  listing_id: string;
  product_quality: number;
  communication: number;
  pricing_honesty: number;
  overall_rating: number;
  comment: string;
  seller_reply: string | null;
  seller_replied_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface ScamReportRow {
  id: string;
  listing_id: string;
  seller_id: string;
  reporter_buyer_id: string;
  reporter_name: string;
  reason: ScamReport['reason'];
  details: string;
  evidence_data_url: string | null;
  status: ScamReport['status'];
  created_at: number;
}

export interface PaymentRow {
  id: string;
  user_id: string;
  user_name: string;
  user_phone: string;
  payment_type: PaymentRecord['paymentType'];
  method: PaymentRecord['method'];
  network: PaymentRecord['network'];
  amount_zmw: number;
  reference_code: string;
  transaction_id: string;
  proof_image_url: string | null;
  status: PaymentRecord['status'];
  reviewed_by: string | null;
  review_note: string | null;
  created_at: number;
}

export interface KycSubmissionRow {
  id: string;
  user_id: string;
  user_name: string;
  requested_tier: KycSubmission['requestedTier'];
  phone_otp_verified: boolean;
  nrc_number: string | null;
  nrc_front_name: string | null;
  nrc_back_name: string | null;
  momo_account_name: string | null;
  pacra_number: string | null;
  zra_tpin: string | null;
  certificate_ref: string | null;
  site_gps_pin: string | null;
  walkthrough_video_ref: string | null;
  status: KycSubmission['status'];
  reviewed_by: string | null;
  review_note: string | null;
  created_at: number;
}

export interface ChatConversationRow {
  id: string;
  kind: 'listing_inquiry' | 'billing_support';
  listing_id: string | null;
  listing_title: string | null;
  seller_id: string;
  seller_name: string;
  buyer_id: string;
  buyer_name: string;
  whatsapp_handoff_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface ChatMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: ChatMessage['senderRole'];
  type: ChatMessage['type'];
  text: string | null;
  media_data_url: string | null;
  audio_duration_sec: number | null;
  notice_key: string | null;
  payment_type: ChatMessage['paymentType'] | null;
  amount_zmw: number | null;
  created_at: number;
}

export interface BlacklistRow {
  id: string;
  user_id: string;
  nrc_hash: string;
  phone_hash: string;
  momo_hash: string;
  reason: string;
  banned_at: number;
}

export interface AnalyticsEventRow {
  id: string;
  type: AnalyticsStreamEvent['type'];
  listing_id: string | null;
  listing_title: string | null;
  seller_id: string | null;
  province: string | null;
  message: string;
  timestamp: number;
}

export interface EmailNotificationRow {
  id: string;
  to_email: string;
  to_name: string;
  from_email: string;
  subject: string;
  body: string;
  type: EmailNotificationRecord['type'];
  username: string | null;
  role_title: string | null;
  granted_permissions: StaffPermission[] | null;
  delivery_mode: EmailNotificationRecord['deliveryMode'];
  created_at: number;
}

export function configToRow(cfg: PlatformConfig): PlatformConfigRow {
  return {
    id: 'default',
    platform_launched_at: Number(cfg.platformLaunchedAt),
    default_trial_days: Number(cfg.defaultTrialDays),
    advertiser_monthly_fee_zmw: Number(cfg.advertiserMonthlyFeeZmw),
    advertiser_payment_required: Boolean(cfg.advertiserPaymentRequired),
    buyer_fee_enabled: Boolean(cfg.buyerFeeEnabled),
    buyer_fee_amount_zmw: Number(cfg.buyerFeeAmountZmw),
    buyer_traction_months_override: Boolean(cfg.buyerTractionMonthsOverride),
    dormancy_threshold_days: Number(cfg.dormancyThresholdDays),
    manual_momo_number: cfg.manualMomoNumber,
    manual_airtel_number: cfg.manualAirtelNumber,
  };
}

export function rowToConfig(row: PlatformConfigRow): PlatformConfig {
  return {
    platformLaunchedAt: Number(row.platform_launched_at),
    defaultTrialDays: Number(row.default_trial_days),
    advertiserMonthlyFeeZmw: Number(row.advertiser_monthly_fee_zmw),
    advertiserPaymentRequired: Boolean(row.advertiser_payment_required),
    buyerFeeEnabled: Boolean(row.buyer_fee_enabled),
    buyerFeeAmountZmw: Number(row.buyer_fee_amount_zmw),
    buyerTractionMonthsOverride: Boolean(row.buyer_traction_months_override),
    dormancyThresholdDays: Number(row.dormancy_threshold_days),
    manualMomoNumber: row.manual_momo_number,
    manualAirtelNumber: row.manual_airtel_number,
  };
}

export function userToRow(u: ServerUserAccount): UserRow {
  return {
    id: u.id,
    auth_user_id: u.authUserId ?? null,
    system_id: u.systemId ?? null,
    admin_note: u.adminNote ?? null,
    name: u.name,
    username: u.username ?? null,
    delegated_role_title: u.delegatedRoleTitle ?? null,
    business_name: u.businessName ?? null,
    email: u.email,
    phone: u.phone,
    whatsapp: u.whatsapp ?? null,
    role: u.role,
    staff_permissions: u.staffPermissions || [],
    province: u.province,
    district: u.district,
    verification_tier: u.verificationTier,
    nrc_number: u.nrcNumber ?? null,
    momo_account_name: u.momoAccountName ?? null,
    pacra_number: u.pacraNumber ?? null,
    zra_tpin: u.zraTpin ?? null,
    site_gps_pin: u.siteGpsPin ?? null,
    default_location_privacy: u.defaultLocationPrivacy ?? null,
    farm_lat: u.farmCoordinates?.lat ?? null,
    farm_lng: u.farmCoordinates?.lng ?? null,
    account_status: u.accountStatus,
    email_verified: Boolean(u.emailVerified),
    must_change_password: Boolean(u.mustChangePassword),
    password_hash: u.passwordHash ?? null,
    verification_code_hash: u.verificationCodeHash ?? null,
    verification_expires_at: u.verificationExpiresAt ?? null,
    trial_start_at: Number(u.trialStartAt),
    trial_days_allocated: Number(u.trialDaysAllocated),
    paid_until_at: u.paidUntilAt ?? null,
    buyer_fee_paid_until_at: u.buyerFeePaidUntilAt ?? null,
    last_active_at: Number(u.lastActiveAt),
    created_at: Number(u.createdAt),
    saved_listing_ids: u.savedListingIds || [],
  };
}

export function rowToUser(r: UserRow): ServerUserAccount {
  return {
    id: r.id,
    authUserId: r.auth_user_id ?? undefined,
    systemId: r.system_id ?? undefined,
    adminNote: r.admin_note ?? undefined,
    name: r.name,
    username: r.username ?? undefined,
    delegatedRoleTitle: r.delegated_role_title ?? undefined,
    businessName: r.business_name ?? undefined,
    email: r.email,
    phone: r.phone,
    whatsapp: r.whatsapp ?? undefined,
    role: r.role,
    staffPermissions: r.staff_permissions || [],
    province: r.province,
    district: r.district,
    verificationTier: r.verification_tier,
    nrcNumber: r.nrc_number ?? undefined,
    momoAccountName: r.momo_account_name ?? undefined,
    pacraNumber: r.pacra_number ?? undefined,
    zraTpin: r.zra_tpin ?? undefined,
    siteGpsPin: r.site_gps_pin ?? undefined,
    defaultLocationPrivacy: r.default_location_privacy ?? undefined,
    farmCoordinates:
      r.farm_lat !== null && r.farm_lng !== null
        ? { lat: Number(r.farm_lat), lng: Number(r.farm_lng) }
        : undefined,
    accountStatus: r.account_status,
    emailVerified: Boolean(r.email_verified),
    mustChangePassword: Boolean(r.must_change_password),
    passwordHash: r.password_hash ?? undefined,
    verificationCodeHash: r.verification_code_hash ?? undefined,
    verificationExpiresAt:
      r.verification_expires_at !== null ? Number(r.verification_expires_at) : undefined,
    trialStartAt: Number(r.trial_start_at),
    trialDaysAllocated: Number(r.trial_days_allocated),
    paidUntilAt: r.paid_until_at !== null ? Number(r.paid_until_at) : undefined,
    buyerFeePaidUntilAt:
      r.buyer_fee_paid_until_at !== null ? Number(r.buyer_fee_paid_until_at) : undefined,
    lastActiveAt: Number(r.last_active_at),
    createdAt: Number(r.created_at),
    savedListingIds: r.saved_listing_ids || [],
  };
}

export function listingToRow(l: Listing): ListingRow {
  return {
    id: l.id,
    seller_id: l.sellerId,
    title: l.title,
    category: l.category,
    description: l.description,
    price_zmw: Number(l.priceZmw),
    unit_label: l.unitLabel,
    quantity_available: l.quantityAvailable,
    province: l.province,
    district: l.district,
    lat: l.coordinates?.lat ?? null,
    lng: l.coordinates?.lng ?? null,
    location_privacy: l.locationPrivacy,
    images: l.images || [],
    has_video_walkthrough: Boolean(l.hasVideoWalkthrough),
    video_url: l.videoUrl ?? null,
    video_duration_sec: l.videoDurationSec ?? null,
    status: l.status,
    impressions: Number(l.impressions || 0),
    views: Number(l.views || 0),
    unique_visitors: Number(l.uniqueVisitors || 0),
    video_plays: Number(l.videoPlays || 0),
    contact_reveals: Number(l.contactReveals || 0),
    created_at: Number(l.createdAt),
    updated_at: Number(l.updatedAt),
  };
}

export function rowToListing(r: ListingRow): Listing {
  return {
    id: r.id,
    sellerId: r.seller_id,
    title: r.title,
    category: r.category,
    description: r.description,
    priceZmw: Number(r.price_zmw),
    unitLabel: r.unit_label,
    quantityAvailable: r.quantity_available,
    province: r.province,
    district: r.district,
    coordinates:
      r.lat !== null && r.lng !== null
        ? { lat: Number(r.lat), lng: Number(r.lng) }
        : undefined,
    locationPrivacy: r.location_privacy,
    images: r.images || [],
    hasVideoWalkthrough: Boolean(r.has_video_walkthrough),
    videoUrl: r.video_url ?? undefined,
    videoDurationSec: r.video_duration_sec ?? undefined,
    status: r.status,
    impressions: Number(r.impressions || 0),
    views: Number(r.views || 0),
    uniqueVisitors: Number(r.unique_visitors || 0),
    videoPlays: Number(r.video_plays || 0),
    contactReveals: Number(r.contact_reveals || 0),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export function contactRevealToRow(c: ContactRevealRecord): ContactRevealRow {
  return {
    id: c.id,
    listing_id: c.listingId,
    seller_id: c.sellerId,
    buyer_id: c.buyerId,
    created_at: Number(c.createdAt),
  };
}

export function rowToContactReveal(r: ContactRevealRow): ContactRevealRecord {
  return {
    id: r.id,
    listingId: r.listing_id,
    sellerId: r.seller_id,
    buyerId: r.buyer_id,
    createdAt: Number(r.created_at),
  };
}

export function reviewToRow(rev: Review): ReviewRow {
  return {
    id: rev.id,
    seller_id: rev.sellerId,
    buyer_id: rev.buyerId,
    buyer_name: rev.buyerName,
    listing_id: rev.listingId,
    product_quality: Number(rev.productQuality),
    communication: Number(rev.communication),
    pricing_honesty: Number(rev.pricingHonesty),
    overall_rating: Number(rev.overallRating),
    comment: rev.comment,
    seller_reply: rev.sellerReply ?? null,
    seller_replied_at: rev.sellerRepliedAt ?? null,
    created_at: Number(rev.createdAt),
    updated_at: Number(rev.updatedAt),
  };
}

export function rowToReview(r: ReviewRow): Review {
  return {
    id: r.id,
    sellerId: r.seller_id,
    buyerId: r.buyer_id,
    buyerName: r.buyer_name,
    listingId: r.listing_id,
    productQuality: Number(r.product_quality),
    communication: Number(r.communication),
    pricingHonesty: Number(r.pricing_honesty),
    overallRating: Number(r.overall_rating),
    comment: r.comment,
    sellerReply: r.seller_reply ?? undefined,
    sellerRepliedAt: r.seller_replied_at !== null ? Number(r.seller_replied_at) : undefined,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export function scamReportToRow(sr: ScamReport): ScamReportRow {
  return {
    id: sr.id,
    listing_id: sr.listingId,
    seller_id: sr.sellerId,
    reporter_buyer_id: sr.reporterBuyerId,
    reporter_name: sr.reporterName,
    reason: sr.reason,
    details: sr.details,
    evidence_data_url: sr.evidenceDataUrl ?? null,
    status: sr.status,
    created_at: Number(sr.createdAt),
  };
}

export function rowToScamReport(r: ScamReportRow): ScamReport {
  return {
    id: r.id,
    listingId: r.listing_id,
    sellerId: r.seller_id,
    reporterBuyerId: r.reporter_buyer_id,
    reporterName: r.reporter_name,
    reason: r.reason,
    details: r.details,
    evidenceDataUrl: r.evidence_data_url ?? undefined,
    status: r.status,
    createdAt: Number(r.created_at),
  };
}

export function paymentToRow(p: PaymentRecord): PaymentRow {
  return {
    id: p.id,
    user_id: p.userId,
    user_name: p.userName,
    user_phone: p.userPhone,
    payment_type: p.paymentType,
    method: p.method,
    network: p.network,
    amount_zmw: Number(p.amountZmw),
    reference_code: p.referenceCode,
    transaction_id: p.transactionId,
    proof_image_url: p.proofImageUrl ?? null,
    status: p.status,
    reviewed_by: p.reviewedBy ?? null,
    review_note: p.reviewNote ?? null,
    created_at: Number(p.createdAt),
  };
}

export function rowToPayment(r: PaymentRow): PaymentRecord {
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    userPhone: r.user_phone,
    paymentType: r.payment_type,
    method: r.method,
    network: r.network,
    amountZmw: Number(r.amount_zmw),
    referenceCode: r.reference_code,
    transactionId: r.transaction_id,
    proofImageUrl: r.proof_image_url ?? undefined,
    status: r.status,
    reviewedBy: r.reviewed_by ?? undefined,
    reviewNote: r.review_note ?? undefined,
    createdAt: Number(r.created_at),
  };
}

export function kycToRow(k: KycSubmission): KycSubmissionRow {
  return {
    id: k.id,
    user_id: k.userId,
    user_name: k.userName,
    requested_tier: k.requestedTier,
    phone_otp_verified: Boolean(k.phoneOtpVerified),
    nrc_number: k.nrcNumber ?? null,
    nrc_front_name: k.nrcFrontName ?? null,
    nrc_back_name: k.nrcBackName ?? null,
    momo_account_name: k.momoAccountName ?? null,
    pacra_number: k.pacraNumber ?? null,
    zra_tpin: k.zraTpin ?? null,
    certificate_ref: k.certificateRef ?? null,
    site_gps_pin: k.siteGpsPin ?? null,
    walkthrough_video_ref: k.walkthroughVideoRef ?? null,
    status: k.status,
    reviewed_by: k.reviewedBy ?? null,
    review_note: k.reviewNote ?? null,
    created_at: Number(k.createdAt),
  };
}

export function rowToKyc(r: KycSubmissionRow): KycSubmission {
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    requestedTier: r.requested_tier,
    phoneOtpVerified: Boolean(r.phone_otp_verified),
    nrcNumber: r.nrc_number ?? undefined,
    nrcFrontName: r.nrc_front_name ?? undefined,
    nrcBackName: r.nrc_back_name ?? undefined,
    momoAccountName: r.momo_account_name ?? undefined,
    pacraNumber: r.pacra_number ?? undefined,
    zraTpin: r.zra_tpin ?? undefined,
    certificateRef: r.certificate_ref ?? undefined,
    siteGpsPin: r.site_gps_pin ?? undefined,
    walkthroughVideoRef: r.walkthrough_video_ref ?? undefined,
    status: r.status,
    reviewedBy: r.reviewed_by ?? undefined,
    reviewNote: r.review_note ?? undefined,
    createdAt: Number(r.created_at),
  };
}

export function conversationToRow(c: ChatConversation): ChatConversationRow {
  return {
    id: c.id,
    kind: c.kind || 'listing_inquiry',
    listing_id: c.listingId ?? null,
    listing_title: c.listingTitle ?? null,
    seller_id: c.sellerId,
    seller_name: c.sellerName,
    buyer_id: c.buyerId,
    buyer_name: c.buyerName,
    whatsapp_handoff_at: c.whatsappHandoffAt ?? null,
    created_at: Number(c.createdAt),
    updated_at: Number(c.updatedAt),
  };
}

export function rowToConversation(r: ChatConversationRow): ChatConversation {
  return {
    id: r.id,
    kind: r.kind,
    listingId: r.listing_id ?? undefined,
    listingTitle: r.listing_title ?? undefined,
    sellerId: r.seller_id,
    sellerName: r.seller_name,
    buyerId: r.buyer_id,
    buyerName: r.buyer_name,
    whatsappHandoffAt: r.whatsapp_handoff_at !== null ? Number(r.whatsapp_handoff_at) : undefined,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export function messageToRow(m: ChatMessage): ChatMessageRow {
  return {
    id: m.id,
    conversation_id: m.conversationId,
    sender_id: m.senderId,
    sender_name: m.senderName,
    sender_role: m.senderRole,
    type: m.type,
    text: m.text ?? null,
    media_data_url: m.mediaDataUrl ?? null,
    audio_duration_sec: m.audioDurationSec ?? null,
    notice_key: m.noticeKey ?? null,
    payment_type: m.paymentType ?? null,
    amount_zmw: m.amountZmw ?? null,
    created_at: Number(m.createdAt),
  };
}

export function rowToMessage(r: ChatMessageRow): ChatMessage {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    senderId: r.sender_id,
    senderName: r.sender_name,
    senderRole: r.sender_role,
    type: r.type,
    text: r.text ?? undefined,
    mediaDataUrl: r.media_data_url ?? undefined,
    audioDurationSec: r.audio_duration_sec !== null ? Number(r.audio_duration_sec) : undefined,
    noticeKey: r.notice_key ?? undefined,
    paymentType: r.payment_type ?? undefined,
    amountZmw: r.amount_zmw !== null ? Number(r.amount_zmw) : undefined,
    createdAt: Number(r.created_at),
  };
}

export function blacklistToRow(b: BlacklistRecord): BlacklistRow {
  return {
    id: b.id,
    user_id: b.userId,
    nrc_hash: b.nrcHash,
    phone_hash: b.phoneHash,
    momo_hash: b.momoHash,
    reason: b.reason,
    banned_at: Number(b.bannedAt),
  };
}

export function rowToBlacklist(r: BlacklistRow): BlacklistRecord {
  return {
    id: r.id,
    userId: r.user_id,
    nrcHash: r.nrc_hash,
    phoneHash: r.phone_hash,
    momoHash: r.momo_hash,
    reason: r.reason,
    bannedAt: Number(r.banned_at),
  };
}

export function analyticsEventToRow(e: AnalyticsStreamEvent): AnalyticsEventRow {
  return {
    id: e.id,
    type: e.type,
    listing_id: e.listingId ?? null,
    listing_title: e.listingTitle ?? null,
    seller_id: e.sellerId ?? null,
    province: e.province ?? null,
    message: e.message,
    timestamp: Number(e.timestamp),
  };
}

export function rowToAnalyticsEvent(r: AnalyticsEventRow): AnalyticsStreamEvent {
  return {
    id: r.id,
    type: r.type,
    listingId: r.listing_id ?? undefined,
    listingTitle: r.listing_title ?? undefined,
    sellerId: r.seller_id ?? undefined,
    province: r.province ?? undefined,
    message: r.message,
    timestamp: Number(r.timestamp),
  };
}

export function emailNotificationToRow(n: EmailNotificationRecord): EmailNotificationRow {
  return {
    id: n.id,
    to_email: n.toEmail,
    to_name: n.toName,
    from_email: n.fromEmail,
    subject: n.subject,
    body: n.body,
    type: n.type,
    username: n.username ?? null,
    role_title: n.roleTitle ?? null,
    granted_permissions: n.grantedPermissions ?? null,
    delivery_mode: n.deliveryMode,
    created_at: Number(n.createdAt),
  };
}

export function rowToEmailNotification(r: EmailNotificationRow): EmailNotificationRecord {
  return {
    id: r.id,
    toEmail: r.to_email,
    toName: r.to_name,
    fromEmail: r.from_email,
    subject: r.subject,
    body: r.body,
    type: r.type,
    username: r.username ?? undefined,
    roleTitle: r.role_title ?? undefined,
    grantedPermissions: r.granted_permissions ?? undefined,
    deliveryMode: r.delivery_mode,
    createdAt: Number(r.created_at),
  };
}
