/**
 * Row Level Security tests. These talk to a REAL Supabase project, create two
 * users and rows, and delete them afterwards.
 *
 * Use a separate throwaway project, never your main one. They only run when
 * TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY and TEST_SUPABASE_SERVICE_ROLE_KEY
 * are set (see supabase/README.md). The service-role key is used here, in Node,
 * only to create and clean up test users.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/types";

const url = process.env.TEST_SUPABASE_URL;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && anonKey && serviceKey);

if (!configured) {
  console.warn(
    "[rls.test] SKIPPED: set TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY and TEST_SUPABASE_SERVICE_ROLE_KEY " +
      "(in .env.test.local, for a throwaway Supabase project) to run the RLS tests.",
  );
}

type Db = SupabaseClient<Database>;

type Tenant = {
  userId: string;
  db: Db;
  businessId: string;
  customerId: string;
  quoteId: string;
  quoteItemId: string;
};

const runId = Date.now().toString(36);
const password = `Tradeslip-test-${runId}-Aa1!`;

function newClient(key: string): Db {
  return createClient<Database>(url!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createTenant(admin: Db, label: string): Promise<Tenant> {
  const email = `rls-${label}-${runId}@example.com`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) throw createError ?? new Error("createUser failed");

  const db = newClient(anonKey!);
  const { error: signInError } = await db.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  const business = await db
    .from("businesses")
    .insert({ owner_id: created.user.id, name: `Test Co ${label}`, country: "US", currency: "USD" })
    .select("id")
    .single();
  if (business.error) throw business.error;
  const businessId = business.data.id;

  const customer = await db
    .from("customers")
    .insert({ business_id: businessId, name: `Customer ${label}` })
    .select("id")
    .single();
  if (customer.error) throw customer.error;

  const quote = await db
    .from("quotes")
    .insert({
      business_id: businessId,
      customer_id: customer.data.id,
      number: 1001,
      title: `Quote ${label}`,
      currency: "USD",
    })
    .select("id")
    .single();
  if (quote.error) throw quote.error;

  const item = await db
    .from("quote_items")
    .insert({ quote_id: quote.data.id, description: `Item ${label}`, unit_rate_cents: 1000, amount_cents: 1000 })
    .select("id")
    .single();
  if (item.error) throw item.error;

  return {
    userId: created.user.id,
    db,
    businessId,
    customerId: customer.data.id,
    quoteId: quote.data.id,
    quoteItemId: item.data.id,
  };
}

describe.skipIf(!configured)("Row Level Security", () => {
  let admin: Db;
  let a: Tenant;
  let b: Tenant;

  beforeAll(async () => {
    expect(
      url,
      "Refusing to run: TEST_SUPABASE_URL must not be your main project (NEXT_PUBLIC_SUPABASE_URL).",
    ).not.toBe(process.env.NEXT_PUBLIC_SUPABASE_URL);

    admin = newClient(serviceKey!);
    a = await createTenant(admin, "a");
    b = await createTenant(admin, "b");
  });

  afterAll(async () => {
    // Deleting the auth user cascades to businesses and everything under them.
    for (const tenant of [a, b]) {
      if (tenant) await admin.auth.admin.deleteUser(tenant.userId);
    }
  });

  describe("reads", () => {
    it("user A only sees their own business, customers, quotes and quote items", async () => {
      const businesses = await a.db.from("businesses").select("id");
      expect(businesses.data?.map((r) => r.id)).toEqual([a.businessId]);

      const customers = await a.db.from("customers").select("id");
      expect(customers.data?.map((r) => r.id)).toEqual([a.customerId]);

      const quotes = await a.db.from("quotes").select("id");
      expect(quotes.data?.map((r) => r.id)).toEqual([a.quoteId]);

      const items = await a.db.from("quote_items").select("id");
      expect(items.data?.map((r) => r.id)).toEqual([a.quoteItemId]);
    });

    it("user A cannot fetch user B's rows by id", async () => {
      expect((await a.db.from("businesses").select("id").eq("id", b.businessId)).data).toEqual([]);
      expect((await a.db.from("customers").select("id").eq("id", b.customerId)).data).toEqual([]);
      expect((await a.db.from("quotes").select("id").eq("id", b.quoteId)).data).toEqual([]);
      expect((await a.db.from("quote_items").select("id").eq("id", b.quoteItemId)).data).toEqual([]);
      expect((await a.db.from("quote_items").select("id").eq("quote_id", b.quoteId)).data).toEqual([]);
    });

    it("a signed-out client sees nothing", async () => {
      const anon = newClient(anonKey!);
      for (const table of ["businesses", "customers", "quotes", "quote_items"] as const) {
        const { data } = await anon.from(table).select("id");
        expect(data ?? [], table).toEqual([]);
      }
    });
  });

  describe("writes", () => {
    it("user A cannot update user B's rows", async () => {
      await a.db.from("businesses").update({ name: "hacked" }).eq("id", b.businessId);
      await a.db.from("customers").update({ name: "hacked" }).eq("id", b.customerId);
      await a.db.from("quotes").update({ title: "hacked" }).eq("id", b.quoteId);
      await a.db.from("quote_items").update({ description: "hacked" }).eq("id", b.quoteItemId);

      // Verify with the service role that nothing changed.
      const biz = await admin.from("businesses").select("name").eq("id", b.businessId).single();
      const cust = await admin.from("customers").select("name").eq("id", b.customerId).single();
      const quote = await admin.from("quotes").select("title").eq("id", b.quoteId).single();
      const item = await admin.from("quote_items").select("description").eq("id", b.quoteItemId).single();
      expect(biz.data?.name).toBe("Test Co b");
      expect(cust.data?.name).toBe("Customer b");
      expect(quote.data?.title).toBe("Quote b");
      expect(item.data?.description).toBe("Item b");
    });

    it("user A cannot delete user B's rows", async () => {
      await a.db.from("quote_items").delete().eq("id", b.quoteItemId);
      await a.db.from("quotes").delete().eq("id", b.quoteId);
      await a.db.from("customers").delete().eq("id", b.customerId);
      await a.db.from("businesses").delete().eq("id", b.businessId);

      expect((await admin.from("quote_items").select("id").eq("id", b.quoteItemId)).data).toHaveLength(1);
      expect((await admin.from("quotes").select("id").eq("id", b.quoteId)).data).toHaveLength(1);
      expect((await admin.from("customers").select("id").eq("id", b.customerId)).data).toHaveLength(1);
      expect((await admin.from("businesses").select("id").eq("id", b.businessId)).data).toHaveLength(1);
    });

    it("user A cannot insert rows into user B's business", async () => {
      const customer = await a.db.from("customers").insert({ business_id: b.businessId, name: "Planted" });
      expect(customer.error).not.toBeNull();

      const quote = await a.db
        .from("quotes")
        .insert({ business_id: b.businessId, number: 9001, currency: "USD" });
      expect(quote.error).not.toBeNull();
    });

    it("user A cannot add items under user B's quote", async () => {
      const item = await a.db
        .from("quote_items")
        .insert({ quote_id: b.quoteId, description: "Planted", unit_rate_cents: 1, amount_cents: 1 });
      expect(item.error).not.toBeNull();
    });

    it("user A cannot attach their quote to user B's customer", async () => {
      const quote = await a.db
        .from("quotes")
        .insert({ business_id: a.businessId, customer_id: b.customerId, number: 9002, currency: "USD" });
      expect(quote.error).not.toBeNull();
    });

    it("user A cannot create a second business owned by someone else", async () => {
      const biz = await a.db
        .from("businesses")
        .insert({ owner_id: b.userId, name: "Impostor", country: "US", currency: "USD" });
      expect(biz.error).not.toBeNull();
    });
  });

  describe("quotes, items and photos (Phase 3)", () => {
    const fields = (title: string) => ({
      customer_id: null,
      title,
      notes: null,
      valid_until: "2026-12-01",
      deposit_enabled: false,
      deposit_bps: 3000,
      include_photos: false,
      subtotal_cents: 1000,
      tax_cents: 0,
      total_cents: 1000,
      tax_rate_bps: 0,
      currency: "USD",
    });
    const item = (description: string) => [
      { position: 0, description, type: "labour", qty: 1, unit_rate_cents: 1000, amount_cents: 1000, price_item_id: null, needs_price: false },
    ];

    it("job photos: user A cannot read, insert or delete user B's photos", async () => {
      const photo = await b.db
        .from("job_photos")
        .insert({ business_id: b.businessId, quote_id: b.quoteId, storage_path: `${b.businessId}/${b.quoteId}/x.jpg` })
        .select("id")
        .single();
      expect(photo.error).toBeNull();

      expect((await a.db.from("job_photos").select("id").eq("id", photo.data!.id)).data).toEqual([]);
      const planted = await a.db
        .from("job_photos")
        .insert({ business_id: b.businessId, quote_id: b.quoteId, storage_path: "planted.jpg" });
      expect(planted.error).not.toBeNull();
      const attach = await a.db
        .from("job_photos")
        .insert({ business_id: a.businessId, quote_id: b.quoteId, storage_path: "cross.jpg" });
      expect(attach.error).not.toBeNull();

      await a.db.from("job_photos").delete().eq("id", photo.data!.id);
      expect((await admin.from("job_photos").select("id").eq("id", photo.data!.id)).data).toHaveLength(1);
    });

    it("save_quote replaces a draft's items in one go", async () => {
      const first = await a.db.rpc("save_quote", { p_quote_id: a.quoteId, p_fields: fields("Saved once"), p_items: item("First") });
      expect(first.error).toBeNull();
      const again = await a.db.rpc("save_quote", { p_quote_id: a.quoteId, p_fields: fields("Saved twice"), p_items: item("Second") });
      expect(again.error).toBeNull();

      const rows = await admin.from("quote_items").select("description").eq("quote_id", a.quoteId);
      expect(rows.data?.map((r) => r.description)).toEqual(["Second"]);
      const quote = await admin.from("quotes").select("title, total_cents").eq("id", a.quoteId).single();
      expect(quote.data).toEqual({ title: "Saved twice", total_cents: 1000 });
    });

    it("save_quote refuses another user's quote and leaves it untouched", async () => {
      const result = await a.db.rpc("save_quote", { p_quote_id: b.quoteId, p_fields: fields("Hijacked"), p_items: item("Hijacked") });
      expect(result.error).not.toBeNull();
      const quote = await admin.from("quotes").select("title").eq("id", b.quoteId).single();
      expect(quote.data?.title).toBe("Quote b");
    });

    it("save_quote refuses quotes that are no longer drafts", async () => {
      await admin.from("quotes").update({ status: "sent" }).eq("id", a.quoteId);
      const result = await a.db.rpc("save_quote", { p_quote_id: a.quoteId, p_fields: fields("Too late"), p_items: item("Too late") });
      expect(result.error).not.toBeNull();
      const quote = await admin.from("quotes").select("title").eq("id", a.quoteId).single();
      expect(quote.data?.title).toBe("Saved twice");
      await admin.from("quotes").update({ status: "draft" }).eq("id", a.quoteId);
    });

    it("save_quote rolls back everything when an item is invalid", async () => {
      const bad = [{ ...item("Bad")[0], type: "not-a-type" }];
      const result = await a.db.rpc("save_quote", { p_quote_id: a.quoteId, p_fields: fields("Half saved"), p_items: bad });
      expect(result.error).not.toBeNull();
      const rows = await admin.from("quote_items").select("description").eq("quote_id", a.quoteId);
      expect(rows.data?.map((r) => r.description)).toEqual(["Second"]);
    });

    it("signed-out clients cannot call save_quote", async () => {
      const anon = newClient(anonKey!);
      const result = await anon.rpc("save_quote", { p_quote_id: a.quoteId, p_fields: fields("Anon"), p_items: item("Anon") });
      expect(result.error).not.toBeNull();
    });
  });

  describe("voice notes (Phase 4)", () => {
    const audio = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" });
    const name = () => `${crypto.randomUUID()}.webm`;

    it("each user can write and read their own folder", async () => {
      const path = `${a.businessId}/${name()}`;
      const up = await a.db.storage.from("voice-notes").upload(path, audio, { contentType: "audio/webm" });
      expect(up.error).toBeNull();
      const down = await a.db.storage.from("voice-notes").download(path);
      expect(down.error).toBeNull();
      await a.db.storage.from("voice-notes").remove([path]);
    });

    it("user A cannot upload into, read, list or delete user B's folder", async () => {
      const path = `${b.businessId}/${name()}`;
      const planted = await a.db.storage.from("voice-notes").upload(path, audio, { contentType: "audio/webm" });
      expect(planted.error).not.toBeNull();

      const bPath = `${b.businessId}/${name()}`;
      expect((await b.db.storage.from("voice-notes").upload(bPath, audio, { contentType: "audio/webm" })).error).toBeNull();

      expect((await a.db.storage.from("voice-notes").download(bPath)).error).not.toBeNull();
      const listed = await a.db.storage.from("voice-notes").list(b.businessId);
      expect(listed.data ?? []).toEqual([]);
      await a.db.storage.from("voice-notes").remove([bPath]);
      expect((await admin.storage.from("voice-notes").download(bPath)).error).toBeNull(); // still there

      await admin.storage.from("voice-notes").remove([bPath]);
    });

    it("a signed-out client cannot read voice notes", async () => {
      const anon = newClient(anonKey!);
      expect((await anon.storage.from("voice-notes").download(`${a.businessId}/${name()}`)).error).not.toBeNull();
    });

    it("owners cannot call the usage and rate-limit counter functions", async () => {
      const limit = await a.db.rpc("increment_ai_drafts", { p_business_id: a.businessId, p_period: "2026-10", p_limit: 1000 });
      expect(limit.error).not.toBeNull();
      const hit = await a.db.rpc("rate_limit_hit", { p_ip: "user:x", p_key: "ai-draft", p_window_start: new Date().toISOString() });
      expect(hit.error).not.toBeNull();
      const refund = await a.db.rpc("refund_ai_draft", { p_business_id: a.businessId, p_period: "2026-10" });
      expect(refund.error).not.toBeNull();
    });

    it("save_quote stores a voice note only when the keys are sent", async () => {
      const fields = {
        customer_id: null, title: "Voice", notes: null, valid_until: null, deposit_enabled: false, deposit_bps: 3000,
        include_photos: false, subtotal_cents: 0, tax_cents: 0, total_cents: 0, tax_rate_bps: 0, currency: "USD",
      };
      const path = `${a.businessId}/${name()}`;
      await a.db.rpc("save_quote", { p_quote_id: a.quoteId, p_fields: { ...fields, voice_note_path: path, transcript: "hello" }, p_items: [] });
      await a.db.rpc("save_quote", { p_quote_id: a.quoteId, p_fields: fields, p_items: [] });
      const row = await admin.from("quotes").select("voice_note_path, transcript").eq("id", a.quoteId).single();
      expect(row.data).toEqual({ voice_note_path: path, transcript: "hello" });
    });
  });

  describe("public quote functions (Phase 5)", () => {
    let token: string;

    beforeAll(async () => {
      token = `t${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`.slice(0, 48);
      await admin.from("quotes").update({ status: "sent", public_token: token, sent_at: new Date().toISOString() }).eq("id", a.quoteId);
    });

    it("signed-in owners and anonymous clients cannot call any public function", async () => {
      const anon = newClient(anonKey!);
      for (const client of [a.db, b.db, anon]) {
        expect((await client.rpc("get_public_quote", { p_token: token })).error).not.toBeNull();
        expect((await client.rpc("record_quote_view", { p_token: token })).error).not.toBeNull();
        expect((await client.rpc("accept_quote", { p_token: token, p_name: "Eve Hacker", p_ip: "1.1.1.1", p_ua: "x" })).error).not.toBeNull();
        expect((await client.rpc("decline_quote", { p_token: token, p_reason: "x" })).error).not.toBeNull();
        expect((await client.rpc("reserve_quote_send", { p_business_id: a.businessId, p_period: "2099-01", p_limit: 99 })).error).not.toBeNull();
      }
      const status = await admin.from("quotes").select("status").eq("id", a.quoteId).single();
      expect(status.data?.status).toBe("sent");
    });

    it("user B cannot read user A's quote by its public token", async () => {
      const read = await b.db.from("quotes").select("id").eq("public_token", token);
      expect(read.data ?? []).toEqual([]);
      const own = await a.db.from("quotes").select("id").eq("public_token", token);
      expect(own.data).toHaveLength(1);
    });

    it("get_public_quote returns only whitelisted fields", async () => {
      const { data, error } = await admin.rpc("get_public_quote", { p_token: token });
      expect(error).toBeNull();
      const pub = data as Record<string, Record<string, unknown>>;
      expect(Object.keys(pub).sort()).toEqual(["business", "customer", "items", "photos", "quote"]);
      expect(Object.keys(pub.business).sort()).toEqual([
        "country", "email", "logo_path", "name", "payment_link_url", "phone", "plan_branding", "tax_label", "tax_number", "timezone", "trade",
      ]);
      const flat = JSON.stringify(data);
      for (const forbidden of ["owner_id", "business_id", "public_token", "paddle", '"plan"', a.userId, a.businessId, a.quoteId]) {
        expect(flat).not.toContain(forbidden);
      }
    });

    it("a draft or unknown token returns null (indistinguishable)", async () => {
      await admin.from("quotes").update({ status: "draft" }).eq("id", a.quoteId);
      const draft = await admin.rpc("get_public_quote", { p_token: token });
      const unknown = await admin.rpc("get_public_quote", { p_token: "z".repeat(48) });
      expect(draft.data).toBeNull();
      expect(unknown.data).toBeNull();
      await admin.from("quotes").update({ status: "sent" }).eq("id", a.quoteId);
    });

    it("accept is atomic and idempotent, and sticks", async () => {
      const first = await admin.rpc("accept_quote", { p_token: token, p_name: "Sarah Thompson", p_ip: "203.0.113.9", p_ua: "test" });
      const second = await admin.rpc("accept_quote", { p_token: token, p_name: "Someone Else", p_ip: "203.0.113.10", p_ua: "test" });
      const decline = await admin.rpc("decline_quote", { p_token: token, p_reason: "changed my mind" });
      expect([first.data, second.data, decline.data]).toEqual(["ok", "already_accepted", "not_allowed"]);
      const row = await admin.from("quotes").select("status, accepted_name").eq("id", a.quoteId).single();
      expect(row.data).toEqual({ status: "accepted", accepted_name: "Sarah Thompson" });
    });
  });

  describe("acceptance codes (Phase 5.1)", () => {
    const hash = "f".repeat(64);
    let token: string;

    beforeAll(async () => {
      token = `o${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`.slice(0, 48);
      await admin.from("quotes").update({ status: "sent", public_token: token, sent_at: new Date().toISOString() }).eq("id", a.quoteId);
    });

    it("owners and anonymous clients cannot call any OTP function", async () => {
      const anon = newClient(anonKey!);
      for (const client of [a.db, b.db, anon]) {
        expect((await client.rpc("issue_accept_otp", { p_token: token, p_code_hash: hash })).error).not.toBeNull();
        expect((await client.rpc("accept_quote_verified", { p_token: token, p_name: "Eve Hacker", p_code_hash: hash, p_ip: "1.1.1.1", p_ua: "x" })).error).not.toBeNull();
        expect((await client.rpc("get_accept_target", { p_token: token })).error).not.toBeNull();
        expect((await client.rpc("accept_quote", { p_token: token, p_name: "Eve Hacker", p_ip: "1.1.1.1", p_ua: "x" })).error).not.toBeNull();
      }
    });

    it("quote_accept_otps cannot be read or written by owners or anonymous clients", async () => {
      const issued = await admin.rpc("issue_accept_otp", { p_token: token, p_code_hash: hash });
      // The test customer has no email, so the service role is told "not_allowed": either way a row may or may not exist.
      expect(["ok", "not_allowed"]).toContain(issued.data);

      const anon = newClient(anonKey!);
      for (const client of [a.db, b.db, anon]) {
        const read = await client.from("quote_accept_otps").select("id");
        expect(read.error !== null || (read.data ?? []).length === 0).toBe(true);
        const write = await client.from("quote_accept_otps").insert({ quote_id: a.quoteId, code_hash: hash, expires_at: new Date(Date.now() + 600_000).toISOString() });
        expect(write.error).not.toBeNull();
      }
    });

    it("without a code, accepting is refused when the customer has an email on file", async () => {
      await admin.from("customers").update({ email: "customer-a@example.com" }).eq("id", a.customerId);
      const result = await admin.rpc("accept_quote", { p_token: token, p_name: "Sarah Thompson", p_ip: "203.0.113.9", p_ua: "test" });
      expect(result.data).toBe("not_allowed");
      const row = await admin.from("quotes").select("status").eq("id", a.quoteId).single();
      expect(row.data?.status).toBe("sent");
    });

    it("the public JSON never contains the customer's email", async () => {
      const { data } = await admin.rpc("get_public_quote", { p_token: token });
      expect(JSON.stringify(data)).not.toContain("customer-a@example.com");
      expect((data as { quote: { requires_verification: boolean } }).quote.requires_verification).toBe(true);
    });
  });

  describe("server-controlled data", () => {
    it("an owner cannot change their own plan or billing columns", async () => {
      await a.db.from("businesses").update({ plan: "business", paddle_subscription_id: "sub_fake" }).eq("id", a.businessId);
      const row = await admin.from("businesses").select("plan, paddle_subscription_id").eq("id", a.businessId).single();
      expect(row.data?.plan).toBe("trial");
      expect(row.data?.paddle_subscription_id).toBeNull();
    });

    it("an owner cannot write usage counters", async () => {
      const insert = await a.db
        .from("usage_counters")
        .insert({ business_id: a.businessId, period: "2026-01" });
      expect(insert.error).not.toBeNull();
    });

    it("rate_limits is not accessible to signed-in users", async () => {
      const read = await a.db.from("rate_limits").select("id");
      expect(read.error).not.toBeNull();
      const write = await a.db.from("rate_limits").insert({ ip: "203.0.113.1", key: "accept", window_start: new Date().toISOString() });
      expect(write.error).not.toBeNull();
    });

    it("next_doc_number only works for your own business", async () => {
      const own = await a.db.rpc("next_doc_number", { p_business_id: a.businessId, p_kind: "quote" });
      expect(own.error).toBeNull();
      expect(own.data).toBeGreaterThanOrEqual(1001);

      const other = await a.db.rpc("next_doc_number", { p_business_id: b.businessId, p_kind: "quote" });
      expect(other.error).not.toBeNull();

      const biz = await admin.from("businesses").select("next_quote_number").eq("id", b.businessId).single();
      expect(biz.data?.next_quote_number).toBe(1001);
    });
  });
});

describe.skipIf(configured)("Row Level Security (skipped)", () => {
  it.skip("needs TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY and TEST_SUPABASE_SERVICE_ROLE_KEY", () => {});
});
