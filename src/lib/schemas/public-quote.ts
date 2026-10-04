import { z } from "zod";
import { isWellFormedToken } from "@/lib/tokens";

/** Input for what a customer can do from the public quote page. Validated again on the server. */

export const tokenSchema = z.string().refine(isWellFormedToken, "bad token");

export const acceptInputSchema = z.object({
  token: tokenSchema,
  name: z.string().trim().min(2, "Enter your full name.").max(100, "That name is too long."),
  confirmed: z.literal(true, { error: "Tick the box to accept." }),
});

export const declineInputSchema = z.object({
  token: tokenSchema,
  reason: z.string().trim().max(500, "Keep the reason under 500 characters.").optional(),
});

/** Step 1 of accepting with a code: name + the confirmation box. The email address is NEVER an input: it is read server-side. */
export const requestCodeInputSchema = z.object({
  token: tokenSchema,
  name: z.string().trim().min(2, "Enter your full name.").max(100, "That name is too long."),
  confirmed: z.literal(true, { error: "Tick the box to accept." }),
});

/** Step 2: the 6-digit code. Spaces and dashes are tolerated. */
export const verifyCodeInputSchema = z.object({
  token: tokenSchema,
  name: z.string().trim().min(2, "Enter your full name.").max(100, "That name is too long."),
  code: z
    .string()
    .transform((value) => value.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your email.")),
});
