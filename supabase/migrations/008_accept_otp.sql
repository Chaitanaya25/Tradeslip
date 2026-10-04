-- 008_accept_otp.sql — customers prove they own the email on file before accepting
-- Run after 007_public_quotes.sql. Safe to re-run.
--
-- Anyone holding a quote link used to be able to accept it. Now, when the customer has an
-- email address on file, accepting needs a 6-digit code sent to that address. The code is
-- stored only as a salted hash (the salt/pepper lives in the app, not the database).
-- All functions are SECURITY DEFINER with an empty search_path, service role only.

-- ---------------------------------------------------------------------------
-- Table: RLS on, NO policies, no access for anon/authenticated (service role only).
-- ---------------------------------------------------------------------------
create table if not exists public.quote_accept_otps (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references public.quotes (id) on delete cascade,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    integer not null default 0,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists quote_accept_otps_quote_idx on public.quote_accept_otps (quote_id, created_at desc);

alter table public.quote_accept_otps enable row level security;
revoke all on public.quote_accept_otps from anon, authenticated;

alter table public.quotes add column if not exists accepted_verified boolean not null default false;

-- ---------------------------------------------------------------------------
-- get_public_quote: as in 007, plus whether acceptance needs an emailed code and
-- whether the acceptance was verified. The customer's email itself is never returned.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_quote(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q        record;
  b        record;
  c        record;
  v_today  date;
  v_status text;
  v_items  jsonb;
  v_photos jsonb := '[]'::jsonb;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;

  select * into q from public.quotes where public_token = p_token;
  if not found or q.status = 'draft' then
    return null;
  end if;

  select * into b from public.businesses where id = q.business_id;
  select * into c from public.customers where id = q.customer_id;

  v_today := (now() at time zone b.timezone)::date;
  v_status := case
    when q.status in ('sent', 'viewed') and q.valid_until is not null and q.valid_until < v_today then 'expired'
    else q.status
  end;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'description', i.description,
               'qty', i.qty,
               'unit_rate_cents', i.unit_rate_cents,
               'amount_cents', i.amount_cents,
               'position', i.position
             ) order by i.position
           ),
           '[]'::jsonb)
    into v_items
    from public.quote_items i
   where i.quote_id = q.id;

  if q.include_photos then
    select coalesce(
             jsonb_agg(jsonb_build_object('path', p.storage_path, 'kind', p.kind) order by p.position),
             '[]'::jsonb)
      into v_photos
      from public.job_photos p
     where p.quote_id = q.id;
  end if;

  return jsonb_build_object(
    'quote', jsonb_build_object(
      'number', q.number,
      'number_prefix', b.quote_prefix,
      'status', v_status,
      'title', q.title,
      'notes', q.notes,
      'terms', q.terms,
      'valid_until', q.valid_until,
      'deposit_enabled', q.deposit_enabled,
      'deposit_bps', q.deposit_bps,
      'include_photos', q.include_photos,
      'subtotal_cents', q.subtotal_cents,
      'tax_cents', q.tax_cents,
      'total_cents', q.total_cents,
      'currency', q.currency,
      'tax_rate_bps', q.tax_rate_bps,
      'accepted_at', q.accepted_at,
      'accepted_name', q.accepted_name,
      'accepted_verified', q.accepted_verified,
      'declined_at', q.declined_at,
      'decline_reason', q.decline_reason,
      -- true when the customer has an email on file, so accepting needs an emailed code
      'requires_verification', coalesce(btrim(c.email), '') <> ''
    ),
    'items', v_items,
    'customer', jsonb_build_object(
      'name', c.name,
      'address_line1', c.address_line1,
      'city', c.city,
      'region', c.region,
      'postcode', c.postcode
    ),
    'business', jsonb_build_object(
      'name', b.name,
      'country', b.country,
      'timezone', b.timezone,
      'logo_path', b.logo_path,
      'phone', b.phone,
      'email', b.email,
      'trade', b.trade,
      'tax_number', b.tax_number,
      'tax_label', b.tax_label,
      'payment_link_url', b.payment_link_url,
      'plan_branding', b.plan in ('trial', 'free')
    ),
    'photos', v_photos
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- get_accept_target(token): the facts the server needs to email a code. Includes the
-- customer's email, so it is for server-side use only and its result is never sent to a browser.
-- ---------------------------------------------------------------------------
create or replace function public.get_accept_target(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q record;
  b record;
  c record;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;
  select * into q from public.quotes where public_token = p_token;
  if not found or q.status = 'draft' then
    return null;
  end if;
  select * into b from public.businesses where id = q.business_id;
  select * into c from public.customers where id = q.customer_id;

  return jsonb_build_object(
    'email', nullif(btrim(c.email), ''),
    'customer_name', c.name,
    'business_name', b.name,
    'business_email', b.email,
    'logo_path', b.logo_path,
    'country', b.country,
    'number', q.number,
    'number_prefix', b.quote_prefix
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- issue_accept_otp(token, code_hash) -> 'ok' | 'cooldown' | 'too_many' | 'not_allowed' | 'not_found'
-- ---------------------------------------------------------------------------
create or replace function public.issue_accept_otp(p_token text, p_code_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  q       record;
  c       record;
  v_tz    text;
  v_today date;
  v_last  timestamptz;
  v_recent integer;
begin
  if p_token is null or length(p_token) < 32 or p_code_hash is null or length(p_code_hash) < 32 then
    return 'not_found';
  end if;

  -- The row lock makes two simultaneous requests take turns, so the limits below cannot be raced.
  select * into q from public.quotes where public_token = p_token for update;
  if not found or q.status = 'draft' then
    return 'not_found';
  end if;
  if q.status not in ('sent', 'viewed') then
    return 'not_allowed';
  end if;

  select timezone into v_tz from public.businesses where id = q.business_id;
  v_today := (now() at time zone coalesce(v_tz, 'UTC'))::date;
  if q.valid_until is not null and q.valid_until < v_today then
    return 'not_allowed';
  end if;

  select * into c from public.customers where id = q.customer_id;
  if coalesce(btrim(c.email), '') = '' then
    return 'not_allowed';
  end if;

  select max(created_at) into v_last from public.quote_accept_otps where quote_id = q.id;
  if v_last is not null and v_last > now() - interval '60 seconds' then
    return 'cooldown';
  end if;

  select count(*) into v_recent
    from public.quote_accept_otps
   where quote_id = q.id and created_at > now() - interval '1 hour';
  if v_recent >= 3 then
    return 'too_many';
  end if;

  -- Only the newest code works.
  update public.quote_accept_otps set used_at = now() where quote_id = q.id and used_at is null;

  insert into public.quote_accept_otps (quote_id, code_hash, expires_at)
  values (q.id, p_code_hash, now() + interval '10 minutes');

  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- accept_quote_verified(token, name, code_hash, ip, ua)
--   -> (result, attempts_left)
--   result: ok | already_accepted | expired | not_allowed | invalid | not_found
--           | wrong_code | locked | expired_code
-- ---------------------------------------------------------------------------
create or replace function public.accept_quote_verified(
  p_token text, p_name text, p_code_hash text, p_ip text, p_ua text
)
returns table (result text, attempts_left integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  q       record;
  o       record;
  v_tz    text;
  v_today date;
  v_name  text := btrim(coalesce(p_name, ''));
  v_attempts integer;
begin
  if p_token is null or length(p_token) < 32 then
    return query select 'not_found'::text, null::integer;
    return;
  end if;

  select * into q from public.quotes where public_token = p_token for update;
  if not found or q.status = 'draft' then
    return query select 'not_found'::text, null::integer;
    return;
  end if;

  -- Idempotent: a repeat after success changes nothing.
  if q.status = 'accepted' then
    return query select 'already_accepted'::text, null::integer;
    return;
  end if;
  if q.status = 'expired' then
    return query select 'expired'::text, null::integer;
    return;
  end if;
  if q.status not in ('sent', 'viewed') then
    return query select 'not_allowed'::text, null::integer;
    return;
  end if;

  select timezone into v_tz from public.businesses where id = q.business_id;
  v_today := (now() at time zone coalesce(v_tz, 'UTC'))::date;
  if q.valid_until is not null and q.valid_until < v_today then
    return query select 'expired'::text, null::integer;
    return;
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    return query select 'invalid'::text, null::integer;
    return;
  end if;

  -- The newest code that has not been used.
  select * into o
    from public.quote_accept_otps
   where quote_id = q.id and used_at is null
   order by created_at desc
   limit 1
     for update;

  if not found or o.expires_at <= now() then
    return query select 'expired_code'::text, null::integer;
    return;
  end if;
  if o.attempts >= 5 then
    return query select 'locked'::text, 0;
    return;
  end if;

  if o.code_hash <> coalesce(p_code_hash, '') then
    v_attempts := o.attempts + 1;
    update public.quote_accept_otps set attempts = v_attempts where id = o.id;
    if v_attempts >= 5 then
      return query select 'locked'::text, 0;
    else
      return query select 'wrong_code'::text, 5 - v_attempts;
    end if;
    return;
  end if;

  update public.quote_accept_otps set used_at = now() where id = o.id;

  update public.quotes
     set status = 'accepted',
         accepted_at = now(),
         accepted_name = v_name,
         accepted_ip = left(coalesce(p_ip, ''), 64),
         accepted_user_agent = left(coalesce(p_ua, ''), 300),
         accepted_verified = true,
         viewed_at = coalesce(viewed_at, now())
   where id = q.id;

  insert into public.activity (business_id, entity_type, entity_id, event, meta)
  values (q.business_id, 'quote', q.id, 'quote.accepted', jsonb_build_object('name', v_name, 'verified', true));

  return query select 'ok'::text, null::integer;
end;
$$;

-- ---------------------------------------------------------------------------
-- accept_quote (unverified): ONLY for customers with no email on file. If there is an
-- email, it refuses, so the code step cannot be skipped.
-- ---------------------------------------------------------------------------
create or replace function public.accept_quote(p_token text, p_name text, p_ip text, p_ua text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  q       record;
  c       record;
  v_tz    text;
  v_today date;
  v_name  text := btrim(coalesce(p_name, ''));
begin
  if p_token is null or length(p_token) < 32 then
    return 'not_found';
  end if;

  select * into q from public.quotes where public_token = p_token for update;
  if not found or q.status = 'draft' then
    return 'not_found';
  end if;

  if q.status = 'accepted' then
    return 'already_accepted';
  end if;
  if q.status = 'expired' then
    return 'expired';
  end if;
  if q.status not in ('sent', 'viewed') then
    return 'not_allowed';
  end if;

  select timezone into v_tz from public.businesses where id = q.business_id;
  v_today := (now() at time zone coalesce(v_tz, 'UTC'))::date;
  if q.valid_until is not null and q.valid_until < v_today then
    return 'expired';
  end if;

  select * into c from public.customers where id = q.customer_id;
  if coalesce(btrim(c.email), '') <> '' then
    return 'not_allowed';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    return 'invalid';
  end if;

  update public.quotes
     set status = 'accepted',
         accepted_at = now(),
         accepted_name = v_name,
         accepted_ip = left(coalesce(p_ip, ''), 64),
         accepted_user_agent = left(coalesce(p_ua, ''), 300),
         accepted_verified = false,
         viewed_at = coalesce(viewed_at, now())
   where id = q.id;

  insert into public.activity (business_id, entity_type, entity_id, event, meta)
  values (q.business_id, 'quote', q.id, 'quote.accepted', jsonb_build_object('name', v_name, 'verified', false));
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- Service role only.
-- ---------------------------------------------------------------------------
revoke all on function public.get_public_quote(text) from public, anon, authenticated;
revoke all on function public.get_accept_target(text) from public, anon, authenticated;
revoke all on function public.issue_accept_otp(text, text) from public, anon, authenticated;
revoke all on function public.accept_quote_verified(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.accept_quote(text, text, text, text) from public, anon, authenticated;

grant execute on function public.get_public_quote(text) to service_role;
grant execute on function public.get_accept_target(text) to service_role;
grant execute on function public.issue_accept_otp(text, text) to service_role;
grant execute on function public.accept_quote_verified(text, text, text, text, text) to service_role;
grant execute on function public.accept_quote(text, text, text, text) to service_role;
