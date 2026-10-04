-- 005_save_quote.sql — save a draft quote and its items in ONE transaction
-- Run after 004_storage.sql. Safe to re-run.
--
-- The app cannot do "delete all items, then insert the new ones" atomically
-- through separate API calls: a failure in between would leave a quote with no
-- items. This function does the whole save inside a single transaction.
--
-- SECURITY INVOKER: row level security applies as the signed-in user, so a user
-- can only ever save their own quotes (and link their own price items).

create or replace function public.save_quote(p_quote_id uuid, p_fields jsonb, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
begin
  -- Lock the row so two saves of the same quote cannot interleave.
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

  -- Only these columns can be written here. Status, number, token and the
  -- sent/viewed/accepted fields are untouched.
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
         currency        = p_fields->>'currency'
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
