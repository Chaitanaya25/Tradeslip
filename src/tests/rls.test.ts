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
