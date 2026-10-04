/** Name shown in the sidebar user block. */
export function displayNameFor(input: { fullName?: unknown; email?: string | null }): string {
  if (typeof input.fullName === "string" && input.fullName.trim()) return input.fullName.trim();

  // No saved name: prettify the email's local part (dave.miller+x@... -> "Dave Miller").
  const local = (input.email ?? "").split("@")[0].split("+")[0];
  const words = local.split(/[._-]+/).filter((w) => /[a-z]/i.test(w));
  if (words.length === 0) return "Account";
  return words
    .slice(0, 3)
    .map((w) => w.replace(/\d+/g, "").charAt(0).toUpperCase() + w.replace(/\d+/g, "").slice(1).toLowerCase())
    .filter(Boolean)
    .join(" ");
}

/** Up to two initials: "Dave Miller" -> "DM", "Dave" -> "D". */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}
