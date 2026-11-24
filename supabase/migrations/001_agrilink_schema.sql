-- =============================================================================
-- AgriLink ZM — Complete Supabase PostgreSQL Schema, Auth Links, Storage & RLS
-- Run this entire script in your Supabase Dashboard -> SQL Editor -> New Query
-- Safe to re-run (idempotent).
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Platform Configuration (Super Admin Trial & Payment Switches)
-- -----------------------------------------------------------------------------
create table if not exists public.platform_config (
  id text primary key default 'default',
  platform_launched_at bigint not null,
  default_trial_days integer not null default 30 check (default_trial_days >= 0),
  advertiser_monthly_fee_zmw numeric(12, 2) not null default 150.00 check (advertiser_monthly_fee_zmw >= 0),
  advertiser_payment_required boolean not null default false,
  buyer_fee_enabled boolean not null default false,
  buyer_fee_amount_zmw numeric(12, 2) not null default 3.00 check (buyer_fee_amount_zmw >= 0),
  buyer_traction_months_override boolean not null default false,
  dormancy_threshold_days integer not null default 60 check (dormancy_threshold_days >= 1),
  manual_momo_number text not null default '0976 405 828',
  manual_airtel_number text not null default '0977 882 310',
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2. Users (Buyers, Advertisers, Delegated Staff, Super Admin)
--    Links optionally to auth.users(id) when Supabase Auth is used.
-- -----------------------------------------------------------------------------
create table if not exists public.users (
  id text primary key,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  system_id text unique,
  admin_note text,
  name text not null,
  username text unique,
  delegated_role_title text,
  business_name text,
  email text not null,
  phone text not null,
  whatsapp text,
  role text not null check (role in ('advertiser', 'buyer', 'staff', 'super_admin')),
  staff_permissions text[] not null default '{}',
  province text not null,
  district text not null,
  verification_tier text not null default 'unverified'
    check (verification_tier in ('unverified', 'tier1_id', 'tier2_business', 'tier3_site')),
  nrc_number text,
  momo_account_name text,
  pacra_number text,
  zra_tpin text,
  site_gps_pin text,
  default_location_privacy text check (default_location_privacy in ('district_general', 'precise_pin')),
  farm_lat double precision,
  farm_lng double precision,
  account_status text not null default 'trial_active'
    check (account_status in (
      'trial_active',
      'active_paid',
      'payment_required',
      'under_investigation',
      'frozen',
      'dormant',
      'suspended',
      'banned'
    )),
  email_verified boolean not null default false,
  must_change_password boolean not null default false,
  password_hash text,
  verification_code_hash text,
  verification_expires_at bigint,
  trial_start_at bigint not null,
  trial_days_allocated integer not null default 30,
  paid_until_at bigint,
  buyer_fee_paid_until_at bigint,
  last_active_at bigint not null,
  created_at bigint not null,
  saved_listing_ids text[] not null default '{}'
);

create index if not exists idx_users_email_lower on public.users (lower(email));
create index if not exists idx_users_role_status on public.users (role, account_status);
create index if not exists idx_users_province on public.users (province);

-- -----------------------------------------------------------------------------
-- 3. Agricultural Produce & Equipment Listings
-- -----------------------------------------------------------------------------
create table if not exists public.listings (
  id text primary key,
  seller_id text not null references public.users(id) on delete cascade,
  title text not null,
  category text not null check (category in (
    'Crops & Grains',
    'Horticulture',
    'Livestock',
    'Poultry',
    'Fisheries & Aquaculture',
    'Agro-Inputs',
    'Farm Equipment'
  )),
  description text not null,
  price_zmw numeric(14, 2) not null check (price_zmw >= 0),
  unit_label text not null,
  quantity_available text not null,
  province text not null,
  district text not null,
  lat double precision,
  lng double precision,
  location_privacy text not null default 'district_general'
    check (location_privacy in ('district_general', 'precise_pin')),
  images text[] not null default '{}',
  has_video_walkthrough boolean not null default false,
  video_url text,
  video_duration_sec integer,
  status text not null default 'active'
    check (status in (
      'active',
      'pending_moderation',
      'under_investigation',
      'paused_payment',
      'sold_out',
      'archived'
    )),
  impressions integer not null default 0,
  views integer not null default 0,
  unique_visitors integer not null default 0,
  video_plays integer not null default 0,
  contact_reveals integer not null default 0,
  created_at bigint not null,
  updated_at bigint not null
);

create index if not exists idx_listings_seller on public.listings (seller_id);
create index if not exists idx_listings_status_province on public.listings (status, province);
create index if not exists idx_listings_category on public.listings (category);

-- -----------------------------------------------------------------------------
-- 4. Contact Reveals (Interaction Gate for Seller Reviews)
-- -----------------------------------------------------------------------------
create table if not exists public.contact_reveals (
  id text primary key,
  listing_id text not null references public.listings(id) on delete cascade,
  seller_id text not null references public.users(id) on delete cascade,
  buyer_id text not null references public.users(id) on delete cascade,
  created_at bigint not null
);

create index if not exists idx_contact_reveals_buyer_seller
  on public.contact_reveals (buyer_id, seller_id);

-- -----------------------------------------------------------------------------
-- 5. Verified Buyer Reviews & Seller Ratings
-- -----------------------------------------------------------------------------
create table if not exists public.reviews (
  id text primary key,
  seller_id text not null references public.users(id) on delete cascade,
  buyer_id text not null references public.users(id) on delete cascade,
  buyer_name text not null,
  listing_id text not null references public.listings(id) on delete cascade,
  product_quality integer not null check (product_quality between 1 and 5),
  communication integer not null check (communication between 1 and 5),
  pricing_honesty integer not null check (pricing_honesty between 1 and 5),
  overall_rating numeric(4, 2) not null,
  comment text not null,
  seller_reply text,
  seller_replied_at bigint,
  created_at bigint not null,
  updated_at bigint not null
);

create index if not exists idx_reviews_seller on public.reviews (seller_id);
create index if not exists idx_reviews_listing on public.reviews (listing_id);

-- -----------------------------------------------------------------------------
-- 6. Scam Reports & Anti-Fraud Moderation
-- -----------------------------------------------------------------------------
create table if not exists public.scam_reports (
  id text primary key,
  listing_id text not null,
  seller_id text not null,
  reporter_buyer_id text not null,
  reporter_name text not null,
  reason text not null,
  details text not null,
  evidence_data_url text,
  status text not null default 'open' check (status in ('open', 'resolved_frozen', 'dismissed')),
  created_at bigint not null
);

create index if not exists idx_scam_reports_listing on public.scam_reports (listing_id);
create index if not exists idx_scam_reports_seller on public.scam_reports (seller_id);
create index if not exists idx_scam_reports_status on public.scam_reports (status);

-- -----------------------------------------------------------------------------
-- 7. Mobile Money & Flutterwave Payments Ledger
-- -----------------------------------------------------------------------------
create table if not exists public.payments (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  user_name text not null,
  user_phone text not null,
  payment_type text not null check (payment_type in ('advertiser_subscription', 'buyer_account_fee')),
  method text not null check (method in ('manual_pop', 'flutterwave_ussd')),
  network text not null check (network in ('MTN MoMo', 'Airtel Money', 'Zamtel Kwacha')),
  amount_zmw numeric(12, 2) not null check (amount_zmw >= 0),
  reference_code text not null,
  transaction_id text not null,
  proof_image_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by text,
  review_note text,
  created_at bigint not null
);

create index if not exists idx_payments_user_status on public.payments (user_id, status);

-- -----------------------------------------------------------------------------
-- 8. KYC Verification Queue (Tier 1 NRC, Tier 2 PACRA/ZRA, Tier 3 Site GPS)
-- -----------------------------------------------------------------------------
create table if not exists public.kyc_submissions (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  user_name text not null,
  requested_tier text not null check (requested_tier in ('tier1_id', 'tier2_business', 'tier3_site')),
  phone_otp_verified boolean not null default false,
  nrc_number text,
  nrc_front_name text,
  nrc_back_name text,
  momo_account_name text,
  pacra_number text,
  zra_tpin text,
  certificate_ref text,
  site_gps_pin text,
  walkthrough_video_ref text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by text,
  review_note text,
  created_at bigint not null
);

create index if not exists idx_kyc_status on public.kyc_submissions (status);

-- -----------------------------------------------------------------------------
-- 9. In-App Chat Conversations & Billing Support Threads
-- -----------------------------------------------------------------------------
create table if not exists public.chat_conversations (
  id text primary key,
  kind text not null default 'listing_inquiry' check (kind in ('listing_inquiry', 'billing_support')),
  listing_id text,
  listing_title text,
  seller_id text not null,
  seller_name text not null,
  buyer_id text not null,
  buyer_name text not null,
  whatsapp_handoff_at bigint,
  created_at bigint not null,
  updated_at bigint not null
);

create index if not exists idx_chat_conv_participants on public.chat_conversations (buyer_id, seller_id);

-- -----------------------------------------------------------------------------
-- 10. In-App Chat Messages (Text, Media, Voice, Handoff, Payment Notices)
-- -----------------------------------------------------------------------------
create table if not exists public.chat_messages (
  id text primary key,
  conversation_id text not null references public.chat_conversations(id) on delete cascade,
  sender_id text not null,
  sender_name text not null,
  sender_role text not null check (sender_role in ('advertiser', 'buyer', 'staff', 'super_admin')),
  type text not null default 'text'
    check (type in ('text', 'image', 'voice', 'system_handoff', 'payment_notice')),
  text text,
  media_data_url text,
  audio_duration_sec integer,
  notice_key text,
  payment_type text check (payment_type in ('advertiser_subscription', 'buyer_account_fee')),
  amount_zmw numeric(12, 2),
  created_at bigint not null
);

create index if not exists idx_chat_messages_conv_created
  on public.chat_messages (conversation_id, created_at);

-- -----------------------------------------------------------------------------
-- 11. Permanent Hashed Fraud Blacklist
-- -----------------------------------------------------------------------------
create table if not exists public.blacklist (
  id text primary key,
  user_id text not null,
  nrc_hash text not null default '',
  phone_hash text not null,
  momo_hash text not null default '',
  reason text not null,
  banned_at bigint not null
);

create index if not exists idx_blacklist_phone_hash on public.blacklist (phone_hash);

-- -----------------------------------------------------------------------------
-- 12. Real-Time Marketplace Analytics Events
-- -----------------------------------------------------------------------------
create table if not exists public.analytics_events (
  id text primary key,
  type text not null,
  listing_id text,
  listing_title text,
  seller_id text,
  province text,
  message text not null,
  timestamp bigint not null
);

create index if not exists idx_analytics_timestamp on public.analytics_events (timestamp desc);

-- -----------------------------------------------------------------------------
-- 13. Transactional Email Dispatch Log (Brevo Verification & Staff Credentials)
-- -----------------------------------------------------------------------------
create table if not exists public.email_notifications (
  id text primary key,
  to_email text not null,
  to_name text not null,
  from_email text not null,
  subject text not null,
  body text not null,
  type text not null check (type in ('account_verification', 'staff_delegation_credentials', 'password_changed')),
  username text,
  role_title text,
  granted_permissions text[],
  delivery_mode text not null check (delivery_mode in ('email_and_inbox', 'in_app_dispatch')),
  created_at bigint not null
);

-- -----------------------------------------------------------------------------
-- 14. Supabase Storage Buckets & Storage Object RLS Policies
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('agrilink-media', 'agrilink-media', true),
  ('agrilink-kyc', 'agrilink-kyc', false),
  ('agrilink-proofs', 'agrilink-proofs', false)
on conflict (id) do nothing;

drop policy if exists "Public read agrilink media" on storage.objects;
create policy "Public read agrilink media"
  on storage.objects for select
  using (bucket_id = 'agrilink-media');

drop policy if exists "Authenticated upload own agrilink files" on storage.objects;
create policy "Authenticated upload own agrilink files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id in ('agrilink-media', 'agrilink-kyc', 'agrilink-proofs')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Authenticated read own private kyc and proofs" on storage.objects;
create policy "Authenticated read own private kyc and proofs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id in ('agrilink-kyc', 'agrilink-proofs')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- -----------------------------------------------------------------------------
-- 15. Row Level Security (RLS) Policies
--     Note: The AgriLink Express server uses SUPABASE_SERVICE_ROLE_KEY which
--     bypasses RLS safely after server-side auth checks. Enabling RLS below
--     protects tables from unauthorized direct client-side PostgREST queries.
-- -----------------------------------------------------------------------------
alter table public.platform_config enable row level security;
alter table public.users enable row level security;
alter table public.listings enable row level security;
alter table public.contact_reveals enable row level security;
alter table public.reviews enable row level security;
alter table public.scam_reports enable row level security;
alter table public.payments enable row level security;
alter table public.kyc_submissions enable row level security;
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.blacklist enable row level security;
alter table public.analytics_events enable row level security;
alter table public.email_notifications enable row level security;

-- Protect sensitive credential & KYC columns from direct browser PostgREST reads
revoke select (password_hash, verification_code_hash, verification_expires_at, nrc_number)
  on public.users from anon, authenticated;

-- Public read access ONLY for active marketplace listings & buyer reviews
drop policy if exists "Public can read active listings" on public.listings;
create policy "Public can read active listings"
  on public.listings for select
  using (status = 'active');

drop policy if exists "Public can read reviews" on public.reviews;
create policy "Public can read reviews"
  on public.reviews for select
  using (true);

-- Authenticated Supabase users can view their own non-sensitive profile metadata
drop policy if exists "Users can read own profile" on public.users;
create policy "Users can read own profile"
  on public.users for select
  to authenticated
  using (auth.uid() = auth_user_id);

drop policy if exists "Users can view own payments" on public.payments;
create policy "Users can view own payments"
  on public.payments for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = payments.user_id and u.auth_user_id = auth.uid()
    )
  );

drop policy if exists "Users can view own chat conversations" on public.chat_conversations;
create policy "Users can view own chat conversations"
  on public.chat_conversations for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and (u.id = chat_conversations.buyer_id or u.id = chat_conversations.seller_id)
    )
  );

drop policy if exists "Users can view own chat messages" on public.chat_messages;
create policy "Users can view own chat messages"
  on public.chat_messages for select
  to authenticated
  using (
    exists (
      select 1
      from public.chat_conversations c
      join public.users u on u.auth_user_id = auth.uid()
      where c.id = chat_messages.conversation_id
        and (u.id = c.buyer_id or u.id = c.seller_id)
    )
  );

-- -----------------------------------------------------------------------------
-- 16. Sync Auth Email Confirmation from auth.users -> public.users
-- -----------------------------------------------------------------------------
create or replace function public.sync_auth_email_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.users
       set email_verified = true
     where auth_user_id = new.id
        or lower(email) = lower(new.email);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_auth_email_confirmation on auth.users;
create trigger trg_sync_auth_email_confirmation
  after update of email_confirmed_at on auth.users
  for each row
  execute function public.sync_auth_email_confirmation();
