-- seed.sql — demo data for "Miller Plumbing" (US). Run once in the SQL editor
-- to install the functions, then, AFTER you have signed up in the app:
--
--   select public.seed_demo_data(id) from auth.users where email = 'you@example.com';
--
-- Safe to re-run: the functions are replaced, and seeding is skipped if that
-- user already has a business. Dates are relative to today so the dashboard
-- always looks current. All amounts are integer cents; tax is 8% (800 bps).

-- ---------------------------------------------------------------------------
-- Helpers (not callable from the browser)
-- ---------------------------------------------------------------------------

-- Insert line items from a JSON array of {d, t, q, r, pi} objects:
--   d = description, t = type, q = qty, r = unit rate in cents,
--   pi = price-book item name to link (optional).
create or replace function public.seed_add_items(
  p_kind text, p_parent uuid, p_business uuid, p_items jsonb
) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_kind = 'quote' then
    insert into public.quote_items
      (quote_id, position, description, type, qty, unit_rate_cents, amount_cents, price_item_id)
    select p_parent, (e.ord - 1)::int, e.item->>'d', coalesce(e.item->>'t', 'labour'),
           (e.item->>'q')::numeric, (e.item->>'r')::int,
           round((e.item->>'q')::numeric * (e.item->>'r')::numeric)::int,
           (select p.id from public.price_items p
             where p.business_id = p_business and p.name = e.item->>'pi')
    from jsonb_array_elements(p_items) with ordinality as e(item, ord);
  else
    insert into public.invoice_items
      (invoice_id, position, description, type, qty, unit_rate_cents, amount_cents, price_item_id)
    select p_parent, (e.ord - 1)::int, e.item->>'d', coalesce(e.item->>'t', 'labour'),
           (e.item->>'q')::numeric, (e.item->>'r')::int,
           round((e.item->>'q')::numeric * (e.item->>'r')::numeric)::int,
           (select p.id from public.price_items p
             where p.business_id = p_business and p.name = e.item->>'pi')
    from jsonb_array_elements(p_items) with ordinality as e(item, ord);
  end if;
end;
$$;

-- Recompute subtotal / tax / total from the items (tax rounded half up).
create or replace function public.seed_recalc(p_kind text, p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_kind = 'quote' then
    update public.quotes q
       set subtotal_cents = s.sub,
           tax_cents = round(s.sub * q.tax_rate_bps / 10000.0)::int,
           total_cents = s.sub + round(s.sub * q.tax_rate_bps / 10000.0)::int
      from (select coalesce(sum(amount_cents), 0)::int as sub
              from public.quote_items where quote_id = p_id) s
     where q.id = p_id;
  else
    update public.invoices i
       set subtotal_cents = s.sub,
           tax_cents = round(s.sub * i.tax_rate_bps / 10000.0)::int,
           total_cents = s.sub + round(s.sub * i.tax_rate_bps / 10000.0)::int
      from (select coalesce(sum(amount_cents), 0)::int as sub
              from public.invoice_items where invoice_id = p_id) s
     where i.id = p_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- seed_demo_data(owner)
-- ---------------------------------------------------------------------------
create or replace function public.seed_demo_data(p_owner uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  tz       constant text := 'America/New_York';
  v_email  text;
  biz      uuid;
  c_sarah uuid; c_james uuid; c_priya uuid; c_mark uuid;
  c_tom   uuid; c_linda uuid; c_robert uuid; c_grace uuid;
  q_tom uuid; q_james uuid; q_sarah uuid; q_priya uuid; q_grace uuid;
  q_linda uuid; q_mark uuid; q_robert uuid; q_old uuid; q_draft uuid;
  i_linda uuid; i_priya uuid; i_tom uuid; i_mark uuid; i_grace uuid;
  i_sarah uuid; i_robert uuid; i_new uuid;
  inv  uuid;
  k    integer;
  hist_totals int[] := array[38000, 52000, 27500, 91000, 64000, 33000, 120000, 45000];
  hist_jobs   text[] := array[
    'Bathroom faucet and supply lines', 'Kitchen sink drain replacement',
    'Water heater flush and anode rod', 'Basement bathroom rough-in',
    'Toilet replacement', 'Sump pump check valve', 'Whole-house water filter install',
    'Outdoor hose bibs, front and rear'];
  hist_custs  uuid[];
  today_local date := (now() at time zone tz)::date;
begin
  select u.email into v_email from auth.users u where u.id = p_owner;
  if not found then
    raise exception 'No auth user with id %. Sign up in the app first, then pass that user''s id.', p_owner;
  end if;

  if exists (select 1 from public.businesses b where b.owner_id = p_owner) then
    return 'Skipped: this user already has a business.';
  end if;

  -- Business -----------------------------------------------------------
  insert into public.businesses (
    owner_id, name, trade, phone, email, address_line1, city, region, postcode,
    country, currency, timezone, tax_enabled, tax_label, tax_rate_bps, tax_number,
    default_hourly_rate_cents, callout_fee_cents, payment_terms_days, quote_validity_days,
    payment_link_url, quote_prefix, invoice_prefix, next_quote_number, next_invoice_number,
    reminders_enabled, plan, trial_ends_at, onboarded_at
  ) values (
    p_owner, 'Miller Plumbing', 'Plumber', '(413) 555-0142', v_email,
    '58 Industrial Way', 'Springfield', 'MA', '01103',
    'US', 'USD', tz, true, 'Sales tax', 800, null,
    9500, 4500, 14, 30,
    'https://pay.example.com/miller-plumbing', '', 'INV-', 1050, 1027,
    true, 'trial', now() + interval '11 days', now() - interval '3 days'
  ) returning id into biz;

  -- Customers ----------------------------------------------------------
  insert into public.customers (business_id, name, email, phone, address_line1, city, region, postcode, notes)
  values (biz, 'Sarah Thompson', 'sarah.thompson@gmail.com', '(413) 555-0182', '42 Maple Avenue', 'Springfield', 'MA', '01103', 'Dog in the yard. Use the side gate.')
  returning id into c_sarah;
  insert into public.customers (business_id, name, email, phone, address_line1, city, region, postcode)
  values (biz, 'James O''Connor', 'james.oconnor@outlook.com', '(617) 555-0147', '88 Pine Road', 'Somerville', 'MA', '02143')
  returning id into c_james;
  insert into public.customers (business_id, name, email, phone, address_line1, city, region, postcode)
  values (biz, 'Priya Patel', 'priya.patel@gmail.com', '(617) 555-0119', '27 Willow Avenue', 'Cambridge', 'MA', '02139')
  returning id into c_priya;
  insert into public.customers (business_id, name, email, phone, address_line1, city, region, postcode)
  values (biz, 'Mark Evans', 'mark.evans@yahoo.com', '(781) 555-0163', '14 Cedar Road', 'Waltham', 'MA', '02451')
  returning id into c_mark;
  insert into public.customers (business_id, name, email, phone, address_line1, city, region, postcode)
  values (biz, 'Tom Hughes', 'tom.hughes@gmail.com', '(617) 555-0128', '3 Brook Street', 'Newton', 'MA', '02458')
  returning id into c_tom;
  insert into public.customers (business_id, name, email, phone, address_line1, city, region, postcode, notes)
  values (biz, 'Linda Alvarez', 'linda.alvarez@gmail.com', '(413) 555-0176', '91 Elm Street', 'Springfield', 'MA', '01108', 'Prefers a text before arrival.')
  returning id into c_linda;
  insert into public.customers (business_id, name, email, phone, address_line1, city, region, postcode)
  values (biz, 'Robert Chen', 'robert.chen@gmail.com', '(617) 555-0191', '7 Harbor Lane', 'Quincy', 'MA', '02169')
  returning id into c_robert;
  insert into public.customers (business_id, name, email, phone, address_line1, city, region, postcode)
  values (biz, 'Grace Okafor', 'grace.okafor@gmail.com', '(617) 555-0154', '120 Birch Court', 'Brookline', 'MA', '02446')
  returning id into c_grace;

  -- Price book (12 items) ---------------------------------------------
  insert into public.price_items (business_id, name, type, unit, rate_cents, markup_bps) values
    (biz, 'Call-out fee',                      'fee',      'job',  4500,    0),
    (biz, 'Hourly labour',                     'labour',   'hour', 9500,    0),
    (biz, 'Mixer tap replacement — labour',    'labour',   'job',  12000,   0),
    (biz, 'Leak repair under sink — labour',   'labour',   'job',  6500,    0),
    (biz, 'Mixer tap (materials)',             'material', 'item', 8000,    0),
    (biz, 'Toilet repair — labour',            'labour',   'job',  9000,    0),
    (biz, 'Water heater service',              'labour',   'job',  14000,   0),
    (biz, 'Unblock drain — labour',            'labour',   'job',  11000,   0),
    (biz, 'Outside tap installation — labour', 'labour',   'job',  15000,   0),
    (biz, 'Copper pipe, per metre',            'material', 'm',    1200,    2000),
    (biz, 'Pipe fittings and sealant',         'material', 'item', 1800,    2500),
    (biz, 'Shut-off valve',                    'material', 'item', 2800,    0);

  -- Quotes -------------------------------------------------------------
  -- 1040 expired (Linda)
  insert into public.quotes (business_id, customer_id, number, title, status, valid_until, currency, tax_rate_bps,
                             sent_at, viewed_at, notes)
  values (biz, c_linda, 1040, 'Replace two outdoor hose bibs', 'expired', today_local - 15, 'USD', 800,
          now() - interval '45 days', now() - interval '44 days', 'Frost-proof bibs, both fitted with new shut-offs.')
  returning id into q_old;
  perform public.seed_add_items('quote', q_old, biz, '[
    {"d":"Outside tap installation — labour","t":"labour","q":2,"r":15000,"pi":"Outside tap installation — labour"},
    {"d":"Shut-off valve","t":"material","q":2,"r":2800,"pi":"Shut-off valve"}]'::jsonb);
  perform public.seed_recalc('quote', q_old);

  -- 1041 sent, expires tomorrow (Tom)
  insert into public.quotes (business_id, customer_id, number, title, status, valid_until, currency, tax_rate_bps,
                             sent_at, notes)
  values (biz, c_tom, 1041, 'Outside tap installation', 'sent', today_local + 1, 'USD', 800,
          now() - interval '29 days', 'Includes up to 3 m of new copper supply pipe.')
  returning id into q_tom;
  perform public.seed_add_items('quote', q_tom, biz, '[
    {"d":"Outside tap installation — labour","t":"labour","q":1,"r":15000,"pi":"Outside tap installation — labour"},
    {"d":"Copper pipe, per metre","t":"material","q":3,"r":1440,"pi":"Copper pipe, per metre"},
    {"d":"Pipe fittings and sealant","t":"material","q":1,"r":2250,"pi":"Pipe fittings and sealant"},
    {"d":"Call-out fee","t":"fee","q":1,"r":4500,"pi":"Call-out fee"}]'::jsonb);
  perform public.seed_recalc('quote', q_tom);

  -- 1042 sent 3 days ago, no reply (James)
  insert into public.quotes (business_id, customer_id, number, title, status, valid_until, currency, tax_rate_bps,
                             sent_at)
  values (biz, c_james, 1042, 'Water heater service', 'sent', today_local + 27, 'USD', 800,
          now() - interval '3 days')
  returning id into q_james;
  perform public.seed_add_items('quote', q_james, biz, '[
    {"d":"Water heater service","t":"labour","q":1,"r":14000,"pi":"Water heater service"},
    {"d":"Call-out fee","t":"fee","q":1,"r":4500,"pi":"Call-out fee"}]'::jsonb);
  perform public.seed_recalc('quote', q_james);

  -- 1043 accepted, scheduled today 8:00 (Sarah) — matches the quote builder reference
  insert into public.quotes (business_id, customer_id, number, title, status, valid_until, currency, tax_rate_bps,
                             deposit_enabled, deposit_bps, sent_at, viewed_at, accepted_at, accepted_name,
                             accepted_ip, accepted_user_agent, scheduled_for, transcript, notes)
  values (biz, c_sarah, 1043, 'Kitchen tap replacement', 'accepted', today_local + 25, 'USD', 800,
          true, 3000, now() - interval '4 days', now() - interval '4 days' + interval '2 hours',
          now() - interval '3 days', 'Sarah Thompson', '203.0.113.24',
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
          ((today_local + time '08:00') at time zone tz),
          'Sarah Thompson, 42 Maple Avenue, replace the kitchen mixer tap and fix the leak under the sink, parts about eighty dollars.',
          'Old tap and parts taken away. Water will be off for about an hour.')
  returning id into q_sarah;
  perform public.seed_add_items('quote', q_sarah, biz, '[
    {"d":"Kitchen mixer tap replacement — labour","t":"labour","q":1,"r":12000,"pi":"Mixer tap replacement — labour"},
    {"d":"Leak repair under sink — labour","t":"labour","q":1,"r":6500,"pi":"Leak repair under sink — labour"},
    {"d":"Mixer tap (materials)","t":"material","q":1,"r":8000,"pi":"Mixer tap (materials)"},
    {"d":"Call-out fee","t":"fee","q":1,"r":4500,"pi":"Call-out fee"}]'::jsonb);
  perform public.seed_recalc('quote', q_sarah);

  -- 1044 accepted, already invoiced (Priya)
  insert into public.quotes (business_id, customer_id, number, title, status, valid_until, currency, tax_rate_bps,
                             sent_at, viewed_at, accepted_at, accepted_name, accepted_ip, accepted_user_agent)
  values (biz, c_priya, 1044, 'Bathroom leak repair', 'accepted', today_local + 3, 'USD', 800,
          now() - interval '27 days', now() - interval '27 days' + interval '1 hour',
          now() - interval '25 days', 'Priya Patel', '198.51.100.77',
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36')
  returning id into q_priya;
  perform public.seed_add_items('quote', q_priya, biz, '[
    {"d":"Hourly labour","t":"labour","q":3,"r":9500,"pi":"Hourly labour"},
    {"d":"Pipe fittings and sealant","t":"material","q":2,"r":2250,"pi":"Pipe fittings and sealant"},
    {"d":"Shut-off valve","t":"material","q":2,"r":2800,"pi":"Shut-off valve"}]'::jsonb);
  perform public.seed_recalc('quote', q_priya);

  -- 1045 accepted, scheduled today 11:30 (Grace)
  insert into public.quotes (business_id, customer_id, number, title, status, valid_until, currency, tax_rate_bps,
                             sent_at, viewed_at, accepted_at, accepted_name, accepted_ip, accepted_user_agent,
                             scheduled_for)
  values (biz, c_grace, 1045, 'Toilet repair and shut-off valve', 'accepted', today_local + 26, 'USD', 800,
          now() - interval '5 days', now() - interval '5 days' + interval '30 minutes',
          now() - interval '3 days', 'Grace Okafor', '192.0.2.58',
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
          ((today_local + time '11:30') at time zone tz))
  returning id into q_grace;
  perform public.seed_add_items('quote', q_grace, biz, '[
    {"d":"Toilet repair — labour","t":"labour","q":1,"r":9000,"pi":"Toilet repair — labour"},
    {"d":"Shut-off valve","t":"material","q":1,"r":2800,"pi":"Shut-off valve"}]'::jsonb);
  perform public.seed_recalc('quote', q_grace);

  -- 1046 accepted, scheduled today 14:00 (Linda)
  insert into public.quotes (business_id, customer_id, number, title, status, valid_until, currency, tax_rate_bps,
                             sent_at, viewed_at, accepted_at, accepted_name, accepted_ip, accepted_user_agent,
                             scheduled_for)
  values (biz, c_linda, 1046, 'Unblock kitchen drain', 'accepted', today_local + 28, 'USD', 800,
          now() - interval '2 days', now() - interval '2 days' + interval '20 minutes',
          now() - interval '1 day', 'Linda Alvarez', '203.0.113.9',
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
          ((today_local + time '14:00') at time zone tz))
  returning id into q_linda;
  perform public.seed_add_items('quote', q_linda, biz, '[
    {"d":"Unblock drain — labour","t":"labour","q":1,"r":11000,"pi":"Unblock drain — labour"},
    {"d":"Call-out fee","t":"fee","q":1,"r":4500,"pi":"Call-out fee"}]'::jsonb);
  perform public.seed_recalc('quote', q_linda);

  -- 1047 viewed (Mark)
  insert into public.quotes (business_id, customer_id, number, title, status, valid_until, currency, tax_rate_bps,
                             deposit_enabled, deposit_bps, sent_at, viewed_at)
  values (biz, c_mark, 1047, 'Garage utility sink and supply lines', 'viewed', today_local + 28, 'USD', 800,
          true, 3000, now() - interval '2 days', now() - interval '1 day')
  returning id into q_mark;
  perform public.seed_add_items('quote', q_mark, biz, '[
    {"d":"Hourly labour","t":"labour","q":8,"r":9500,"pi":"Hourly labour"},
    {"d":"Copper pipe, per metre","t":"material","q":12,"r":1440,"pi":"Copper pipe, per metre"},
    {"d":"Pipe fittings and sealant","t":"material","q":4,"r":2250,"pi":"Pipe fittings and sealant"},
    {"d":"Shut-off valve","t":"material","q":2,"r":2800,"pi":"Shut-off valve"}]'::jsonb);
  perform public.seed_recalc('quote', q_mark);

  -- 1048 declined (Robert)
  insert into public.quotes (business_id, customer_id, number, title, status, valid_until, currency, tax_rate_bps,
                             sent_at, viewed_at, declined_at, decline_reason)
  values (biz, c_robert, 1048, 'Re-pipe upstairs bathroom', 'declined', today_local + 20, 'USD', 800,
          now() - interval '9 days', now() - interval '8 days', now() - interval '6 days',
          'Went with another quote that was a bit cheaper.')
  returning id into q_robert;
  perform public.seed_add_items('quote', q_robert, biz, '[
    {"d":"Hourly labour","t":"labour","q":16,"r":9500,"pi":"Hourly labour"},
    {"d":"Copper pipe, per metre","t":"material","q":25,"r":1440,"pi":"Copper pipe, per metre"},
    {"d":"Pipe fittings and sealant","t":"material","q":8,"r":2250,"pi":"Pipe fittings and sealant"}]'::jsonb);
  perform public.seed_recalc('quote', q_robert);

  -- 1049 draft (Robert)
  insert into public.quotes (business_id, customer_id, number, title, status, valid_until, currency, tax_rate_bps)
  values (biz, c_robert, 1049, 'Basement bathroom rough-in', 'draft', today_local + 30, 'USD', 800)
  returning id into q_draft;
  perform public.seed_add_items('quote', q_draft, biz, '[
    {"d":"Hourly labour","t":"labour","q":12,"r":9500,"pi":"Hourly labour"},
    {"d":"Pipe fittings and sealant","t":"material","q":6,"r":2250,"pi":"Pipe fittings and sealant"},
    {"d":"Shut-off valve","t":"material","q":3,"r":2800,"pi":"Shut-off valve"}]'::jsonb);
  perform public.seed_recalc('quote', q_draft);

  -- Invoices -----------------------------------------------------------
  -- 1010-1017: older paid work so the 6-month chart has history
  hist_custs := array[c_sarah, c_james, c_priya, c_mark, c_tom, c_linda, c_robert, c_grace];
  for k in 0..7 loop
    insert into public.invoices (business_id, customer_id, number, status, issue_date, due_date, currency,
                                 tax_rate_bps, sent_at, viewed_at, paid_at, payment_method)
    values (biz, hist_custs[k + 1], 1010 + k, 'paid',
            today_local - (170 - 18 * k), today_local - (170 - 18 * k) + 14, 'USD', 800,
            now() - ((170 - 18 * k) || ' days')::interval,
            now() - ((169 - 18 * k) || ' days')::interval,
            now() - ((160 - 18 * k) || ' days')::interval,
            (array['card', 'cash', 'bank_transfer', 'card'])[(k % 4) + 1])
    returning id into inv;
    perform public.seed_add_items('invoice', inv, biz, jsonb_build_array(jsonb_build_object(
      'd', hist_jobs[k + 1], 't', 'labour', 'q', 1,
      'r', round(hist_totals[k + 1] / 1.08)::int)));
    perform public.seed_recalc('invoice', inv);
    update public.invoices set amount_paid_cents = total_cents where id = inv;
  end loop;

  -- 1018 paid (Robert)
  insert into public.invoices (business_id, customer_id, number, status, issue_date, due_date, currency,
                               tax_rate_bps, sent_at, viewed_at, paid_at, payment_method)
  values (biz, c_robert, 1018, 'paid', today_local - 40, today_local - 26, 'USD', 800,
          now() - interval '40 days', now() - interval '39 days', now() - interval '35 days', 'card')
  returning id into i_robert;
  perform public.seed_add_items('invoice', i_robert, biz, '[
    {"d":"Water heater service","t":"labour","q":1,"r":14000,"pi":"Water heater service"},
    {"d":"Shut-off valve","t":"material","q":1,"r":2800,"pi":"Shut-off valve"}]'::jsonb);
  perform public.seed_recalc('invoice', i_robert);
  update public.invoices set amount_paid_cents = total_cents where id = i_robert;

  -- 1019 void (James)
  insert into public.invoices (business_id, customer_id, number, status, issue_date, due_date, currency,
                               tax_rate_bps, sent_at, notes)
  values (biz, c_james, 1019, 'void', today_local - 34, today_local - 20, 'USD', 800,
          now() - interval '34 days', 'Issued in error. Replaced by the corrected quote.')
  returning id into inv;
  perform public.seed_add_items('invoice', inv, biz, '[
    {"d":"Hourly labour","t":"labour","q":2,"r":9500,"pi":"Hourly labour"}]'::jsonb);
  perform public.seed_recalc('invoice', inv);

  -- 1020 paid last month (Sarah)
  insert into public.invoices (business_id, customer_id, number, status, issue_date, due_date, currency,
                               tax_rate_bps, sent_at, viewed_at, paid_at, payment_method)
  values (biz, c_sarah, 1020, 'paid', today_local - 32, today_local - 18, 'USD', 800,
          now() - interval '32 days', now() - interval '31 days',
          date_trunc('month', now() at time zone tz) at time zone tz - interval '10 days', 'cash')
  returning id into i_sarah;
  perform public.seed_add_items('invoice', i_sarah, biz, '[
    {"d":"Bathroom sink drain replacement","t":"labour","q":1,"r":18500},
    {"d":"Pipe fittings and sealant","t":"material","q":1,"r":2250,"pi":"Pipe fittings and sealant"}]'::jsonb);
  perform public.seed_recalc('invoice', i_sarah);
  update public.invoices set amount_paid_cents = total_cents where id = i_sarah;

  -- 1021 overdue (Linda)
  insert into public.invoices (business_id, customer_id, number, status, issue_date, due_date, currency,
                               tax_rate_bps, sent_at, viewed_at, reminder_count, last_reminder_at)
  values (biz, c_linda, 1021, 'viewed', today_local - 30, today_local - 16, 'USD', 800,
          now() - interval '30 days', now() - interval '29 days', 2, now() - interval '9 days')
  returning id into i_linda;
  perform public.seed_add_items('invoice', i_linda, biz, '[
    {"d":"Replace two outdoor hose bibs","t":"labour","q":2,"r":15000,"pi":"Outside tap installation — labour"},
    {"d":"Shut-off valve","t":"material","q":2,"r":2800,"pi":"Shut-off valve"}]'::jsonb);
  perform public.seed_recalc('invoice', i_linda);

  -- 1022 paid this month (Grace)
  insert into public.invoices (business_id, customer_id, number, status, issue_date, due_date, currency,
                               tax_rate_bps, sent_at, viewed_at, paid_at, payment_method)
  values (biz, c_grace, 1022, 'paid', today_local - 12, today_local + 2, 'USD', 800,
          now() - interval '12 days', now() - interval '12 days' + interval '3 hours',
          greatest(now() - interval '4 days', date_trunc('month', now() at time zone tz) at time zone tz + interval '2 hours'),
          'card')
  returning id into i_grace;
  perform public.seed_add_items('invoice', i_grace, biz, '[
    {"d":"Unblock drain — labour","t":"labour","q":1,"r":11000,"pi":"Unblock drain — labour"},
    {"d":"Call-out fee","t":"fee","q":1,"r":4500,"pi":"Call-out fee"},
    {"d":"Hourly labour","t":"labour","q":1,"r":9500,"pi":"Hourly labour"}]'::jsonb);
  perform public.seed_recalc('invoice', i_grace);
  update public.invoices set amount_paid_cents = total_cents where id = i_grace;

  -- 1023 overdue by 9 days, created from quote 1044 (Priya)
  insert into public.invoices (business_id, customer_id, quote_id, number, status, issue_date, due_date, currency,
                               tax_rate_bps, sent_at, viewed_at, reminder_count, last_reminder_at)
  values (biz, c_priya, q_priya, 1023, 'sent', today_local - 23, today_local - 9, 'USD', 800,
          now() - interval '23 days', null, 1, now() - interval '8 days')
  returning id into i_priya;
  insert into public.invoice_items
    (invoice_id, position, description, type, qty, unit_rate_cents, amount_cents, price_item_id)
  select i_priya, position, description, type, qty, unit_rate_cents, amount_cents, price_item_id
    from public.quote_items where quote_id = q_priya;
  perform public.seed_recalc('invoice', i_priya);

  -- 1024 part-paid deposit, not yet due (Tom)
  insert into public.invoices (business_id, customer_id, number, status, issue_date, due_date, currency,
                               tax_rate_bps, sent_at, viewed_at, paid_at, payment_method)
  values (biz, c_tom, 1024, 'viewed', today_local - 5, today_local + 9, 'USD', 800,
          now() - interval '5 days', now() - interval '4 days', now() - interval '3 days', 'bank_transfer')
  returning id into i_tom;
  perform public.seed_add_items('invoice', i_tom, biz, '[
    {"d":"Hourly labour","t":"labour","q":6,"r":9500,"pi":"Hourly labour"},
    {"d":"Copper pipe, per metre","t":"material","q":8,"r":1440,"pi":"Copper pipe, per metre"},
    {"d":"Pipe fittings and sealant","t":"material","q":3,"r":2250,"pi":"Pipe fittings and sealant"}]'::jsonb);
  perform public.seed_recalc('invoice', i_tom);
  update public.invoices set amount_paid_cents = round(total_cents * 0.3)::int where id = i_tom;

  -- 1025 sent, not yet due (Mark)
  insert into public.invoices (business_id, customer_id, number, status, issue_date, due_date, currency,
                               tax_rate_bps, sent_at)
  values (biz, c_mark, 1025, 'sent', today_local - 2, today_local + 12, 'USD', 800, now() - interval '2 days')
  returning id into i_mark;
  perform public.seed_add_items('invoice', i_mark, biz, '[
    {"d":"Toilet repair — labour","t":"labour","q":1,"r":9000,"pi":"Toilet repair — labour"},
    {"d":"Call-out fee","t":"fee","q":1,"r":4500,"pi":"Call-out fee"}]'::jsonb);
  perform public.seed_recalc('invoice', i_mark);

  -- 1026 draft (Mark)
  insert into public.invoices (business_id, customer_id, number, status, issue_date, due_date, currency, tax_rate_bps)
  values (biz, c_mark, 1026, 'draft', today_local, today_local + 14, 'USD', 800)
  returning id into i_new;
  perform public.seed_add_items('invoice', i_new, biz, '[
    {"d":"Hourly labour","t":"labour","q":4,"r":9500,"pi":"Hourly labour"}]'::jsonb);
  perform public.seed_recalc('invoice', i_new);

  -- Activity -----------------------------------------------------------
  insert into public.activity (business_id, entity_type, entity_id, event, meta, created_at) values
    (biz, 'quote',   q_sarah,  'quote.sent',              '{"via":"email"}',                 now() - interval '4 days'),
    (biz, 'quote',   q_sarah,  'quote.viewed',            '{}',                              now() - interval '4 days' + interval '2 hours'),
    (biz, 'quote',   q_sarah,  'quote.accepted',          '{"name":"Sarah Thompson"}',       now() - interval '3 days'),
    (biz, 'quote',   q_priya,  'quote.accepted',          '{"name":"Priya Patel"}',          now() - interval '25 days'),
    (biz, 'invoice', i_priya,  'invoice.sent',            '{"via":"email"}',                 now() - interval '23 days'),
    (biz, 'invoice', i_priya,  'invoice.reminder_sent',   '{"reminder":1}',                  now() - interval '8 days'),
    (biz, 'quote',   q_james,  'quote.sent',              '{"via":"sms"}',                   now() - interval '3 days'),
    (biz, 'quote',   q_mark,   'quote.sent',              '{"via":"email"}',                 now() - interval '2 days'),
    (biz, 'quote',   q_mark,   'quote.viewed',            '{}',                              now() - interval '1 day'),
    (biz, 'quote',   q_grace,  'quote.accepted',          '{"name":"Grace Okafor"}',         now() - interval '3 days'),
    (biz, 'quote',   q_linda,  'quote.accepted',          '{"name":"Linda Alvarez"}',        now() - interval '1 day'),
    (biz, 'quote',   q_robert, 'quote.declined',          '{"reason":"Went with another quote that was a bit cheaper."}', now() - interval '6 days'),
    (biz, 'invoice', i_grace,  'invoice.paid',            '{"method":"card"}',               now() - interval '4 days'),
    (biz, 'invoice', i_tom,    'invoice.viewed',          '{}',                              now() - interval '4 days'),
    (biz, 'invoice', i_linda,  'invoice.reminder_sent',   '{"reminder":2}',                  now() - interval '9 days'),
    (biz, 'invoice', i_mark,   'invoice.sent',            '{"via":"email"}',                 now() - interval '2 days'),
    (biz, 'customer', c_tom,   'customer.created',        '{}',                              now() - interval '30 days');

  -- Usage this month ---------------------------------------------------
  insert into public.usage_counters (business_id, period, quotes_sent, ai_drafts)
  values (biz, to_char(now() at time zone tz, 'YYYY-MM'), 5, 3)
  on conflict (business_id, period) do update
    set quotes_sent = excluded.quotes_sent, ai_drafts = excluded.ai_drafts;

  return 'Seeded Miller Plumbing for ' || v_email || ' (business ' || biz || ').';
end;
$$;

-- Only run from the SQL editor / service role, never from the browser.
revoke all on function public.seed_add_items(text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.seed_recalc(text, uuid) from public, anon, authenticated;
revoke all on function public.seed_demo_data(uuid) from public, anon, authenticated;
