-- 006_voice_and_limits.sql — voice notes on quotes + atomic usage / rate-limit counters
-- Run after 005_save_quote.sql. Safe to re-run.

-- ---------------------------------------------------------------------------
-- save_quote: now also stores voice_note_path and transcript.
-- They are written ONLY when the key is present in p_fields, so callers that do
-- not send them (e.g. duplicate) never overwrite an existing value with null.
-- ---------------------------------------------------------------------------
create or replace function public.save_quote(p_quote_id uuid, p_fields jsonb, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
begin
  select q.status into v_status
    from public.quotes q
   where q.id = p_quote_id
     for update;

  if not found then
    raise exception 'Quote not found.' using errcode = '42501';
  end if;
  if v_status <> 'draft' then
    raise exception 'Only draft quotes can be edited.' using errcode = '55000';
  end if;

  update public.quotes
     set customer_id     = nullif(p_fields->>'customer_id', '')::uuid,
         title           = p_fields->>'title',
         notes           = p_fields->>'notes',
         valid_until     = nullif(p_fields->>'valid_until', '')::date,
         deposit_enabled = (p_fields->>'deposit_enabled')::boolean,
         deposit_bps     = (p_fields->>'deposit_bps')::integer,
         include_photos  = (p_fields->>'include_photos')::boolean,
         subtotal_cents  = (p_fields->>'subtotal_cents')::integer,
         tax_cents       = (p_fields->>'tax_cents')::integer,
         total_cents     = (p_fields->>'total_cents')::integer,
         tax_rate_bps    = (p_fields->>'tax_rate_bps')::integer,
         currency        = p_fields->>'currency',
         voice_note_path = case when p_fields ? 'voice_note_path' then p_fields->>'voice_note_path' else voice_note_path end,
         transcript      = case when p_fields ? 'transcript' then p_fields->>'transcript' else transcript end
   where id = p_quote_id;

  delete from public.quote_items where quote_id = p_quote_id;

  insert into public.quote_items
    (quote_id, position, description, type, qty, unit_rate_cents, amount_cents, price_item_id, needs_price)
  select p_quote_id,
         (e.item->>'position')::integer,
         e.item->>'description',
         e.item->>'type',
         (e.item->>'qty')::numeric,
         (e.item->>'unit_rate_cents')::integer,
         (e.item->>'amount_cents')::integer,
         nullif(e.item->>'price_item_id', '')::uuid,
         coalesce((e.item->>'needs_price')::boolean, false)
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as e(item);
end;
$$;

revoke all on function public.save_quote(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_quote(uuid, jsonb, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Counters. usage_counters and rate_limits are not writable by owners, so these
-- run with the service role only (called from server-only code after auth checks).
-- ---------------------------------------------------------------------------

-- Reserve one AI draft for the period, but only if the limit is not yet reached.
-- Returns the new count, or NULL when the limit has been reached (one atomic statement).
create or replace function public.increment_ai_drafts(p_business_id uuid, p_period text, p_limit integer)
returns integer
language sql
set search_path = ''
as $$
  insert into public.usage_counters as u (business_id, period, ai_drafts)
  values (p_business_id, p_period, 1)
  on conflict (business_id, period)
  do update set ai_drafts = u.ai_drafts + 1
     where u.ai_drafts < p_limit
  returning u.ai_drafts;
$$;

-- Give a reserved draft back (the upstream call failed before producing anything).
create or replace function public.refund_ai_draft(p_business_id uuid, p_period text)
returns void
language sql
set search_path = ''
as $$
  update public.usage_counters
     set ai_drafts = greatest(ai_drafts - 1, 0)
   where business_id = p_business_id and period = p_period;
$$;

-- Count a hit in a fixed window and return the new count.
create or replace function public.rate_limit_hit(p_ip text, p_key text, p_window_start timestamptz)
returns integer
language sql
set search_path = ''
as $$
  insert into public.rate_limits as r (ip, key, window_start, count)
  values (p_ip, p_key, p_window_start, 1)
  on conflict (ip, key, window_start)
  do update set count = r.count + 1
  returning r.count;
$$;

revoke all on function public.increment_ai_drafts(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.refund_ai_draft(uuid, text) from public, anon, authenticated;
revoke all on function public.rate_limit_hit(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.increment_ai_drafts(uuid, text, integer) to service_role;
grant execute on function public.refund_ai_draft(uuid, text) to service_role;
grant execute on function public.rate_limit_hit(text, text, timestamptz) to service_role;
