import Link from "next/link";
import { ArrowRight, BookOpen, CreditCard, FileText, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";

/** 2x2 shortcuts. `quoteWord` is "Estimate" in the US. */
export function QuickActions({ quoteWord }: { quoteWord: string }) {
  const actions = [
    { href: "/quotes/new", label: `New ${quoteWord.toLowerCase()}`, icon: FileText },
    { href: "/invoices/new", label: "New invoice", icon: CreditCard },
    { href: "/customers/new", label: "Add customer", icon: UserPlus },
    { href: "/price-book", label: "Browse price book", icon: BookOpen },
  ];
  return (
    <Card className="lg:col-span-1">
      <h2 className="text-h2 mb-5">Quick actions</h2>
      <ul className="grid grid-cols-2 gap-3">
        {actions.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="text-body-strong flex h-[72px] items-center gap-3 rounded-lg border border-border bg-surface px-4 transition-colors duration-150 hover:bg-surface-muted"
            >
              <Icon className="size-5 shrink-0 text-accent" strokeWidth={1.5} aria-hidden="true" />
              <span className="min-w-0 flex-1 leading-5">{label}</span>
              <ArrowRight className="size-4 shrink-0 text-text-muted" strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
