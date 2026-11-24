import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import type { ServerUserAccount, UserAccount } from './src/types/marketplace.ts';
import {
  BREVO_SEND_ENDPOINT,
  buildBrevoEmailPayload,
  hasConfiguredBrevoKey,
  resolveBrevoSender,
} from './src/utils/emailProvider.ts';

const EPHEMERAL_SESSION_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  return process.env.SESSION_SECRET?.trim() || EPHEMERAL_SESSION_SECRET;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash?: string): boolean {
  if (!password || !storedHash || !storedHash.startsWith('scrypt:')) {
    return false;
  }
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  const [, salt, originalHex] = parts;
  if (!salt || !originalHex) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const original = Buffer.from(originalHex, 'hex');
    if (derived.length !== original.length) return false;
    return crypto.timingSafeEqual(derived, original);
  } catch {
    return false;
  }
}

export function generateVerificationCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export function generateTempPassword(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += letters[crypto.randomInt(0, letters.length)];
  }
  for (let i = 0; i < 3; i++) {
    result += digits[crypto.randomInt(0, digits.length)];
  }
  return `${result}!`;
}

export function hashVerificationCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim()).digest('hex');
}

export function signSessionToken(userId: string): string {
  const payloadObj = {
    uid: userId,
    exp: Date.now() + 12 * 60 * 60 * 1000,
    nonce: crypto.randomBytes(8).toString('hex'),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifySessionToken(token?: string | null): string | null {
  if (!token) return null;
  const parts = token.trim().split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, providedSig] = parts;
  if (!payloadB64 || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest('base64url');

  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      uid?: string;
      exp?: number;
    };
    if (!decoded.uid || typeof decoded.exp !== 'number' || decoded.exp < Date.now()) {
      return null;
    }
    return decoded.uid;
  } catch {
    return null;
  }
}

export function sanitizeUserForClient(user: ServerUserAccount): UserAccount {
  const {
    authUserId: _au,
    passwordHash: _ph,
    verificationCodeHash: _vh,
    verificationExpiresAt: _ve,
    ...safe
  } = user;
  return safe;
}

export function sanitizePublicUserProfile(user: ServerUserAccount): UserAccount {
  return {
    id: user.id,
    systemId: user.systemId,
    name: user.name,
    username: user.username,
    delegatedRoleTitle: user.delegatedRoleTitle,
    businessName: user.businessName,
    email: '',
    phone: '',
    role: user.role,
    staffPermissions: [],
    province: user.province,
    district: user.district,
    verificationTier: user.verificationTier,
    defaultLocationPrivacy: user.defaultLocationPrivacy,
    farmCoordinates: user.defaultLocationPrivacy === 'precise_pin' ? user.farmCoordinates : undefined,
    accountStatus: user.accountStatus,
    emailVerified: Boolean(user.emailVerified),
    trialStartAt: user.trialStartAt,
    trialDaysAllocated: user.trialDaysAllocated,
    lastActiveAt: user.lastActiveAt,
    createdAt: user.createdAt,
    savedListingIds: [],
  };
}

export async function dispatchPlatformEmail(params: {
  toEmail: string;
  toName?: string;
  subject: string;
  text: string;
}): Promise<'email_and_inbox' | 'in_app_dispatch'> {
  const brevoKey = process.env.BREVO_API_KEY?.trim();
  if (!hasConfiguredBrevoKey(brevoKey)) {
    return 'in_app_dispatch';
  }
  const sender = resolveBrevoSender(process.env);
  const payload = buildBrevoEmailPayload({
    toEmail: params.toEmail,
    toName: params.toName,
    subject: params.subject,
    text: params.text,
    senderEmail: sender.email,
    senderName: sender.name,
  });
  try {
    const resp = await fetch(BREVO_SEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': brevoKey!,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      console.warn(`[AgriLink ZM] Brevo email dispatch returned HTTP ${resp.status}; falling back to in-app inbox.`);
      return 'in_app_dispatch';
    }
    return 'email_and_inbox';
  } catch (err) {
    console.warn(
      `[AgriLink ZM] Brevo email dispatch failed (${err instanceof Error ? err.message : 'network error'}); falling back to in-app inbox.`
    );
    return 'in_app_dispatch';
  }
}

export type GeminiAssistantRoleId = 'crop_advisor' | 'trust_guide' | 'buyer_concierge';
export type GeminiSpeedTier = 'standard' | 'fast';

const ROLE_SYSTEM_PROMPTS: Record<GeminiAssistantRoleId, string> = {
  crop_advisor:
    'You are the AgriLink ZM Agronomy & Produce Advisor for Zambia. Give practical, localized Zambian agricultural advice on crops (maize grading & moisture, soya beans, groundnuts, horticulture), poultry, Lake Kariba tilapia aquaculture, farm equipment, and ZMW pricing/packaging. Keep responses concise, structured, and actionable.',
  trust_guide:
    'You are the AgriLink ZM Trust & Scam-Safety Officer. Explain AgriLink ZM verification tiers (Tier 1 NRC + MoMo legal name match, Tier 2 PACRA + ZRA TPIN, Tier 3 Site GPS + unedited walkthrough video), interaction-gated ratings, 3-report auto-freezes, and practical scam avoidance rules in Zambia (never pay advance deposits or transport fees via Mobile Money before inspecting produce).',
  buyer_concierge:
    'You are the AgriLink ZM Buyer Sourcing Assistant across all 10 Zambian provinces. Help buyers compare agricultural listings by province/district, verification tier, distance radius, and cold-chain/transport feasibility, and guide them on using In-App Messaging or WhatsApp handoff safely.',
};

function formatGeminiErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || 'Unable to reach Gemini assistant.');
  if (raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string; code?: number } };
      if (parsed.error?.message) {
        return parsed.error.code === 503
          ? `Gemini service is temporarily busy (${parsed.error.message}). Please try again shortly.`
          : parsed.error.message;
      }
    } catch {
      // fall through to clean fallback
    }
  }
  return raw;
}

export async function runGeminiMarketplaceChat(params: {
  roleId: GeminiAssistantRoleId;
  speedTier: GeminiSpeedTier;
  history: Array<{ role: 'user' | 'model'; text: string }>;
  message: string;
  marketplaceContext: string;
}): Promise<{ reply: string; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured in Settings > Secrets. Add your Gemini API key to enable the AgriLink AI Assistant.'
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
      timeout: 15000,
    },
  });

  const primaryModel = params.speedTier === 'fast' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';
  const fallbackModel = primaryModel === 'gemini-3.1-flash-lite' ? 'gemini-4-hydrogen' : 'gemini-3.1-flash-lite';
  const baseInstruction = ROLE_SYSTEM_PROMPTS[params.roleId] || ROLE_SYSTEM_PROMPTS.crop_advisor;
  const systemInstruction = `${baseInstruction}\n\nLive Marketplace Snapshot:\n${params.marketplaceContext}`;

  const chatHistory = params.history
    .filter((h) => h.text && h.text.trim().length > 0)
    .slice(-16)
    .map((h) => ({
      role: h.role,
      parts: [{ text: h.text.trim() }],
    }));

  const attemptSend = async (modelName: string) => {
    const chat = ai.chats.create({
      model: modelName,
      history: chatHistory,
      config: {
        systemInstruction,
      },
    });
    const response = await chat.sendMessage({ message: params.message.trim() });
    const replyText = (response.text || '').trim();
    if (!replyText) {
      throw new Error('Gemini returned an empty response. Please try rephrasing your question.');
    }
    return { reply: replyText, model: modelName };
  };

  try {
    return await attemptSend(primaryModel);
  } catch (primaryErr) {
    const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
    if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
      try {
        return await attemptSend(fallbackModel);
      } catch (fallbackErr) {
        throw new Error(formatGeminiErrorMessage(fallbackErr));
      }
    }
    throw new Error(formatGeminiErrorMessage(primaryErr));
  }
}
