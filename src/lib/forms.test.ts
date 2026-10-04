import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fieldErrorsFromIssues, nestFieldErrors, zodResolver } from "./forms";

const schema = z
  .object({ name: z.string(), rate: z.string() })
  .transform((v, ctx) => {
    if (!v.name) ctx.addIssue({ code: "custom", path: ["name"], message: "Enter a name." });
    if (Number.isNaN(Number(v.rate))) ctx.addIssue({ code: "custom", path: ["rate"], message: "Enter a number." });
    return { name: v.name, rate: Number(v.rate) };
  });

describe("zodResolver", () => {
  const resolve = zodResolver<{ name: string; rate: string }, { name: string; rate: number }>(schema);
  const opts = { fields: {}, shouldUseNativeValidation: false } as never;

  it("returns parsed output for valid values", async () => {
    const r = await resolve({ name: "Tap", rate: "12" }, undefined, opts);
    expect(r.values).toEqual({ name: "Tap", rate: 12 });
    expect(r.errors).toEqual({});
  });

  it("maps every issue to a field error", async () => {
    const r = await resolve({ name: "", rate: "x" }, undefined, opts);
    expect(r.values).toEqual({});
    expect(r.errors).toEqual({
      name: { type: "validation", message: "Enter a name." },
      rate: { type: "validation", message: "Enter a number." },
    });
  });
});

describe("fieldErrorsFromIssues", () => {
  it("keeps the first message per field and uses _form for path-less issues", () => {
    expect(
      fieldErrorsFromIssues([
        { path: ["a"], message: "first" },
        { path: ["a"], message: "second" },
        { path: [], message: "form-level" },
      ]),
    ).toEqual({ a: "first", _form: "form-level" });
  });
});

describe("nestFieldErrors", () => {
  it("nests dotted paths and array indexes", () => {
    expect(
      nestFieldErrors({ name: "a", "customer.name": "b", "items.1.rate": "c", "items.0.description": "d" }),
    ).toEqual({
      name: { type: "validation", message: "a" },
      customer: { name: { type: "validation", message: "b" } },
      items: [{ description: { type: "validation", message: "d" } }, { rate: { type: "validation", message: "c" } }],
    });
  });
});
