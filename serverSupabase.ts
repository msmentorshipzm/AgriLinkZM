import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { MarketplaceState, ServerUserAccount } from './src/types/marketplace.ts';
import {
  analyticsEventToRow,
  blacklistToRow,
  configToRow,
  contactRevealToRow,
  conversationToRow,
  emailNotificationToRow,
  kycToRow,
  listingToRow,
  messageToRow,
  paymentToRow,
  reviewToRow,
  rowToAnalyticsEvent,
  rowToBlacklist,
  rowToConfig,
  rowToContactReveal,
  rowToConversation,
  rowToEmailNotification,
  rowToKyc,
  rowToListing,
  rowToMessage,
  rowToPayment,
  rowToReview,
  rowToScamReport,
  rowToUser,
  scamReportToRow,
  userToRow,
  type AnalyticsEventRow,
  type BlacklistRow,
  type ChatConversationRow,
  type ChatMessageRow,
  type ContactRevealRow,
  type EmailNotificationRow,
  type KycSubmissionRow,
  type ListingRow,
  type PaymentRow,
  type PlatformConfigRow,
  type ReviewRow,
  type ScamReportRow,
  type UserRow,
} from './src/utils/supabaseMapper.ts';

let cachedAdminClient: SupabaseClient | null = null;
let syncQueue: Promise<void> = Promise.resolve();

const DEFAULT_SUPABASE_PROJECT_ID = 'jooiokndmpquplkwercu';

function getSupabaseUrl(): string {
  const explicitUrl =
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    '';
  if (explicitUrl) return explicitUrl;
  const projectId = process.env.SUPABASE_PROJECT_ID?.trim() || DEFAULT_SUPABASE_PROJECT_ID;
  return projectId ? `https://${projectId}.supabase.co` : '';
}

function getSupabaseServiceKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
}

export function isSupabaseServerConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseServiceKey());
}

export function getSupabaseAdmin(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceKey();
  if (!url || !key) return null;
  if (!cachedAdminClient) {
    cachedAdminClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return cachedAdminClient;
}

export async function loadMarketplaceStateFromSupabase(): Promise<MarketplaceState | null> {
  const client = getSupabaseAdmin();
  if (!client) return null;

  try {
    const [
      cfgRes,
      usersRes,
      listingsRes,
      revealsRes,
      reviewsRes,
      reportsRes,
      paymentsRes,
      kycRes,
      convRes,
      msgRes,
      blacklistRes,
      eventsRes,
      emailsRes,
    ] = await Promise.all([
      client.from('platform_config').select('*').eq('id', 'default').maybeSingle(),
      client.from('users').select('*'),
      client.from('listings').select('*'),
      client.from('contact_reveals').select('*'),
      client.from('reviews').select('*'),
      client.from('scam_reports').select('*'),
      client.from('payments').select('*'),
      client.from('kyc_submissions').select('*'),
      client.from('chat_conversations').select('*'),
      client.from('chat_messages').select('*').order('created_at', { ascending: true }),
      client.from('blacklist').select('*'),
      client
        .from('analytics_events')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(40),
      client
        .from('email_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    if (cfgRes.error) throw cfgRes.error;
    if (usersRes.error) throw usersRes.error;

    if (!cfgRes.data && (!usersRes.data || usersRes.data.length === 0)) {
      return null;
    }

    const config = cfgRes.data
      ? rowToConfig(cfgRes.data as PlatformConfigRow)
      : {
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

    return {
      config,
      users: ((usersRes.data || []) as UserRow[]).map(rowToUser),
      listings: ((listingsRes.data || []) as ListingRow[]).map(rowToListing),
      contactReveals: ((revealsRes.data || []) as ContactRevealRow[]).map(rowToContactReveal),
      reviews: ((reviewsRes.data || []) as ReviewRow[]).map(rowToReview),
      scamReports: ((reportsRes.data || []) as ScamReportRow[]).map(rowToScamReport),
      payments: ((paymentsRes.data || []) as PaymentRow[]).map(rowToPayment),
      kycSubmissions: ((kycRes.data || []) as KycSubmissionRow[]).map(rowToKyc),
      conversations: ((convRes.data || []) as ChatConversationRow[]).map(rowToConversation),
      messages: ((msgRes.data || []) as ChatMessageRow[]).map(rowToMessage),
      blacklist: ((blacklistRes.data || []) as BlacklistRow[]).map(rowToBlacklist),
      recentEvents: ((eventsRes.data || []) as AnalyticsEventRow[]).map(rowToAnalyticsEvent),
      emailNotifications: ((emailsRes.data || []) as EmailNotificationRow[]).map(
        rowToEmailNotification
      ),
    };
  } catch (err) {
    console.error('Supabase initial load failed:', err);
    return null;
  }
}

async function deleteRemovedRows(
  client: SupabaseClient,
  table: string,
  keepIds: string[]
): Promise<void> {
  const { data, error } = await client.from(table).select('id');
  if (error || !data) return;
  const keepSet = new Set(keepIds);
  const toDelete = (data as { id: string }[])
    .map((row) => row.id)
    .filter((id) => !keepSet.has(id));
  if (toDelete.length > 0) {
    await client.from(table).delete().in('id', toDelete);
  }
}

async function performFullSupabaseSync(snapshot: MarketplaceState): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client) return;

  try {
    const cfgRes = await client
      .from('platform_config')
      .upsert(configToRow(snapshot.config), { onConflict: 'id' });
    if (cfgRes.error) throw cfgRes.error;

    // 1. Upsert users first (foreign-key parent for listings, payments, reviews, etc.)
    if (snapshot.users.length > 0) {
      const { error } = await client
        .from('users')
        .upsert(snapshot.users.map(userToRow), { onConflict: 'id' });
      if (error) throw error;
    }

    // 2. Upsert listings and conversations before child rows
    if (snapshot.listings.length > 0) {
      const { error } = await client
        .from('listings')
        .upsert(snapshot.listings.map(listingToRow), { onConflict: 'id' });
      if (error) throw error;
    }

    if (snapshot.conversations.length > 0) {
      const { error } = await client
        .from('chat_conversations')
        .upsert(snapshot.conversations.map(conversationToRow), { onConflict: 'id' });
      if (error) throw error;
    }

    // 3. Upsert all remaining tables in parallel
    await Promise.all([
      snapshot.contactReveals.length > 0
        ? client
            .from('contact_reveals')
            .upsert(snapshot.contactReveals.map(contactRevealToRow), { onConflict: 'id' })
        : Promise.resolve(),
      snapshot.reviews.length > 0
        ? client
            .from('reviews')
            .upsert(snapshot.reviews.map(reviewToRow), { onConflict: 'id' })
        : Promise.resolve(),
      snapshot.scamReports.length > 0
        ? client
            .from('scam_reports')
            .upsert(snapshot.scamReports.map(scamReportToRow), { onConflict: 'id' })
        : Promise.resolve(),
      snapshot.payments.length > 0
        ? client
            .from('payments')
            .upsert(snapshot.payments.map(paymentToRow), { onConflict: 'id' })
        : Promise.resolve(),
      snapshot.kycSubmissions.length > 0
        ? client
            .from('kyc_submissions')
            .upsert(snapshot.kycSubmissions.map(kycToRow), { onConflict: 'id' })
        : Promise.resolve(),
      snapshot.messages.length > 0
        ? client
            .from('chat_messages')
            .upsert(snapshot.messages.map(messageToRow), { onConflict: 'id' })
        : Promise.resolve(),
      snapshot.blacklist.length > 0
        ? client
            .from('blacklist')
            .upsert(snapshot.blacklist.map(blacklistToRow), { onConflict: 'id' })
        : Promise.resolve(),
      snapshot.recentEvents.length > 0
        ? client
            .from('analytics_events')
            .upsert(snapshot.recentEvents.map(analyticsEventToRow), { onConflict: 'id' })
        : Promise.resolve(),
      snapshot.emailNotifications.length > 0
        ? client
            .from('email_notifications')
            .upsert(snapshot.emailNotifications.map(emailNotificationToRow), { onConflict: 'id' })
        : Promise.resolve(),
    ]);

    // 4. Clean up deleted records (for admin Clear Demo Data, user delete, listing delete)
    await Promise.all([
      deleteRemovedRows(client, 'chat_messages', snapshot.messages.map((m) => m.id)),
      deleteRemovedRows(client, 'chat_conversations', snapshot.conversations.map((c) => c.id)),
      deleteRemovedRows(client, 'contact_reveals', snapshot.contactReveals.map((c) => c.id)),
      deleteRemovedRows(client, 'reviews', snapshot.reviews.map((r) => r.id)),
      deleteRemovedRows(client, 'scam_reports', snapshot.scamReports.map((s) => s.id)),
      deleteRemovedRows(client, 'payments', snapshot.payments.map((p) => p.id)),
      deleteRemovedRows(client, 'kyc_submissions', snapshot.kycSubmissions.map((k) => k.id)),
      deleteRemovedRows(client, 'listings', snapshot.listings.map((l) => l.id)),
      deleteRemovedRows(client, 'users', snapshot.users.map((u) => u.id)),
    ]);
  } catch (err) {
    console.error('Supabase sync failed:', err);
  }
}

export function enqueueSupabaseSync(state: MarketplaceState): Promise<void> {
  if (!isSupabaseServerConfigured()) return Promise.resolve();
  const cloned = structuredClone(state);
  syncQueue = syncQueue.then(() => performFullSupabaseSync(cloned));
  return syncQueue;
}

export async function syncUserToSupabaseAuth(
  user: ServerUserAccount,
  plainPassword?: string
): Promise<string | null> {
  const client = getSupabaseAdmin();
  if (!client || !user.email) return user.authUserId || null;

  try {
    if (user.authUserId) {
      const updatePayload: {
        email?: string;
        email_confirm?: boolean;
        password?: string;
        user_metadata?: Record<string, unknown>;
      } = {
        email: user.email,
        email_confirm: Boolean(user.emailVerified),
        user_metadata: {
          app_user_id: user.id,
          system_id: user.systemId,
          role: user.role,
          name: user.name,
          username: user.username,
        },
      };
      if (plainPassword) {
        updatePayload.password = plainPassword;
      }
      const { error } = await client.auth.admin.updateUserById(user.authUserId, updatePayload);
      if (!error) return user.authUserId;
    }

    const { data, error } = await client.auth.admin.createUser({
      email: user.email,
      password: plainPassword || undefined,
      email_confirm: Boolean(user.emailVerified),
      user_metadata: {
        app_user_id: user.id,
        system_id: user.systemId,
        role: user.role,
        name: user.name,
        username: user.username,
      },
    });
    if (!error && data.user) {
      return data.user.id;
    }

    // If user already existed in Supabase Auth by email, look them up via listUsers
    const { data: listData } = await client.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = listData?.users?.find(
      (au) => au.email?.toLowerCase() === user.email.toLowerCase()
    );
    if (existing) {
      await client.auth.admin.updateUserById(existing.id, {
        email_confirm: Boolean(user.emailVerified),
        ...(plainPassword ? { password: plainPassword } : {}),
        user_metadata: {
          app_user_id: user.id,
          system_id: user.systemId,
          role: user.role,
          name: user.name,
          username: user.username,
        },
      });
      return existing.id;
    }
    return user.authUserId || null;
  } catch (err) {
    console.error('Supabase Auth user sync skipped:', err);
    return user.authUserId || null;
  }
}

export async function deleteUserFromSupabaseAuth(authUserId?: string): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client || !authUserId) return;
  try {
    await client.auth.admin.deleteUser(authUserId);
  } catch (err) {
    console.error('Supabase Auth delete user failed:', err);
  }
}

export async function verifySupabaseAccessToken(accessToken: string) {
  const client = getSupabaseAdmin();
  if (!client || !accessToken) return null;
  try {
    const { data, error } = await client.auth.getUser(accessToken);
    if (error || !data.user) return null;
    return data.user;
  } catch {
    return null;
  }
}
