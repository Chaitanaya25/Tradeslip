import Link from "next/link";
import { Mic, Plus } from "lucide-react";
import { ComingSoon } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Dashboard · Tradeslip" };

export default function DashboardPage() {
  return (
    <ComingSoon
      title="Dashboard"
      actions={
        <>
          <Button asChild>
            <Link href="/quotes/new">
              <Plus /> New quote
            </Link>
          </Button>
          <Button asChild variant="icon">
            <Link href="/quotes/new?record=1" aria-label="Record a voice quote">
              <Mic />
            </Link>
          </Button>
        </>
      }
    />
  );
}
