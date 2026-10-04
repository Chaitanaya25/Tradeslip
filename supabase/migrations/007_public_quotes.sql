-- 007_public_quotes.sql — what a customer can see and do with a quote link
-- Run after 006_voice_and_limits.sql. Safe to re-run.
--
-- Every function here is SECURITY DEFINER and executable ONLY by the service role.
-- Public pages call them from server-only code; browsers (anon or signed in) cannot
-- call them directly. A function returns exactly the fields the customer needs.

-- ---------------------------------------------------------------------------
-- get_public_quote(token): the customer's view of a quote, as JSON.
-- Unknown tokens and drafts both return NULL (indistinguishable). Never returns ids,
-- the owner's email, the token, the plan name or any other customer's data.
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
  -- Open quotes past their date read as expired, whatever is stored.
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

  -- Storage paths are used server-side to create short-lived signed URLs and are not sent on to the browser.
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
      'declined_at', q.declined_at,
      'decline_reason', q.decline_reason
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
      -- Whether to show the "Sent with Tradeslip" footer. The plan itself is never exposed.
      'plan_branding', b.plan in ('trial', 'free')
    ),
    'photos', v_photos
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- record_quote_view(token): true only for the first view of a sent quote.
-- ---------------------------------------------------------------------------
create or replace function public.record_quote_view(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id  uuid;
  v_biz uuid;
begin
  if p_token is null or length(p_token) < 32 then
    return false;
  end if;

  update public.quotes
     set status = 'viewed', viewed_at = now()
   where public_token = p_token
     and status = 'sent'
     and viewed_at is null
  returning id, business_id into v_id, v_biz;

  if v_id is null then
    return false;
  end if;

  insert into public.activity (business_id, entity_type, entity_id, event, meta)
  values (v_biz, 'quote', v_id, 'quote.viewed', '{}'::jsonb);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- accept_quote(token, name, ip, user agent) -> 'ok' | 'already_accepted' | 'expired'
--                                              | 'not_allowed' | 'invalid' | 'not_found'
-- Atomic (row lock) and idempotent: a second accept changes nothing.
-- ---------------------------------------------------------------------------
create or replace function public.accept_quote(p_token text, p_name text, p_ip text, p_ua text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  q       record;
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

  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    return 'invalid';
  end if;

  update public.quotes
     set status = 'accepted',
         accepted_at = now(),
         accepted_name = v_name,
         accepted_ip = left(coalesce(p_ip, ''), 64),
         accepted_user_agent = left(coalesce(p_ua, ''), 300),
         viewed_at = coalesce(viewed_at, now())
   where id = q.id;

  insert into public.activity (business_id, entity_type, entity_id, event, meta)
  values (q.business_id, 'quote', q.id, 'quote.accepted', jsonb_build_object('name', v_name));
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- decline_quote(token, reason) -> 'ok' | 'already_declined' | 'expired' | 'not_allowed' | 'not_found'
-- ---------------------------------------------------------------------------
create or replace function public.decline_quote(p_token text, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  q        record;
  v_tz     text;
  v_today  date;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
begin
  if p_token is null or length(p_token) < 32 then
    return 'not_found';
  end if;

  select * into q from public.quotes where public_token = p_token for update;
  if not found or q.status = 'draft' then
    return 'not_found';
  end if;

  if q.status = 'declined' then
    return 'already_declined';
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

  update public.quotes
     set status = 'declined',
         declined_at = now(),
         decline_reason = v_reason,
         viewed_at = coalesce(viewed_at, now())
   where id = q.id;

  insert into public.activity (business_id, entity_type, entity_id, event, meta)
  values (q.business_id, 'quote', q.id, 'quote.declined',
          case when v_reason is null then '{}'::jsonb else jsonb_build_object('reason', v_reason) end);
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- Free-plan send counter (same atomic pattern as the AI draft counter).
-- ---------------------------------------------------------------------------
create or replace function public.reserve_quote_send(p_business_id uuid, p_period text, p_limit integer)
returns integer
language sql
set search_path = ''
as $$
  insert into public.usage_counters as u (business_id, period, quotes_sent)
  values (p_business_id, p_period, 1)
  on conflict (business_id, period)
  do update set quotes_sent = u.quotes_sent + 1
     where u.quotes_sent < p_limit
  returning u.quotes_sent;
$$;

create or replace function public.refund_quote_send(p_business_id uuid, p_period text)
returns void
language sql
set search_path = ''
as $$
  update public.usage_counters
     set quotes_sent = greatest(quotes_sent - 1, 0)
   where business_id = p_business_id and period = p_period;
$$;

-- ---------------------------------------------------------------------------
-- Service role only.
-- ---------------------------------------------------------------------------
revoke all on function public.get_public_quote(text) from public, anon, authenticated;
revoke all on function public.record_quote_view(text) from public, anon, authenticated;
revoke all on function public.accept_quote(text, text, text, text) from public, anon, authenticated;
revoke all on function public.decline_quote(text, text) from public, anon, authenticated;
revoke all on function public.reserve_quote_send(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.refund_quote_send(uuid, text) from public, anon, authenticated;

grant execute on function public.get_public_quote(text) to service_role;
grant execute on function public.record_quote_view(text) to service_role;
grant execute on function public.accept_quote(text, text, text, text) to service_role;
grant execute on function public.decline_quote(text, text) to service_role;
grant execute on function public.reserve_quote_send(uuid, text, integer) to service_role;
grant execute on function public.refund_quote_send(uuid, text) to service_role;
