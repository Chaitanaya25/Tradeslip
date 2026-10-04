import { BookOpen, FileText, Home, Receipt, Settings, Users, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/** Sidebar order from DESIGN.md §6. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/quotes", label: "Quotes", icon: FileText },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/price-book", label: "Price Book", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Active when the path is the item's route or anything beneath it ("/quotes/new" -> Quotes). */
export function isActiveNav(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
