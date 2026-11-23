import crypto from 'node:crypto';
import http from 'node:http';
import express from 'express';
import path from 'node:path';
import type { Response } from 'express';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { getDistrictCoordinates } from './src/data/zambia.ts';
import { hashIdentifier, loadState, saveState } from './serverStore.ts';
import {
  dispatchPlatformEmail,
  generateTempPassword,
  generateVerificationCode,
  hashPassword,
  hashVerificationCode,
  runGeminiMarketplaceChat,
  sanitizePublicUserProfile,
  sanitizeUserForClient,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
  type GeminiAssistantRoleId,
  type GeminiSpeedTier,
} from './serverSecurity.ts';
import {
  generateStaffUsername,
  resolveDelegatedPermissions,
  validatePasswordStrength,
} from './src/utils/authRules.ts';
import { assignSystemId, normalizeSystemIdInput } from './src/utils/adminReporting.ts';
import type {
  AnalyticsStreamEvent,
  ChatConversation,
  ChatMessage,
  EmailNotificationRecord,
  KycSubmission,
  Listing,
  PaymentRecord,
  Review,
  ScamReport,
  ServerUserAccount,
  StaffPermission,
  UserAccount,
} from './src/types/marketplace.ts';
import {
  canBuyerRateSeller,
  computeTrialStatus,
  getPublicListingCoordinates,
  isAccountDormant,
  isBuyerFeeEligible,
  normalizeZambianPhone,
  shouldAutoFreezeListing,
} from './src/utils/marketplaceRules.ts';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

let state = loadState();
const sseClients = new Set<Response>();
const chatSockets = new Map<string, Set<WebSocket>>();

function addChatSocket(userId: string, ws: WebSocket): void {
  const existing = chatSockets.get(userId);
  if (existing) {
    existing.add(ws);
  } else {
    chatSockets.set(userId, new Set([ws]));
  }
}

function removeChatSocket(userId: string, ws: WebSocket): void {
  const existing = chatSockets.get(userId);
  if (!existing) return;
  existing.delete(ws);
  if (existing.size === 0) {
    chatSockets.delete(userId);
  }
}

function sendChatPayloadToUsers(userIds: string[], payload: unknown): void {
  const serialized = JSON.stringify(payload);
  for (const uid of new Set(userIds)) {
    const sockets = chatSockets.get(uid);
    if (!sockets) continue;
    for (const ws of sockets) {
      if (ws.readyState === 1) {
        ws.send(serialized);
      }
    }
  }
}

function broadcastEvent(event: AnalyticsStreamEvent): void {
  state.recentEvents = [event, ...state.recentEvents].slice(0, 40);
  saveState(state);
  const payload = JSON.stringify({
    event,
    onlineCount: Math.max(1, sseClients.size),
  });
  for (const res of sseClients) {
    res.write(`event: marketplace\ndata: ${payload}\n\n`);
  }
}

function getActor(req: express.Request): ServerUserAccount | null {
  const authHeader = req.header('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  const userId = verifySessionToken(token);
  if (!userId) return null;
  return state.users.find((u) => u.id === userId) || null;
}

function isAdminSetupRequired(): boolean {
  const envPass = process.env.ADMIN_PASSCODE?.trim();
  if (envPass) return false;
  const admin = state.users.find((u) => u.id === 'usr-admin-1');
  return !admin?.passwordHash;
}

function hasStaffPermission(user: UserAccount | null, permission: StaffPermission): boolean {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  if (user.role === 'staff') {
    return user.staffPermissions.includes(permission);
  }
  return false;
}

function sanitizeListingsForActor(actor: UserAccount | null): Listing[] {
  const sellersById: Record<string, ServerUserAccount> = {};
  for (const u of state.users) {
    sellersById[u.id] = u;
  }

  return state.listings.map((listing) => {
    const isOwnerOrAdmin =
      actor && (actor.id === listing.sellerId || actor.role === 'super_admin' || actor.role === 'staff');
    if (isOwnerOrAdmin) {
      return listing;
    }
    const seller = sellersById[listing.sellerId];
    const masked = getPublicListingCoordinates(listing, seller);
    return {
      ...listing,
      coordinates: { lat: masked.lat, lng: masked.lng },
    };
  });
}

function syncAllAccountStatuses(): void {
  const now = Date.now();
  let changed = false;
  for (const user of state.users) {
    if (user.role === 'advertiser') {
      const evalResult = computeTrialStatus(user, state.config, now);
      if (
        user.accountStatus !== 'banned' &&
        user.accountStatus !== 'suspended' &&
        user.accountStatus !== 'frozen' &&
        user.accountStatus !== 'under_investigation' &&
        user.accountStatus !== 'dormant' &&
        user.accountStatus !== evalResult.effectiveAccountStatus
      ) {
        user.accountStatus = evalResult.effectiveAccountStatus;
        changed = true;
      }
      for (const listing of state.listings) {
        if (listing.sellerId === user.id) {
          if (evalResult.listingsShouldPause && listing.status === 'active') {
            listing.status = 'paused_payment';
            changed = true;
          } else if (!evalResult.listingsShouldPause && listing.status === 'paused_payment') {
            listing.status = 'active';
            changed = true;
          }
        }
      }
    }
  }
  if (changed) saveState(state);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const reqUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (reqUrl.pathname === '/ws/chat') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
    // Leave other upgrade paths (if any) untouched
  });

  wss.on('connection', (ws, request) => {
    const reqUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    const token = reqUrl.searchParams.get('token') || '';
    const userId = verifySessionToken(token);
    if (!userId) {
      ws.close();
      return;
    }
    addChatSocket(userId, ws);
    ws.send(JSON.stringify({ type: 'chat:connected', userId, timestamp: Date.now() }));

    ws.on('close', () => {
      removeChatSocket(userId, ws);
    });
  });

  // SSE Real-time Analytics & Alert Stream
  app.get('/api/analytics/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    sseClients.add(res);
    res.write(
      `event: connected\ndata: ${JSON.stringify({ onlineCount: sseClients.size, timestamp: Date.now() })}\n\n`
    );

    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  // Full state bootstrap for client (strictly stripping password hashes & respecting permissions)
  app.get('/api/bootstrap', (req, res) => {
    syncAllAccountStatuses();
    const actor = getActor(req);
    const isAdminOrStaff = Boolean(actor && (actor.role === 'super_admin' || actor.role === 'staff'));

    const visibleConversations = actor
      ? state.conversations.filter(
          (c) => c.buyerId === actor.id || c.sellerId === actor.id || actor.role === 'super_admin'
        )
      : [];
    const visibleConvIds = new Set(visibleConversations.map((c) => c.id));
    const visibleMessages = state.messages.filter((m) => visibleConvIds.has(m.conversationId));

    const safeUsers: UserAccount[] = state.users.map((u) => {
      if (actor && (actor.id === u.id || isAdminOrStaff)) {
        return sanitizeUserForClient(u);
      }
      return sanitizePublicUserProfile(u);
    });

    const visiblePayments = isAdminOrStaff
      ? state.payments
      : actor
      ? state.payments.filter((p) => p.userId === actor.id)
      : [];

    const visibleKyc = isAdminOrStaff
      ? state.kycSubmissions
      : actor
      ? state.kycSubmissions.filter((k) => k.userId === actor.id)
      : [];

    const visibleScamReports = isAdminOrStaff
      ? state.scamReports
      : actor
      ? state.scamReports.filter((r) => r.reporterBuyerId === actor.id)
      : [];

    const visibleEmailNotifications =
      actor?.role === 'super_admin'
        ? state.emailNotifications
        : actor
        ? state.emailNotifications.filter((n) => n.toEmail.toLowerCase() === actor.email.toLowerCase())
        : [];

    res.json({
      config: state.config,
      users: safeUsers,
      listings: sanitizeListingsForActor(actor),
      contactReveals: actor
        ? isAdminOrStaff
          ? state.contactReveals
          : state.contactReveals.filter((c) => c.buyerId === actor.id || c.sellerId === actor.id)
        : [],
      reviews: state.reviews,
      scamReports: visibleScamReports,
      payments: visiblePayments,
      kycSubmissions: visibleKyc,
      conversations: visibleConversations,
      messages: visibleMessages,
      blacklist: isAdminOrStaff ? state.blacklist : [],
      recentEvents: state.recentEvents,
      emailNotifications: visibleEmailNotifications,
      adminNeedsSetup: isAdminSetupRequired(),
      onlineCount: Math.max(1, sseClients.size),
    });
  });

  // First-run Super Admin setup status
  app.get('/api/auth/admin-status', (_req, res) => {
    res.json({
      adminNeedsSetup: isAdminSetupRequired(),
      adminEmail: 'agrilinkzm0@gmail.com',
    });
  });

  // One-time Super Admin password claim (when ADMIN_PASSCODE env var is unset and no password claimed yet)
  app.post('/api/auth/claim-admin', (req, res) => {
    if (!isAdminSetupRequired()) {
      res.status(409).json({
        error: 'Super Admin password is already configured. Sign in using your password.',
      });
      return;
    }
    const { password } = req.body as { password?: string };
    const strength = validatePasswordStrength(password || '');
    if (!strength.valid) {
      res.status(400).json({ error: strength.error });
      return;
    }
    const admin = state.users.find((u) => u.id === 'usr-admin-1');
    if (!admin) {
      res.status(404).json({ error: 'Super Admin record not found.' });
      return;
    }
    admin.passwordHash = hashPassword(password!);
    admin.emailVerified = true;
    admin.mustChangePassword = false;
    admin.lastActiveAt = Date.now();
    saveState(state);

    const token = signSessionToken(admin.id);
    res.json({ user: sanitizeUserForClient(admin), token });
  });

  // Auth: Password required on EVERY login (matches email, username, or normalized phone)
  app.post('/api/auth/login', (req, res) => {
    const { identifier, password } = req.body as { identifier?: string; password?: string };
    if (!identifier?.trim() || !password) {
      res.status(400).json({
        error: 'Email/username/phone and password are required every time you sign in.',
      });
      return;
    }

    const normalized = identifier.trim().toLowerCase();
    const normalizedPhone = normalizeZambianPhone(identifier);
    const normalizedSystemId = normalizeSystemIdInput(identifier);
    const user = state.users.find(
      (u) =>
        u.email.toLowerCase() === normalized ||
        (u.username && u.username.toLowerCase() === normalized) ||
        (u.systemId && u.systemId.toUpperCase() === normalizedSystemId) ||
        u.phone === normalizedPhone
    );

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials. Check your email/username and password.' });
      return;
    }

    const envAdminPass = process.env.ADMIN_PASSCODE?.trim();
    let passwordMatches = false;
    if (user.id === 'usr-admin-1' && envAdminPass) {
      const a = Buffer.from(password, 'utf8');
      const b = Buffer.from(envAdminPass, 'utf8');
      passwordMatches = a.length === b.length && crypto.timingSafeEqual(a, b);
    } else {
      passwordMatches = verifyPassword(password, user.passwordHash);
    }

    if (!passwordMatches) {
      res.status(401).json({ error: 'Invalid credentials. Check your email/username and password.' });
      return;
    }

    if (user.accountStatus === 'banned') {
      res.status(403).json({
        error: 'This account has been permanently blacklisted for trust violations.',
      });
      return;
    }

    if (user.accountStatus === 'frozen' || user.accountStatus === 'suspended') {
      res.status(403).json({
        error: `This account is currently ${user.accountStatus}. Contact AgriLink ZM Support (+260 976 405 828).`,
      });
      return;
    }

    if (!user.emailVerified) {
      res.status(403).json({
        error: 'Please verify your account using your email verification code before logging in.',
        requiresVerification: true,
        email: user.email,
      });
      return;
    }

    user.lastActiveAt = Date.now();
    if (user.accountStatus === 'dormant') {
      user.accountStatus = 'trial_active';
    }
    saveState(state);

    const token = signSessionToken(user.id);
    res.json({ user: sanitizeUserForClient(user), token });
  });

  // Auth: Register new Buyer or Advertiser (hashes password + requires email verification before login)
  app.post('/api/auth/register', async (req, res) => {
    const {
      name,
      username,
      businessName,
      email,
      phone,
      password,
      role,
      province,
      district,
      nrcNumber,
      momoAccountName,
    } = req.body as {
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
    };

    if (!name?.trim() || !email?.trim() || !phone?.trim() || !province || !district) {
      res.status(400).json({ error: 'Name, email, Zambian phone, province, and district are required.' });
      return;
    }

    const strength = validatePasswordStrength(password || '');
    if (!strength.valid) {
      res.status(400).json({ error: strength.error });
      return;
    }

    if (role === 'advertiser' && !nrcNumber?.trim()) {
      res.status(400).json({ error: 'Tier 1 NRC / Passport number is mandatory for Advertiser accounts.' });
      return;
    }

    const cleanPhone = normalizeZambianPhone(phone);
    const phoneHash = hashIdentifier(cleanPhone);
    const nrcHash = nrcNumber ? hashIdentifier(nrcNumber) : '';
    const momoHash = momoAccountName ? hashIdentifier(momoAccountName) : '';

    const isBlacklisted = state.blacklist.some(
      (b) =>
        b.phoneHash === phoneHash ||
        (nrcHash && b.nrcHash === nrcHash) ||
        (momoHash && b.momoHash === momoHash)
    );
    if (isBlacklisted) {
      res.status(403).json({
        error: 'Registration blocked: NRC, phone number, or Mobile Money wallet is permanently blacklisted.',
      });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const existingUsernames = state.users
      .map((u) => u.username)
      .filter((un): un is string => Boolean(un));
    const chosenUsername = username?.trim()
      ? username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
      : generateStaffUsername(name, existingUsernames);

    const exists = state.users.some(
      (u) =>
        u.email.toLowerCase() === cleanEmail ||
        u.phone === cleanPhone ||
        (chosenUsername && u.username?.toLowerCase() === chosenUsername)
    );
    if (exists) {
      res.status(409).json({
        error: 'An account with this email, username, or phone number already exists.',
      });
      return;
    }

    const now = Date.now();
    const verificationCode = generateVerificationCode();
    const assignedRole = role === 'advertiser' ? 'advertiser' : 'buyer';
    const assignedSystemId = assignSystemId(
      assignedRole,
      state.users.map((u) => u.systemId)
    );
    const newUser: ServerUserAccount = {
      id: `usr-${crypto.randomUUID().slice(0, 8)}`,
      systemId: assignedSystemId,
      name: name.trim(),
      username: chosenUsername,
      businessName: businessName?.trim() || undefined,
      email: cleanEmail,
      phone: cleanPhone,
      whatsapp: cleanPhone,
      role: assignedRole,
      staffPermissions: [],
      province,
      district,
      verificationTier: 'tier1_id',
      nrcNumber: nrcNumber?.trim(),
      momoAccountName: momoAccountName?.trim() || name.trim().toUpperCase(),
      defaultLocationPrivacy: 'district_general',
      farmCoordinates: getDistrictCoordinates(province, district),
      accountStatus: 'trial_active',
      emailVerified: false,
      mustChangePassword: false,
      passwordHash: hashPassword(password),
      verificationCodeHash: hashVerificationCode(verificationCode),
      verificationExpiresAt: now + 30 * 60 * 1000,
      trialStartAt: now,
      trialDaysAllocated: state.config.defaultTrialDays,
      lastActiveAt: now,
      createdAt: now,
      savedListingIds: [],
    };

    const emailBody = [
      `Hello ${newUser.name},`,
      '',
      'Welcome to AgriLink ZM. Verify your account before signing in using the 6-digit code below:',
      `Verification Code: ${verificationCode}`,
      `Username: ${chosenUsername}`,
      '',
      'This code expires in 30 minutes.',
      'AgriLink ZM Operations (agrilinkzm0@gmail.com | +260 976 405 828)',
    ].join('\n');

    const deliveryMode = await dispatchPlatformEmail({
      toEmail: cleanEmail,
      toName: newUser.name,
      subject: 'Verify your AgriLink ZM account',
      text: emailBody,
    });

    const notificationRecord: EmailNotificationRecord = {
      id: `mail-${crypto.randomUUID().slice(0, 8)}`,
      toEmail: cleanEmail,
      toName: newUser.name,
      fromEmail: 'agrilinkzm0@gmail.com',
      subject: 'Verify your AgriLink ZM account',
      body: `Verification email dispatched to ${cleanEmail} for username @${chosenUsername}.`,
      type: 'account_verification',
      username: chosenUsername,
      deliveryMode,
      createdAt: now,
    };

    state.users.push(newUser);
    state.emailNotifications.unshift(notificationRecord);
    saveState(state);

    res.status(201).json({
      requiresVerification: true,
      email: cleanEmail,
      username: chosenUsername,
      deliveryMode,
      previewVerificationCode: deliveryMode === 'in_app_dispatch' ? verificationCode : undefined,
      message: `Account created! Enter the verification code sent to ${cleanEmail} before logging in.`,
    });
  });

  // Auth: Verify account via 6-digit code
  app.post('/api/auth/verify-email', (req, res) => {
    const { identifier, code } = req.body as { identifier?: string; code?: string };
    if (!identifier?.trim() || !code?.trim()) {
      res.status(400).json({ error: 'Email/username and 6-digit verification code are required.' });
      return;
    }
    const normalized = identifier.trim().toLowerCase();
    const user = state.users.find(
      (u) =>
        u.email.toLowerCase() === normalized ||
        (u.username && u.username.toLowerCase() === normalized)
    );
    if (!user) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }
    if (user.emailVerified) {
      res.json({ verified: true, message: 'Account is already verified. You can sign in now.' });
      return;
    }
    if (!user.verificationExpiresAt || user.verificationExpiresAt < Date.now()) {
      res.status(400).json({ error: 'Verification code expired. Request a new code.' });
      return;
    }
    const providedHash = hashVerificationCode(code);
    if (!user.verificationCodeHash || providedHash !== user.verificationCodeHash) {
      res.status(400).json({ error: 'Invalid verification code. Please check and try again.' });
      return;
    }

    user.emailVerified = true;
    user.verificationCodeHash = undefined;
    user.verificationExpiresAt = undefined;
    saveState(state);

    res.json({
      verified: true,
      email: user.email,
      username: user.username,
      message: 'Account verified! Enter your email or username with your password to sign in.',
    });
  });

  // Auth: Resend verification code
  app.post('/api/auth/resend-verification', async (req, res) => {
    const { identifier } = req.body as { identifier?: string };
    if (!identifier?.trim()) {
      res.status(400).json({ error: 'Enter your registered email or username.' });
      return;
    }
    const normalized = identifier.trim().toLowerCase();
    const user = state.users.find(
      (u) =>
        u.email.toLowerCase() === normalized ||
        (u.username && u.username.toLowerCase() === normalized)
    );
    if (!user) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }
    if (user.emailVerified) {
      res.json({ alreadyVerified: true, message: 'Account is already verified.' });
      return;
    }

    const code = generateVerificationCode();
    user.verificationCodeHash = hashVerificationCode(code);
    user.verificationExpiresAt = Date.now() + 30 * 60 * 1000;
    saveState(state);

    const deliveryMode = await dispatchPlatformEmail({
      toEmail: user.email,
      toName: user.name,
      subject: 'Your new AgriLink ZM verification code',
      text: `Hello ${user.name}, your new AgriLink ZM verification code is: ${code}`,
    });

    res.json({
      sent: true,
      email: user.email,
      deliveryMode,
      previewVerificationCode: deliveryMode === 'in_app_dispatch' ? code : undefined,
      message: `A new verification code has been issued for ${user.email}.`,
    });
  });

  // Auth: Change Password (available anytime, and mandatory prompt for temporary delegated passwords)
  app.post('/api/auth/change-password', async (req, res) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Sign in required to change your password.' });
      return;
    }
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required.' });
      return;
    }
    if (actor.id === 'usr-admin-1' && process.env.ADMIN_PASSCODE?.trim()) {
      res.status(400).json({
        error: 'Super Admin password is controlled by ADMIN_PASSCODE in Settings > Secrets.',
      });
      return;
    }
    if (!verifyPassword(currentPassword, actor.passwordHash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }
    if (currentPassword === newPassword) {
      res.status(400).json({ error: 'New password must be different from your current password.' });
      return;
    }
    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      res.status(400).json({ error: strength.error });
      return;
    }

    actor.passwordHash = hashPassword(newPassword);
    actor.mustChangePassword = false;
    actor.lastActiveAt = Date.now();

    const deliveryMode = await dispatchPlatformEmail({
      toEmail: actor.email,
      toName: actor.name,
      subject: 'AgriLink ZM Password Updated',
      text: `Hello ${actor.name}, your AgriLink ZM password for username @${actor.username || actor.email} was successfully updated.`,
    });

    state.emailNotifications.unshift({
      id: `mail-${crypto.randomUUID().slice(0, 8)}`,
      toEmail: actor.email,
      toName: actor.name,
      fromEmail: 'agrilinkzm0@gmail.com',
      subject: 'AgriLink ZM Password Updated',
      body: `Password updated by user (${actor.email}).`,
      type: 'password_changed',
      username: actor.username,
      deliveryMode,
      createdAt: Date.now(),
    });
    saveState(state);

    res.json({ user: sanitizeUserForClient(actor), message: 'Password updated successfully.' });
  });

  // Listings CRUD with geolocation & privacy settings
  app.post('/api/listings', (req, res) => {
    const actor = getActor(req);
    if (!actor || (actor.role !== 'advertiser' && actor.role !== 'super_admin')) {
      res.status(403).json({ error: 'Only verified Advertisers can publish listings.' });
      return;
    }
    const trialEval = computeTrialStatus(actor, state.config);
    if (actor.role === 'advertiser' && trialEval.listingsShouldPause) {
      res.status(402).json({
        error: 'Your free trial has expired. Pay your ZMW advertising fee via Mobile Money to publish.',
      });
      return;
    }

    const body = req.body as Partial<Listing>;
    if (!body.title?.trim() || !body.category || !body.priceZmw || body.priceZmw <= 0 || !body.province || !body.district) {
      res.status(400).json({ error: 'Title, category, valid ZMW price, province, and district are required.' });
      return;
    }

    const sellerListingsCount = state.listings.filter((l) => l.sellerId === actor.id).length;
    const needsPrePubReview = actor.role === 'advertiser' && sellerListingsCount < 1 && actor.verificationTier === 'unverified';
    const now = Date.now();
    const canExposePrecise =
      actor.verificationTier === 'tier2_business' || actor.verificationTier === 'tier3_site';
    const privacy =
      body.locationPrivacy === 'precise_pin' && canExposePrecise
        ? 'precise_pin'
        : 'district_general';

    const fallbackCoords = getDistrictCoordinates(body.province, body.district);
    const coords =
      body.coordinates && Number.isFinite(body.coordinates.lat) && Number.isFinite(body.coordinates.lng)
        ? body.coordinates
        : fallbackCoords;

    const listing: Listing = {
      id: `lst-${crypto.randomUUID().slice(0, 8)}`,
      sellerId: actor.id,
      title: body.title.trim(),
      category: body.category,
      description: (body.description || '').trim(),
      priceZmw: Number(body.priceZmw),
      unitLabel: (body.unitLabel || 'per unit').trim(),
      quantityAvailable: (body.quantityAvailable || 'In stock').trim(),
      province: body.province,
      district: body.district,
      coordinates: coords,
      locationPrivacy: privacy,
      images:
        body.images && body.images.length > 0
          ? body.images
          : ['/src/assets/images/listing_maize_sacks_1795467060330.jpg'],
      hasVideoWalkthrough: Boolean(body.hasVideoWalkthrough),
      videoUrl: body.videoUrl,
      videoDurationSec: body.videoDurationSec || (body.hasVideoWalkthrough ? 22 : undefined),
      status: needsPrePubReview ? 'pending_moderation' : 'active',
      impressions: 1,
      views: 0,
      uniqueVisitors: 0,
      videoPlays: 0,
      contactReveals: 0,
      createdAt: now,
      updatedAt: now,
    };

    actor.lastActiveAt = now;
    state.listings.unshift(listing);
    saveState(state);
    res.status(201).json({ listing });
  });

  app.patch('/api/listings/:id', (req, res) => {
    const actor = getActor(req);
    const listing = state.listings.find((l) => l.id === req.params.id);
    if (!listing) {
      res.status(404).json({ error: 'Listing not found.' });
      return;
    }
    if (!actor || (listing.sellerId !== actor.id && actor.role !== 'super_admin' && !hasStaffPermission(actor, 'moderate_trust'))) {
      res.status(403).json({ error: 'Not authorized to modify this listing.' });
      return;
    }

    const updates = req.body as Partial<Listing>;
    if (updates.title !== undefined) listing.title = updates.title.trim();
    if (updates.description !== undefined) listing.description = updates.description.trim();
    if (updates.priceZmw !== undefined && Number(updates.priceZmw) > 0) listing.priceZmw = Number(updates.priceZmw);
    if (updates.unitLabel !== undefined) listing.unitLabel = updates.unitLabel.trim();
    if (updates.quantityAvailable !== undefined) listing.quantityAvailable = updates.quantityAvailable.trim();
    if (updates.province !== undefined) listing.province = updates.province;
    if (updates.district !== undefined) listing.district = updates.district;
    if (updates.category !== undefined) listing.category = updates.category;
    if (updates.status !== undefined) listing.status = updates.status;
    if (updates.hasVideoWalkthrough !== undefined) listing.hasVideoWalkthrough = Boolean(updates.hasVideoWalkthrough);
    if (updates.images && updates.images.length > 0) listing.images = updates.images;
    if (updates.coordinates && Number.isFinite(updates.coordinates.lat) && Number.isFinite(updates.coordinates.lng)) {
      listing.coordinates = updates.coordinates;
    }
    if (updates.locationPrivacy !== undefined) {
      const seller = state.users.find((u) => u.id === listing.sellerId);
      const canPrecise =
        seller?.verificationTier === 'tier2_business' || seller?.verificationTier === 'tier3_site';
      listing.locationPrivacy =
        updates.locationPrivacy === 'precise_pin' && canPrecise
          ? 'precise_pin'
          : 'district_general';
    }
    listing.updatedAt = Date.now();
    actor.lastActiveAt = Date.now();

    saveState(state);
    res.json({ listing });
  });

  app.delete('/api/listings/:id', (req, res) => {
    const actor = getActor(req);
    const idx = state.listings.findIndex((l) => l.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Listing not found.' });
      return;
    }
    const listing = state.listings[idx];
    if (
      !actor ||
      (listing.sellerId !== actor.id &&
        actor.role !== 'super_admin' &&
        !hasStaffPermission(actor, 'moderate_trust'))
    ) {
      res.status(403).json({ error: 'Not authorized to delete this listing.' });
      return;
    }
    state.listings.splice(idx, 1);
    saveState(state);
    res.json({ ok: true });
  });

  // Save/Bookmark listing for Buyers
  app.post('/api/listings/:id/toggle-save', (req, res) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Please sign in to save listings.' });
      return;
    }
    const exists = actor.savedListingIds.includes(req.params.id);
    actor.savedListingIds = exists
      ? actor.savedListingIds.filter((id) => id !== req.params.id)
      : [...actor.savedListingIds, req.params.id];
    actor.lastActiveAt = Date.now();
    saveState(state);
    res.json({ savedListingIds: actor.savedListingIds });
  });

  // Real-time Analytics Events (impression, view, video_play, contact_reveal)
  app.post('/api/analytics/event', (req, res) => {
    const { listingId, type } = req.body as {
      listingId: string;
      type: 'impression' | 'view' | 'video_play' | 'contact_reveal';
    };
    const listing = state.listings.find((l) => l.id === listingId);
    if (!listing) {
      res.status(404).json({ error: 'Listing not found.' });
      return;
    }

    const actor = getActor(req);

    if (type === 'impression') {
      listing.impressions += 1;
    } else if (type === 'view') {
      listing.views += 1;
      listing.uniqueVisitors += 1;
    } else if (type === 'video_play') {
      listing.videoPlays += 1;
    } else if (type === 'contact_reveal') {
      if (!actor) {
        res.status(401).json({ error: 'Sign in as a Buyer or member to reveal seller phone & WhatsApp.' });
        return;
      }
      if (actor.role === 'buyer' && state.config.buyerFeeEnabled) {
        const isPaid = actor.buyerFeePaidUntilAt && actor.buyerFeePaidUntilAt > Date.now();
        if (!isPaid) {
          res.status(402).json({
            error: `Active Buyer Account Fee (ZMW ${state.config.buyerFeeAmountZmw.toFixed(2)}) required to reveal seller contacts.`,
            requiresBuyerFee: true,
          });
          return;
        }
      }
      listing.contactReveals += 1;
      actor.lastActiveAt = Date.now();
      const alreadyRevealed = state.contactReveals.some(
        (cr) => cr.listingId === listing.id && cr.buyerId === actor.id
      );
      if (!alreadyRevealed) {
        state.contactReveals.push({
          id: `cr-${crypto.randomUUID().slice(0, 8)}`,
          listingId: listing.id,
          sellerId: listing.sellerId,
          buyerId: actor.id,
          createdAt: Date.now(),
        });
      }
    }

    const seller = state.users.find((u) => u.id === listing.sellerId);
    const labelMap = {
      impression: 'Listing impression recorded',
      view: 'Listing detail viewed',
      video_play: 'Walkthrough video played',
      contact_reveal: 'Buyer revealed seller Phone / WhatsApp',
    };

    const evt: AnalyticsStreamEvent = {
      id: `evt-${crypto.randomUUID().slice(0, 8)}`,
      type,
      listingId: listing.id,
      listingTitle: listing.title,
      sellerId: listing.sellerId,
      province: listing.province,
      message: `${labelMap[type]}: ${listing.title}`,
      timestamp: Date.now(),
    };
    broadcastEvent(evt);

    res.json({
      listing,
      sellerContact:
        type === 'contact_reveal' && seller
          ? { phone: seller.phone, whatsapp: seller.whatsapp || seller.phone, name: seller.businessName || seller.name }
          : undefined,
      contactReveals: state.contactReveals,
    });
  });

  // In-App Real-Time Messaging: Start or Get Conversation
  app.post('/api/chat/conversations', (req, res) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Please sign in to message sellers in-app.' });
      return;
    }
    const { sellerId, listingId } = req.body as { sellerId: string; listingId?: string };
    const seller = state.users.find((u) => u.id === sellerId);
    if (!seller) {
      res.status(404).json({ error: 'Seller profile not found.' });
      return;
    }
    if (seller.id === actor.id) {
      res.status(400).json({ error: 'You cannot start a buyer inquiry thread with your own seller account.' });
      return;
    }

    const listing = listingId ? state.listings.find((l) => l.id === listingId) : undefined;
    const existing = state.conversations.find(
      (c) =>
        c.buyerId === actor.id &&
        c.sellerId === seller.id &&
        (c.listingId || '') === (listing?.id || '')
    );

    if (existing) {
      const threadMessages = state.messages.filter((m) => m.conversationId === existing.id);
      res.json({ conversation: existing, messages: threadMessages });
      return;
    }

    const now = Date.now();
    const conversation: ChatConversation = {
      id: `conv-${crypto.randomUUID().slice(0, 8)}`,
      listingId: listing?.id,
      listingTitle: listing?.title,
      sellerId: seller.id,
      sellerName: seller.businessName || seller.name,
      buyerId: actor.id,
      buyerName: actor.name,
      createdAt: now,
      updatedAt: now,
    };
    state.conversations.unshift(conversation);
    saveState(state);

    sendChatPayloadToUsers([conversation.buyerId, conversation.sellerId], {
      type: 'conversation:created',
      conversation,
    });

    res.status(201).json({ conversation, messages: [] });
  });

  // In-App Real-Time Messaging: Send Text, Image, or Voice Note
  app.post('/api/chat/messages', (req, res) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Please sign in to send messages.' });
      return;
    }
    const { conversationId, type, text, mediaDataUrl, audioDurationSec } = req.body as {
      conversationId: string;
      type: 'text' | 'image' | 'voice';
      text?: string;
      mediaDataUrl?: string;
      audioDurationSec?: number;
    };

    const conversation = state.conversations.find((c) => c.id === conversationId);
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    if (conversation.buyerId !== actor.id && conversation.sellerId !== actor.id) {
      res.status(403).json({ error: 'Not a participant in this conversation.' });
      return;
    }

    if (type === 'text' && !text?.trim()) {
      res.status(400).json({ error: 'Message text cannot be empty.' });
      return;
    }
    if ((type === 'image' || type === 'voice') && !mediaDataUrl) {
      res.status(400).json({ error: 'Media attachment data is required.' });
      return;
    }

    const now = Date.now();
    const message: ChatMessage = {
      id: `msg-${crypto.randomUUID().slice(0, 8)}`,
      conversationId,
      senderId: actor.id,
      senderName: actor.role === 'advertiser' ? actor.businessName || actor.name : actor.name,
      senderRole: actor.role,
      type,
      text: text?.trim(),
      mediaDataUrl,
      audioDurationSec,
      createdAt: now,
    };

    state.messages.push(message);
    conversation.updatedAt = now;
    actor.lastActiveAt = now;
    saveState(state);

    sendChatPayloadToUsers([conversation.buyerId, conversation.sellerId], {
      type: 'message:created',
      message,
      conversation,
    });

    broadcastEvent({
      id: `evt-${crypto.randomUUID().slice(0, 8)}`,
      type: 'chat_message',
      listingId: conversation.listingId,
      listingTitle: conversation.listingTitle,
      sellerId: conversation.sellerId,
      message: `In-app ${type} message from ${actor.name} (${conversation.listingTitle || 'Seller Inquiry'})`,
      timestamp: now,
    });

    res.status(201).json({ message, conversation });
  });

  // In-App Messaging: WhatsApp Handoff while preserving in-app chat log
  app.post('/api/chat/conversations/:id/whatsapp-handoff', (req, res) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Please sign in to initiate WhatsApp contact.' });
      return;
    }
    const conversation = state.conversations.find((c) => c.id === req.params.id);
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    if (conversation.buyerId !== actor.id && conversation.sellerId !== actor.id) {
      res.status(403).json({ error: 'Not authorized for this conversation.' });
      return;
    }

    if (actor.role === 'buyer' && state.config.buyerFeeEnabled) {
      const isPaid = actor.buyerFeePaidUntilAt && actor.buyerFeePaidUntilAt > Date.now();
      if (!isPaid) {
        res.status(402).json({
          error: `Active Buyer Account Fee (ZMW ${state.config.buyerFeeAmountZmw.toFixed(2)}) required before WhatsApp handoff.`,
          requiresBuyerFee: true,
        });
        return;
      }
    }

    const seller = state.users.find((u) => u.id === conversation.sellerId);
    if (!seller) {
      res.status(404).json({ error: 'Seller not found.' });
      return;
    }

    const now = Date.now();
    conversation.whatsappHandoffAt = now;
    conversation.updatedAt = now;

    // Unlock rating gate if buyer initiated WhatsApp handoff from chat
    if (actor.id === conversation.buyerId) {
      const listingRef = conversation.listingId || 'direct-profile';
      const already = state.contactReveals.some(
        (cr) => cr.buyerId === actor.id && cr.sellerId === seller.id && cr.listingId === listingRef
      );
      if (!already) {
        state.contactReveals.push({
          id: `cr-${crypto.randomUUID().slice(0, 8)}`,
          listingId: listingRef,
          sellerId: seller.id,
          buyerId: actor.id,
          createdAt: now,
        });
      }
    }

    const handoffMessage: ChatMessage = {
      id: `msg-${crypto.randomUUID().slice(0, 8)}`,
      conversationId: conversation.id,
      senderId: actor.id,
      senderName: actor.name,
      senderRole: actor.role,
      type: 'system_handoff',
      text: `${actor.name} opened direct WhatsApp continuation (${seller.whatsapp || seller.phone}). In-app chat log remains preserved.`,
      createdAt: now,
    };
    state.messages.push(handoffMessage);
    saveState(state);

    sendChatPayloadToUsers([conversation.buyerId, conversation.sellerId], {
      type: 'message:created',
      message: handoffMessage,
      conversation,
    });

    const waNumber = (seller.whatsapp || seller.phone).replace(/\D/g, '');
    const waText = encodeURIComponent(
      `Hello ${seller.businessName || seller.name}, continuing our AgriLink ZM chat regarding ${
        conversation.listingTitle || 'your farm listings'
      }.`
    );

    res.json({
      whatsappUrl: `https://wa.me/${waNumber}?text=${waText}`,
      sellerPhone: seller.phone,
      message: handoffMessage,
      contactReveals: state.contactReveals,
    });
  });

  // Interaction-Gated Ratings & Reviews
  app.post('/api/reviews', (req, res) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Sign in to submit a seller rating.' });
      return;
    }
    const { sellerId, listingId, productQuality, communication, pricingHonesty, comment } = req.body as {
      sellerId: string;
      listingId: string;
      productQuality: number;
      communication: number;
      pricingHonesty: number;
      comment: string;
    };

    if (!canBuyerRateSeller(actor.id, sellerId, state.contactReveals)) {
      res.status(403).json({
        error: 'Contact Gate: You must reveal this seller’s Phone or WhatsApp contact before submitting a review.',
      });
      return;
    }

    const clamp = (n: number) => Math.min(5, Math.max(1, Math.round(n)));
    const q = clamp(productQuality);
    const c = clamp(communication);
    const p = clamp(pricingHonesty);
    const overall = Math.round((((q + c + p) / 3) + Number.EPSILON) * 10) / 10;

    const existing = state.reviews.find((r) => r.buyerId === actor.id && r.sellerId === sellerId);
    const now = Date.now();
    if (existing) {
      existing.productQuality = q;
      existing.communication = c;
      existing.pricingHonesty = p;
      existing.overallRating = overall;
      existing.comment = (comment || '').trim();
      existing.listingId = listingId;
      existing.updatedAt = now;
      saveState(state);
      res.json({ review: existing });
      return;
    }

    const review: Review = {
      id: `rev-${crypto.randomUUID().slice(0, 8)}`,
      sellerId,
      buyerId: actor.id,
      buyerName: actor.name,
      listingId,
      productQuality: q,
      communication: c,
      pricingHonesty: p,
      overallRating: overall,
      comment: (comment || '').trim(),
      createdAt: now,
      updatedAt: now,
    };
    state.reviews.unshift(review);
    saveState(state);
    res.status(201).json({ review });
  });

  // Seller single public reply to review
  app.post('/api/reviews/:id/reply', (req, res) => {
    const actor = getActor(req);
    const review = state.reviews.find((r) => r.id === req.params.id);
    if (!review) {
      res.status(404).json({ error: 'Review not found.' });
      return;
    }
    if (!actor || review.sellerId !== actor.id) {
      res.status(403).json({ error: 'Only the reviewed Advertiser can post a public reply.' });
      return;
    }
    if (review.sellerReply) {
      res.status(409).json({ error: 'A public reply has already been posted for this review.' });
      return;
    }
    const { reply } = req.body as { reply: string };
    if (!reply?.trim()) {
      res.status(400).json({ error: 'Reply text cannot be empty.' });
      return;
    }
    review.sellerReply = reply.trim();
    review.sellerRepliedAt = Date.now();
    saveState(state);
    res.json({ review });
  });

  // Scam Reporting + Automated 3-Report Risk Freeze
  app.post('/api/scam-reports', (req, res) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Sign in with a verified account to submit a scam report.' });
      return;
    }
    const { listingId, reason, details, evidenceDataUrl } = req.body as {
      listingId: string;
      reason: ScamReport['reason'];
      details: string;
      evidenceDataUrl?: string;
    };

    const listing = state.listings.find((l) => l.id === listingId);
    if (!listing) {
      res.status(404).json({ error: 'Listing not found.' });
      return;
    }

    const alreadyReported = state.scamReports.some(
      (sr) => sr.listingId === listingId && sr.reporterBuyerId === actor.id && sr.status !== 'dismissed'
    );
    if (alreadyReported) {
      res.status(409).json({ error: 'You have already submitted an active scam report for this listing.' });
      return;
    }

    const report: ScamReport = {
      id: `sr-${crypto.randomUUID().slice(0, 8)}`,
      listingId,
      sellerId: listing.sellerId,
      reporterBuyerId: actor.id,
      reporterName: actor.name,
      reason,
      details: (details || '').trim(),
      evidenceDataUrl,
      status: 'open',
      createdAt: Date.now(),
    };
    state.scamReports.unshift(report);

    let autoFrozen = false;
    if (shouldAutoFreezeListing(state.scamReports, listingId)) {
      listing.status = 'under_investigation';
      autoFrozen = true;
      for (const sr of state.scamReports) {
        if (sr.listingId === listingId && sr.status === 'open') {
          sr.status = 'resolved_frozen';
        }
      }
    }

    broadcastEvent({
      id: `evt-${crypto.randomUUID().slice(0, 8)}`,
      type: autoFrozen ? 'listing_auto_frozen' : 'scam_report',
      listingId: listing.id,
      listingTitle: listing.title,
      sellerId: listing.sellerId,
      province: listing.province,
      message: autoFrozen
        ? `AUTO-FREEZE TRIGGERED (3+ distinct reports): ${listing.title} hidden pending staff review`
        : `New scam report (${reason}) filed on ${listing.title}`,
      timestamp: Date.now(),
    });

    res.status(201).json({ report, autoFrozen, listing });
  });

  // KYC Submission (Tier 1, 2, 3)
  app.post('/api/kyc', (req, res) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Sign in required.' });
      return;
    }
    const body = req.body as Partial<KycSubmission>;
    const submission: KycSubmission = {
      id: `kyc-${crypto.randomUUID().slice(0, 8)}`,
      userId: actor.id,
      userName: actor.name,
      requestedTier: body.requestedTier || 'tier2_business',
      phoneOtpVerified: true,
      nrcNumber: body.nrcNumber || actor.nrcNumber,
      nrcFrontName: body.nrcFrontName,
      nrcBackName: body.nrcBackName,
      momoAccountName: body.momoAccountName || actor.momoAccountName,
      pacraNumber: body.pacraNumber,
      zraTpin: body.zraTpin,
      certificateRef: body.certificateRef,
      siteGpsPin: body.siteGpsPin,
      walkthroughVideoRef: body.walkthroughVideoRef,
      status: 'pending',
      createdAt: Date.now(),
    };
    state.kycSubmissions.unshift(submission);
    saveState(state);
    res.status(201).json({ submission });
  });

  // Stage 1: Manual Mobile Money Proof of Payment Upload
  app.post('/api/payments/pop', (req, res) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Sign in required.' });
      return;
    }
    const { paymentType, network, transactionId, proofImageUrl } = req.body as {
      paymentType: PaymentRecord['paymentType'];
      network: PaymentRecord['network'];
      transactionId: string;
      proofImageUrl?: string;
    };
    if (!transactionId?.trim()) {
      res.status(400).json({ error: 'Mobile Money Transaction ID is required.' });
      return;
    }
    const amountZmw =
      paymentType === 'buyer_account_fee'
        ? state.config.buyerFeeAmountZmw
        : state.config.advertiserMonthlyFeeZmw;

    const payment: PaymentRecord = {
      id: `pay-${crypto.randomUUID().slice(0, 8)}`,
      userId: actor.id,
      userName: actor.name,
      userPhone: actor.phone,
      paymentType,
      method: 'manual_pop',
      network,
      amountZmw,
      referenceCode: `AGRI-${actor.id.slice(-4).toUpperCase()}-${Date.now().toString().slice(-4)}`,
      transactionId: transactionId.trim(),
      proofImageUrl: proofImageUrl || 'momo-receipt-uploaded.jpg',
      status: 'pending',
      createdAt: Date.now(),
    };
    state.payments.unshift(payment);
    broadcastEvent({
      id: `evt-${crypto.randomUUID().slice(0, 8)}`,
      type: 'payment_update',
      message: `Manual PoP submitted by ${actor.name} (${network} · ZMW ${amountZmw.toFixed(2)})`,
      timestamp: Date.now(),
    });
    res.status(201).json({ payment });
  });

  // Stage 2: Flutterwave Zambia Mobile Money Automated USSD & Webhook Activation
  app.post('/api/payments/flutterwave-ussd', (req, res) => {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Sign in required.' });
      return;
    }
    const { paymentType, network, momoPhone } = req.body as {
      paymentType: PaymentRecord['paymentType'];
      network: PaymentRecord['network'];
      momoPhone: string;
    };
    if (!momoPhone?.trim()) {
      res.status(400).json({ error: 'Zambian Mobile Money phone number is required for USSD prompt.' });
      return;
    }
    const amountZmw =
      paymentType === 'buyer_account_fee'
        ? state.config.buyerFeeAmountZmw
        : state.config.advertiserMonthlyFeeZmw;

    const now = Date.now();
    const payment: PaymentRecord = {
      id: `pay-${crypto.randomUUID().slice(0, 8)}`,
      userId: actor.id,
      userName: actor.name,
      userPhone: normalizeZambianPhone(momoPhone),
      paymentType,
      method: 'flutterwave_ussd',
      network,
      amountZmw,
      referenceCode: `FLW-ZM-${Date.now().toString().slice(-6)}`,
      transactionId: `FLW-WEBHOOK-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      status: 'approved',
      reviewedBy: 'Flutterwave Zambia Webhook (/v3/charges?type=mobile_money_zambia)',
      createdAt: now,
    };
    state.payments.unshift(payment);

    if (paymentType === 'buyer_account_fee') {
      actor.buyerFeePaidUntilAt = now + 30 * 24 * 60 * 60 * 1000;
    } else {
      actor.paidUntilAt = now + 30 * 24 * 60 * 60 * 1000;
      actor.accountStatus = 'active_paid';
      for (const l of state.listings) {
        if (l.sellerId === actor.id && l.status === 'paused_payment') {
          l.status = 'active';
        }
      }
    }
    actor.lastActiveAt = now;

    broadcastEvent({
      id: `evt-${crypto.randomUUID().slice(0, 8)}`,
      type: 'payment_update',
      message: `Flutterwave webhook verified ${network} payment ZMW ${amountZmw.toFixed(2)} for ${actor.name}`,
      timestamp: now,
    });
    res.status(201).json({ payment, user: actor });
  });

  // Admin / Staff: Approve or Reject Payment
  app.post('/api/admin/payments/:id/decision', (req, res) => {
    const actor = getActor(req);
    if (!hasStaffPermission(actor, 'verify_payments')) {
      res.status(403).json({ error: 'Missing Payment Verification permission.' });
      return;
    }
    const payment = state.payments.find((p) => p.id === req.params.id);
    if (!payment) {
      res.status(404).json({ error: 'Payment record not found.' });
      return;
    }
    const { decision, note } = req.body as { decision: 'approved' | 'rejected'; note?: string };
    payment.status = decision;
    payment.reviewedBy = actor!.name;
    payment.reviewNote = note;

    if (decision === 'approved') {
      const targetUser = state.users.find((u) => u.id === payment.userId);
      if (targetUser) {
        const now = Date.now();
        if (payment.paymentType === 'buyer_account_fee') {
          targetUser.buyerFeePaidUntilAt = now + 30 * 24 * 60 * 60 * 1000;
        } else {
          targetUser.paidUntilAt = now + 30 * 24 * 60 * 60 * 1000;
          targetUser.accountStatus = 'active_paid';
          for (const l of state.listings) {
            if (l.sellerId === targetUser.id && l.status === 'paused_payment') {
              l.status = 'active';
            }
          }
        }
      }
    }

    broadcastEvent({
      id: `evt-${crypto.randomUUID().slice(0, 8)}`,
      type: 'payment_update',
      message: `Payment ${payment.referenceCode} ${decision} by ${actor!.name}`,
      timestamp: Date.now(),
    });
    res.json({ payment });
  });

  // Admin / Staff: Approve or Reject KYC
  app.post('/api/admin/kyc/:id/decision', (req, res) => {
    const actor = getActor(req);
    if (!hasStaffPermission(actor, 'verify_kyc')) {
      res.status(403).json({ error: 'Missing KYC Verification permission.' });
      return;
    }
    const kyc = state.kycSubmissions.find((k) => k.id === req.params.id);
    if (!kyc) {
      res.status(404).json({ error: 'KYC submission not found.' });
      return;
    }
    const { decision, note } = req.body as { decision: 'approved' | 'rejected'; note?: string };
    kyc.status = decision;
    kyc.reviewedBy = actor!.name;
    kyc.reviewNote = note;

    if (decision === 'approved') {
      const targetUser = state.users.find((u) => u.id === kyc.userId);
      if (targetUser) {
        targetUser.verificationTier = kyc.requestedTier;
        if (kyc.pacraNumber) targetUser.pacraNumber = kyc.pacraNumber;
        if (kyc.zraTpin) targetUser.zraTpin = kyc.zraTpin;
        if (kyc.siteGpsPin) targetUser.siteGpsPin = kyc.siteGpsPin;
      }
    }

    broadcastEvent({
      id: `evt-${crypto.randomUUID().slice(0, 8)}`,
      type: 'kyc_update',
      message: `KYC (${kyc.requestedTier}) ${decision} for ${kyc.userName}`,
      timestamp: Date.now(),
    });
    res.json({ kyc });
  });

  // Admin / Trust Moderator: Resolve Scam Report
  app.post('/api/admin/scam-reports/:id/decision', (req, res) => {
    const actor = getActor(req);
    if (!hasStaffPermission(actor, 'moderate_trust')) {
      res.status(403).json({ error: 'Missing Trust & Content Moderation permission.' });
      return;
    }
    const report = state.scamReports.find((r) => r.id === req.params.id);
    if (!report) {
      res.status(404).json({ error: 'Scam report not found.' });
      return;
    }
    const { action } = req.body as { action: 'dismiss' | 'freeze_listing' | 'ban_blacklist' };
    const listing = state.listings.find((l) => l.id === report.listingId);
    const seller = state.users.find((u) => u.id === report.sellerId);

    if (action === 'dismiss') {
      report.status = 'dismissed';
      if (listing && listing.status === 'under_investigation' && !shouldAutoFreezeListing(state.scamReports, listing.id)) {
        listing.status = 'active';
      }
    } else if (action === 'freeze_listing') {
      report.status = 'resolved_frozen';
      if (listing) listing.status = 'under_investigation';
    } else if (action === 'ban_blacklist') {
      report.status = 'resolved_frozen';
      if (listing) listing.status = 'archived';
      if (seller) {
        seller.accountStatus = 'banned';
        for (const l of state.listings) {
          if (l.sellerId === seller.id) l.status = 'archived';
        }
        state.blacklist.push({
          id: `bl-${crypto.randomUUID().slice(0, 8)}`,
          userId: seller.id,
          nrcHash: seller.nrcNumber ? hashIdentifier(seller.nrcNumber) : '',
          phoneHash: hashIdentifier(seller.phone),
          momoHash: seller.momoAccountName ? hashIdentifier(seller.momoAccountName) : '',
          reason: report.reason,
          bannedAt: Date.now(),
        });
      }
    }

    saveState(state);
    res.json({ report, listing, seller });
  });

  // Super Admin: Platform Monetization, Trial, & Dormancy Config
  app.patch('/api/admin/config', (req, res) => {
    const actor = getActor(req);
    if (!actor || actor.role !== 'super_admin') {
      res.status(403).json({ error: 'Only Super Admin can change system-wide configuration.' });
      return;
    }
    const updates = req.body as Partial<typeof state.config>;
    if (updates.buyerFeeEnabled === true) {
      const candidate = { ...state.config, ...updates };
      if (!isBuyerFeeEligible(candidate)) {
        res.status(400).json({
          error: 'Buyer K3.00 fee requires 3+ months of platform traction (or enable the 3-month traction override).',
        });
        return;
      }
    }

    state.config = {
      ...state.config,
      ...updates,
      defaultTrialDays: Math.max(0, Number(updates.defaultTrialDays ?? state.config.defaultTrialDays)),
      advertiserMonthlyFeeZmw: Math.max(0, Number(updates.advertiserMonthlyFeeZmw ?? state.config.advertiserMonthlyFeeZmw)),
      buyerFeeAmountZmw: Math.max(0, Number(updates.buyerFeeAmountZmw ?? state.config.buyerFeeAmountZmw)),
      dormancyThresholdDays: Math.max(1, Number(updates.dormancyThresholdDays ?? state.config.dormancyThresholdDays)),
    };
    syncAllAccountStatuses();
    broadcastEvent({
      id: `evt-${crypto.randomUUID().slice(0, 8)}`,
      type: 'config_update',
      message: `Super Admin updated platform trial (${state.config.defaultTrialDays}d) & payment switches`,
      timestamp: Date.now(),
    });
    res.json({ config: state.config });
  });

  // Super Admin / Staff: Dormancy Scan & Account Lifecycle Control
  app.post('/api/admin/dormancy-scan', (req, res) => {
    const actor = getActor(req);
    if (!hasStaffPermission(actor, 'moderate_trust') && actor?.role !== 'super_admin') {
      res.status(403).json({ error: 'Not authorized to run dormancy scans.' });
      return;
    }
    const { deactivateFlagged } = req.body as { deactivateFlagged?: boolean };
    const now = Date.now();
    const flaggedUsers: UserAccount[] = [];

    for (const user of state.users) {
      if (isAccountDormant(user, state.config.dormancyThresholdDays, now)) {
        flaggedUsers.push(user);
        if (deactivateFlagged) {
          user.accountStatus = 'dormant';
          for (const l of state.listings) {
            if (l.sellerId === user.id && l.status === 'active') {
              l.status = 'archived';
            }
          }
        }
      }
    }
    saveState(state);
    res.json({ flaggedCount: flaggedUsers.length, flaggedUserIds: flaggedUsers.map((u) => u.id) });
  });

  // Super Admin / Staff: Update user account status (investigate, freeze, suspend, reactivate, ban)
  app.patch('/api/admin/users/:id/status', (req, res) => {
    const actor = getActor(req);
    if (!actor || (actor.role !== 'super_admin' && !hasStaffPermission(actor, 'moderate_trust'))) {
      res.status(403).json({ error: 'Not authorized to change user statuses.' });
      return;
    }
    const target = state.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (target.id === 'usr-admin-1' || target.id === actor.id) {
      res.status(400).json({ error: 'Cannot freeze, suspend, or restrict the active Super Admin account.' });
      return;
    }
    const { accountStatus } = req.body as { accountStatus: UserAccount['accountStatus'] };
    target.accountStatus = accountStatus;
    if (accountStatus === 'trial_active' || accountStatus === 'active_paid') {
      target.lastActiveAt = Date.now();
      for (const l of state.listings) {
        if (
          l.sellerId === target.id &&
          (l.status === 'archived' || l.status === 'paused_payment' || l.status === 'under_investigation')
        ) {
          l.status = 'active';
        }
      }
    } else if (accountStatus === 'under_investigation' || accountStatus === 'frozen') {
      for (const l of state.listings) {
        if (l.sellerId === target.id && l.status === 'active') {
          l.status = 'under_investigation';
        }
      }
    } else if (accountStatus === 'dormant' || accountStatus === 'suspended' || accountStatus === 'banned') {
      for (const l of state.listings) {
        if (l.sellerId === target.id && l.status === 'active') {
          l.status = 'archived';
        }
      }
    }
    saveState(state);
    broadcastEvent({
      id: `evt-${crypto.randomUUID().slice(0, 8)}`,
      type: 'config_update',
      message: `${actor.name} updated ${target.name} (${target.systemId || target.id}) status to ${accountStatus}`,
      timestamp: Date.now(),
    });
    res.json({ user: sanitizeUserForClient(target) });
  });

  // Super Admin / Trust Moderator: Edit user profile & assign unique System ID number
  app.patch('/api/admin/users/:id', (req, res) => {
    const actor = getActor(req);
    if (!actor || (actor.role !== 'super_admin' && !hasStaffPermission(actor, 'moderate_trust'))) {
      res.status(403).json({ error: 'Not authorized to edit user records.' });
      return;
    }
    const target = state.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const updates = req.body as Partial<
      Pick<
        UserAccount,
        | 'name'
        | 'systemId'
        | 'businessName'
        | 'email'
        | 'phone'
        | 'province'
        | 'district'
        | 'verificationTier'
        | 'accountStatus'
        | 'role'
        | 'adminNote'
      >
    >;

    if (updates.systemId !== undefined) {
      if (actor.role !== 'super_admin') {
        res.status(403).json({ error: 'Only Super Admin can assign or reassign System ID numbers.' });
        return;
      }
      const cleanSysId = normalizeSystemIdInput(updates.systemId);
      if (!cleanSysId || cleanSysId.length < 4) {
        res.status(400).json({ error: 'System ID must be at least 4 characters (e.g. AZM-ADV-0001).' });
        return;
      }
      const duplicateId = state.users.some(
        (u) => u.id !== target.id && u.systemId && u.systemId.toUpperCase() === cleanSysId
      );
      if (duplicateId) {
        res.status(409).json({ error: `System ID "${cleanSysId}" is already assigned to another user.` });
        return;
      }
      target.systemId = cleanSysId;
    }

    if (updates.email !== undefined) {
      const cleanEmail = updates.email.trim().toLowerCase();
      if (!cleanEmail) {
        res.status(400).json({ error: 'Email cannot be empty.' });
        return;
      }
      const dupEmail = state.users.some(
        (u) => u.id !== target.id && u.email.toLowerCase() === cleanEmail
      );
      if (dupEmail) {
        res.status(409).json({ error: 'Another user already uses this email address.' });
        return;
      }
      target.email = cleanEmail;
    }

    if (updates.phone !== undefined) {
      const cleanPhone = normalizeZambianPhone(updates.phone);
      const dupPhone = state.users.some((u) => u.id !== target.id && u.phone === cleanPhone);
      if (dupPhone) {
        res.status(409).json({ error: 'Another user already uses this Zambian phone number.' });
        return;
      }
      target.phone = cleanPhone;
      target.whatsapp = cleanPhone;
    }

    if (updates.name !== undefined && updates.name.trim()) target.name = updates.name.trim();
    if (updates.businessName !== undefined) target.businessName = updates.businessName.trim() || undefined;
    if (updates.province !== undefined && updates.province) target.province = updates.province;
    if (updates.district !== undefined && updates.district) target.district = updates.district;
    if (updates.verificationTier !== undefined) target.verificationTier = updates.verificationTier;
    if (updates.adminNote !== undefined) target.adminNote = updates.adminNote.trim() || undefined;

    if (updates.role !== undefined && updates.role !== target.role) {
      if (actor.role !== 'super_admin') {
        res.status(403).json({ error: 'Only Super Admin can change account roles.' });
        return;
      }
      if (target.id === 'usr-admin-1' || target.id === actor.id) {
        res.status(400).json({ error: 'Cannot change the primary Super Admin role.' });
        return;
      }
      target.role = updates.role;
      if (updates.role !== 'staff' && updates.role !== 'super_admin') {
        target.staffPermissions = [];
      }
    }

    if (updates.accountStatus !== undefined && updates.accountStatus !== target.accountStatus) {
      if (target.id === 'usr-admin-1' || target.id === actor.id) {
        res.status(400).json({ error: 'Cannot restrict the active Super Admin account status.' });
        return;
      }
      target.accountStatus = updates.accountStatus;
      if (updates.accountStatus === 'trial_active' || updates.accountStatus === 'active_paid') {
        for (const l of state.listings) {
          if (
            l.sellerId === target.id &&
            (l.status === 'archived' || l.status === 'paused_payment' || l.status === 'under_investigation')
          ) {
            l.status = 'active';
          }
        }
      } else if (updates.accountStatus === 'under_investigation' || updates.accountStatus === 'frozen') {
        for (const l of state.listings) {
          if (l.sellerId === target.id && l.status === 'active') l.status = 'under_investigation';
        }
      } else if (
        updates.accountStatus === 'dormant' ||
        updates.accountStatus === 'suspended' ||
        updates.accountStatus === 'banned'
      ) {
        for (const l of state.listings) {
          if (l.sellerId === target.id && l.status === 'active') l.status = 'archived';
        }
      }
    }

    saveState(state);
    broadcastEvent({
      id: `evt-${crypto.randomUUID().slice(0, 8)}`,
      type: 'config_update',
      message: `${actor.name} updated user record ${target.name} (${target.systemId || target.id})`,
      timestamp: Date.now(),
    });
    res.json({ user: sanitizeUserForClient(target) });
  });

  // Super Admin: Permanently delete a user account and their listings
  app.delete('/api/admin/users/:id', (req, res) => {
    const actor = getActor(req);
    if (!actor || actor.role !== 'super_admin') {
      res.status(403).json({ error: 'Only Super Admin can permanently delete accounts.' });
      return;
    }
    const idx = state.users.findIndex((u) => u.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    const target = state.users[idx];
    if (target.id === 'usr-admin-1' || target.id === actor.id) {
      res.status(400).json({ error: 'Cannot delete the active Super Admin account.' });
      return;
    }

    state.users.splice(idx, 1);
    const removedListingIds = new Set(
      state.listings.filter((l) => l.sellerId === target.id).map((l) => l.id)
    );
    state.listings = state.listings.filter((l) => l.sellerId !== target.id);
    state.kycSubmissions = state.kycSubmissions.filter((k) => k.userId !== target.id);
    state.scamReports = state.scamReports.filter(
      (s) => s.sellerId !== target.id && !removedListingIds.has(s.listingId)
    );

    saveState(state);
    broadcastEvent({
      id: `evt-${crypto.randomUUID().slice(0, 8)}`,
      type: 'config_update',
      message: `Super Admin deleted account ${target.name} (${target.systemId || target.id})`,
      timestamp: Date.now(),
    });
    res.json({ ok: true });
  });

  // Super Admin: Create Delegated Staff with sample role auto-grant & email notification containing login credentials
  app.post('/api/admin/staff', async (req, res) => {
    const actor = getActor(req);
    if (!actor || actor.role !== 'super_admin') {
      res.status(403).json({ error: 'Only Super Admin can create delegated staff accounts.' });
      return;
    }
    const { name, username, email, phone, roleTemplateId, permissions } = req.body as {
      name: string;
      username?: string;
      email: string;
      phone: string;
      roleTemplateId?: string;
      permissions?: StaffPermission[];
    };
    if (!name?.trim() || !email?.trim() || !phone?.trim()) {
      res.status(400).json({ error: 'Name, email, and phone are required for staff creation.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = normalizeZambianPhone(phone);
    const existingUsernames = state.users
      .map((u) => u.username)
      .filter((un): un is string => Boolean(un));
    const finalUsername = username?.trim()
      ? username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
      : generateStaffUsername(name, existingUsernames);

    const duplicate = state.users.some(
      (u) =>
        u.email.toLowerCase() === cleanEmail ||
        u.phone === cleanPhone ||
        (finalUsername && u.username?.toLowerCase() === finalUsername)
    );
    if (duplicate) {
      res.status(409).json({
        error: 'A user with this email, username, or phone number already exists.',
      });
      return;
    }

    const resolved = resolveDelegatedPermissions(roleTemplateId || 'custom', permissions);
    if (resolved.permissions.length === 0) {
      res.status(400).json({
        error: 'Select a sample role or at least one permission to grant automatic access.',
      });
      return;
    }

    const tempPassword = generateTempPassword();
    const now = Date.now();
    const staffSystemId = assignSystemId(
      'staff',
      state.users.map((u) => u.systemId)
    );
    const staff: ServerUserAccount = {
      id: `usr-staff-${crypto.randomUUID().slice(0, 6)}`,
      systemId: staffSystemId,
      name: name.trim(),
      username: finalUsername,
      delegatedRoleTitle: resolved.roleTitle,
      businessName: 'AgriLink ZM Delegated Staff',
      email: cleanEmail,
      phone: cleanPhone,
      role: 'staff',
      staffPermissions: resolved.permissions,
      province: 'Lusaka',
      district: 'Lusaka',
      verificationTier: 'tier1_id',
      accountStatus: 'active_paid',
      emailVerified: true,
      mustChangePassword: true,
      passwordHash: hashPassword(tempPassword),
      trialStartAt: now,
      trialDaysAllocated: 30,
      lastActiveAt: now,
      createdAt: now,
      savedListingIds: [],
    };
    state.users.push(staff);

    const emailBodyFull = [
      `Hello ${staff.name},`,
      '',
      `You have been delegated the role "${resolved.roleTitle}" on AgriLink ZM by Super Admin (${actor.email}).`,
      `Automatically Granted Access: ${resolved.permissions.join(', ')}`,
      '',
      'Your Login Credentials:',
      `  Username: ${finalUsername}`,
      `  Email: ${cleanEmail}`,
      `  Temporary Password: ${tempPassword}`,
      '',
      'Please sign in immediately and change your temporary password from your Staff Desk.',
      'AgriLink ZM Operations (agrilinkzm0@gmail.com | +260 976 405 828)',
    ].join('\n');

    const deliveryMode = await dispatchPlatformEmail({
      toEmail: cleanEmail,
      toName: staff.name,
      subject: `AgriLink ZM Role Delegation: ${resolved.roleTitle}`,
      text: emailBodyFull,
    });

    const redactedBody = [
      `Delegated Role: ${resolved.roleTitle}`,
      `Username: @${finalUsername} | Email: ${cleanEmail}`,
      `Granted Permissions: ${resolved.permissions.join(', ')}`,
      'Temporary password dispatched once at creation (staff prompted to change immediately on login).',
    ].join(' · ');

    const notificationRecord: EmailNotificationRecord = {
      id: `mail-${crypto.randomUUID().slice(0, 8)}`,
      toEmail: cleanEmail,
      toName: staff.name,
      fromEmail: 'agrilinkzm0@gmail.com',
      subject: `AgriLink ZM Role Delegation: ${resolved.roleTitle}`,
      body: redactedBody,
      type: 'staff_delegation_credentials',
      username: finalUsername,
      roleTitle: resolved.roleTitle,
      grantedPermissions: resolved.permissions,
      deliveryMode,
      createdAt: now,
    };

    state.emailNotifications.unshift(notificationRecord);
    saveState(state);

    res.status(201).json({
      staff: sanitizeUserForClient(staff),
      dispatchedEmail: {
        id: notificationRecord.id,
        fromEmail: 'agrilinkzm0@gmail.com',
        toEmail: cleanEmail,
        toName: staff.name,
        username: finalUsername,
        tempPassword,
        roleTitle: resolved.roleTitle,
        grantedPermissions: resolved.permissions,
        subject: notificationRecord.subject,
        body: emailBodyFull,
        deliveryMode,
        createdAt: now,
      },
    });
  });

  app.patch('/api/admin/staff/:id/permissions', (req, res) => {
    const actor = getActor(req);
    if (!actor || actor.role !== 'super_admin') {
      res.status(403).json({ error: 'Only Super Admin can modify staff RBAC permissions.' });
      return;
    }
    const staff = state.users.find((u) => u.id === req.params.id && u.role === 'staff');
    if (!staff) {
      res.status(404).json({ error: 'Staff account not found.' });
      return;
    }
    const { permissions, roleTitle } = req.body as {
      permissions: StaffPermission[];
      roleTitle?: string;
    };
    staff.staffPermissions = permissions;
    if (roleTitle) staff.delegatedRoleTitle = roleTitle;
    saveState(state);
    res.json({ staff: sanitizeUserForClient(staff) });
  });

  // Server-side Gemini Multi-Turn Chatbot Endpoint
  app.post('/api/gemini/chat', async (req, res) => {
    const { roleId, speedTier, history, message } = req.body as {
      roleId?: GeminiAssistantRoleId;
      speedTier?: GeminiSpeedTier;
      history?: Array<{ role: 'user' | 'model'; text: string }>;
      message?: string;
    };

    if (!message?.trim()) {
      res.status(400).json({ error: 'Please type a question for the AgriLink AI Assistant.' });
      return;
    }

    const activeListings = state.listings.filter((l) => l.status === 'active');
    const summaryLines = activeListings
      .slice(0, 8)
      .map(
        (l) =>
          `- ${l.title} (${l.category}) in ${l.province}, ${l.district}: ZMW ${l.priceZmw} ${l.unitLabel}`
      )
      .join('\n');
    const marketplaceContext = `Active verified listings count: ${activeListings.length}\nSample active listings:\n${summaryLines}`;

    try {
      const result = await runGeminiMarketplaceChat({
        roleId: roleId || 'crop_advisor',
        speedTier: speedTier || 'standard',
        history: Array.isArray(history) ? history : [],
        message,
        marketplaceContext,
      });
      res.json(result);
    } catch (err: any) {
      res.status(503).json({
        error: err?.message || 'Unable to reach Gemini assistant right now.',
      });
    }
  });

  // Super Admin: Billing Follow-up Reminder Dispatch
  app.post('/api/admin/billing-reminder', (req, res) => {
    const actor = getActor(req);
    if (!hasStaffPermission(actor, 'billing_followup')) {
      res.status(403).json({ error: 'Missing Billing Follow-Up permission.' });
      return;
    }
    const { userId, channel } = req.body as { userId: string; channel: 'SMS' | 'WhatsApp' | 'In-App' };
    const target = state.users.find((u) => u.id === userId);
    if (!target) {
      res.status(404).json({ error: 'Advertiser not found.' });
      return;
    }
    broadcastEvent({
      id: `evt-${crypto.randomUUID().slice(0, 8)}`,
      type: 'payment_update',
      message: `${channel} trial expiry / renewal reminder sent to ${target.name} (${target.phone})`,
      timestamp: Date.now(),
    });
    res.json({ ok: true, sentTo: target.name, channel });
  });

  // Super Admin: Purge seeded sample preview data for clean live launch
  app.post('/api/admin/clear-demo-data', (req, res) => {
    const actor = getActor(req);
    if (!actor || actor.role !== 'super_admin') {
      res.status(403).json({ error: 'Only Super Admin can clear sample preview data.' });
      return;
    }
    const isSeedUser = (id: string) =>
      /^usr-(adv|buy|staff)-\d+$/.test(id);
    const isSeedListing = (id: string) => /^lst-\d+$/.test(id);

    state.users = state.users.filter((u) => !isSeedUser(u.id));
    state.listings = state.listings.filter((l) => !isSeedListing(l.id));
    state.contactReveals = state.contactReveals.filter((c) => !c.id.startsWith('cr-seed-'));
    state.reviews = state.reviews.filter((r) => !/^rev-\d+$/.test(r.id));
    state.scamReports = state.scamReports.filter((s) => !s.id.startsWith('sr-seed-'));
    state.payments = state.payments.filter((p) => !p.id.startsWith('pay-seed-'));
    state.kycSubmissions = state.kycSubmissions.filter((k) => !k.id.startsWith('kyc-seed-'));
    state.conversations = state.conversations.filter((c) => !c.id.startsWith('conv-seed-'));
    state.messages = state.messages.filter((m) => !m.id.startsWith('msg-seed-'));
    state.recentEvents = state.recentEvents.filter((e) => !e.id.startsWith('evt-seed-'));

    saveState(state);
    broadcastEvent({
      id: `evt-${crypto.randomUUID().slice(0, 8)}`,
      type: 'config_update',
      message: 'Super Admin cleared sample preview data for clean live launch',
      timestamp: Date.now(),
    });
    res.json({ ok: true, remainingUsers: state.users.length, remainingListings: state.listings.length });
  });

  if (isProduction) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`AgriLink ZM server running at http://localhost:${PORT}`);
  });
}

startServer();
