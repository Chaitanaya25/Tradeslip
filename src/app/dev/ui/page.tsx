import type { ReactNode } from "react";
import {
  ArrowRight,
  CircleAlert,
  CreditCard,
  FileText,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Plus,
  Send,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, StatCard, TableCard, TableCardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { IconTile } from "@/components/ui/icon-tile";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { STATUSES, StatusPill } from "@/components/ui/status-pill";
import {
  CustomerCell,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Toggle } from "@/components/ui/toggle";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "UI primitives · Tradeslip" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-h2">{title}</h2>
      {children}
    </section>
  );
}

const SWATCHES = [
  ["bg", "bg-bg"],
  ["surface", "bg-surface"],
  ["surface-muted", "bg-surface-muted"],
  ["border", "bg-border"],
  ["border-strong", "bg-border-strong"],
  ["text", "bg-text"],
  ["text-muted", "bg-text-muted"],
  ["text-subtle", "bg-text-subtle"],
  ["accent", "bg-accent"],
  ["accent-hover", "bg-accent-hover"],
  ["accent-soft", "bg-accent-soft"],
  ["accent-border", "bg-accent-border"],
] as const;

const ROWS = [
  { name: "Sarah Thompson", addr: "12 Maple St, Brighton, MA", job: "Kitchen tap replacement", cents: 23000, status: "accepted", date: "Oct 14" },
  { name: "James O’Connor", addr: "88 Pine Rd, Somerville, MA", job: "Boiler service", cents: 18500, status: "viewed", date: "Oct 13" },
  { name: "Priya Patel", addr: "27 Willow Ave, Cambridge, MA", job: "Bathroom leak repair", cents: 41000, status: "overdue", date: "Oct 5" },
  { name: "Mark Evans", addr: "14 Cedar Rd, Waltham, MA", job: "Rewire garage", cents: 125000, status: "sent", date: "Oct 12" },
  { name: "Tom Hughes", addr: "3 Brook St, Newton, MA", job: "Outside tap installation", cents: 32000, status: "awaiting", date: "Oct 11" },
] as const;

export default function UiPage() {
  return (
    <main className="mx-auto max-w-[1100px] space-y-12 px-4 py-10 md:px-8">
      <header>
        <h1 className="text-display">UI primitives</h1>
        <p className="text-body text-text-muted">
          Dev-only page. Every primitive from DESIGN.md §7, for visual inspection.
        </p>
      </header>

      <Section title="Colour tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {SWATCHES.map(([name, cls]) => (
            <div key={name}>
              <div className={`${cls} h-12 rounded-lg border border-border`} />
              <div className="text-small mt-1 text-text-muted">{name}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <Card className="space-y-2">
          <div className="text-display">Display 32/40 &mdash; Morning, Dave</div>
          <div className="text-h2">H2 20/28 &mdash; Recent activity</div>
          <div className="text-stat tabular">Stat 30/36 &mdash; $4,820</div>
          <div className="text-total tabular text-accent">Total 30/36 &mdash; $334.80</div>
          <div className="text-body">Body 15/22 &mdash; Replace the kitchen mixer tap.</div>
          <div className="text-body-strong">Body strong 15/22 &mdash; Sarah Thompson</div>
          <div className="text-small text-text-muted">Small 13/18 &mdash; 12 Maple St, Brighton, MA</div>
          <div className="text-label text-text-muted">Label 13/18</div>
          <div className="tabular text-body">Tabular: 1,111.11 / 8,888.88 / 14 Oct</div>
        </Card>
      </Section>

      <Section title="Buttons">
        <Card className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button>
              <Plus /> New Quote
            </Button>
            <Button size="compact">Compact primary</Button>
            <Button variant="secondary">Save draft</Button>
            <Button variant="secondary" size="compact">
              Compact secondary
            </Button>
            <Button variant="outline-accent">Send reminder</Button>
            <Button variant="ghost">
              View all <ArrowRight />
            </Button>
            <Button variant="icon" aria-label="Record a voice note">
              <Mic />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button>
              <Send /> Send to customer
            </Button>
            <Button disabled>Disabled</Button>
            <Button variant="secondary" disabled>
              Disabled
            </Button>
          </div>
        </Card>
      </Section>

      <Section title="Inputs and select">
        <Card className="grid gap-5 md:grid-cols-3">
          <div>
            <Label htmlFor="name">Full name</Label>
            <Input id="name" defaultValue="Sarah Thompson" />
          </div>
          <div>
            <Label htmlFor="ph">Placeholder</Label>
            <Input id="ph" placeholder="Search customers, quotes or invoices..." />
          </div>
          <div>
            <Label htmlFor="state">State</Label>
            <Select defaultValue="MA">
              <SelectTrigger id="state">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MA">MA</SelectItem>
                <SelectItem value="NY">NY</SelectItem>
                <SelectItem value="CA">CA</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="dis">Disabled</Label>
            <Input id="dis" disabled defaultValue="Not editable" />
          </div>
          <div>
            <Label htmlFor="err">With error</Label>
            <Input id="err" aria-invalid defaultValue="sarah@" />
            <p className="text-small mt-1.5 text-destructive">Enter a full email address, like name@example.com.</p>
          </div>
        </Card>
      </Section>

      <Section title="Status pills">
        <Card className="flex flex-wrap gap-3">
          {STATUSES.map((s) => (
            <StatusPill key={s} status={s} />
          ))}
        </Card>
      </Section>

      <Section title="Toggles">
        <Card className="space-y-5">
          <Toggle
            id="deposit"
            defaultChecked
            label="Request 30% deposit"
            description="A deposit request will be included in the quote."
          />
          <Toggle
            id="photos"
            label="Include job photos"
            description="Attach photos from this job to the quote."
          />
        </Card>
      </Section>

      <Section title="Avatar and icon tiles">
        <Card className="flex flex-wrap items-center gap-6">
          <Avatar name="Dave Miller" />
          <Avatar name="Sarah" />
          <IconTile>
            <FileText />
          </IconTile>
          <IconTile>
            <MessageSquare />
          </IconTile>
          <IconTile>
            <CreditCard />
          </IconTile>
          <IconTile variant="red">
            <CircleAlert />
          </IconTile>
        </Card>
      </Section>

      <Section title="Stat cards">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<IconTile><FileText /></IconTile>}
            label="Owed to you"
            value={formatMoney(482000, "USD").replace(".00", "")}
            sub="3 invoices"
          />
          <StatCard
            icon={<IconTile><MessageSquare /></IconTile>}
            label="Awaiting reply"
            value="6 quotes"
            accentValue={false}
            sub="Total value $7,430"
          />
          <StatCard
            icon={<IconTile><CreditCard /></IconTile>}
            label="Paid this month"
            value="$12,340"
            sub={
              <>
                <span className="text-positive">&uarr; 18%</span> vs last month
              </>
            }
          />
          <StatCard
            icon={<IconTile variant="red"><CircleAlert /></IconTile>}
            label="Overdue"
            value="2 invoices"
            sub="Total $1,120"
          />
        </div>
      </Section>

      <Section title="Card and table">
        <TableCard>
          <TableCardHeader>
            <CardTitle>Recent activity</CardTitle>
            <Button variant="ghost">
              View all <ArrowRight />
            </Button>
          </TableCardHeader>
          <Table>
            <TableHeader>
              <TableRow className="h-11 hover:bg-transparent">
                <TableHead>Customer</TableHead>
                <TableHead>Job</TableHead>
                <TableHead numeric>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROWS.map((r) => (
                <TableRow key={r.name}>
                  <TableCell>
                    <CustomerCell name={r.name} detail={r.addr} />
                  </TableCell>
                  <TableCell>{r.job}</TableCell>
                  <TableCell numeric>{formatMoney(r.cents, "USD").replace(".00", "")}</TableCell>
                  <TableCell>
                    <StatusPill status={r.status} />
                  </TableCell>
                  <TableCell className="tabular text-text-muted">{r.date}</TableCell>
                  <TableCell>
                    <Button variant="icon" className="size-9 border-transparent bg-transparent" aria-label="More actions">
                      <MoreHorizontal />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>

        <Card>
          <CardHeader>
            <CardTitle>Deposit box</CardTitle>
          </CardHeader>
          <div className="rounded-lg border border-accent-border bg-accent-soft p-4">
            <div className="flex items-center justify-between">
              <span className="text-body-strong">Deposit due to book the job (30%)</span>
              <span className="tabular text-h2 font-bold text-accent">$100.44</span>
            </div>
            <p className="text-small text-text-muted">The rest is due when the job is done.</p>
          </div>
        </Card>
      </Section>

      <Section title="Dialog and sheet">
        <Card className="flex flex-wrap gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Accept this estimate</DialogTitle>
                <DialogDescription>Type your full name to accept.</DialogDescription>
              </DialogHeader>
              <div>
                <Label htmlFor="accept-name">Full name</Label>
                <Input id="accept-name" />
              </div>
              <Button>Accept estimate</Button>
            </DialogContent>
          </Dialog>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">Open sheet</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Send to customer</SheetTitle>
                <SheetDescription>Copy the link or send it by email.</SheetDescription>
              </SheetHeader>
            </SheetContent>
          </Sheet>
        </Card>
      </Section>

      <div className="flex items-center gap-3 border-t border-border pt-6">
        <Avatar name="Dave Miller" />
        <div>
          <div className="text-body-strong">Dave Miller</div>
          <div className="text-small text-text-muted">Miller Plumbing</div>
        </div>
      </div>
    </main>
  );
}
