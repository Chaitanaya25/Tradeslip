"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { archiveCustomer, deleteCustomer, unarchiveCustomer } from "@/server/actions/customers";

/** Edit, archive / restore, and delete (only offered when there is no history). */
export function CustomerActions({ customerId, archived, hasHistory }: { customerId: string; archived: boolean; hasHistory: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);

  function run(kind: "archive" | "unarchive" | "delete") {
    startTransition(async () => {
      const result = kind === "archive" ? await archiveCustomer(customerId) : kind === "unarchive" ? await unarchiveCustomer(customerId) : await deleteCustomer(customerId);
      setConfirm(null);
      if (!result.ok) return void toast.error(result.message);
      if (kind === "delete") {
        toast.success("Customer deleted.");
        return router.replace("/customers");
      }
      toast.success(kind === "archive" ? "Customer archived. Their quotes and invoices are kept." : "Customer restored.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Button asChild variant="secondary">
        <Link href={`/customers/${customerId}/edit`}>
          <Pencil /> Edit
        </Link>
      </Button>
      {archived ? (
        <Button type="button" variant="secondary" onClick={() => run("unarchive")} disabled={pending}>
          <ArchiveRestore /> Restore
        </Button>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setConfirm("archive")} disabled={pending}>
          <Archive /> Archive
        </Button>
      )}
      {hasHistory ? null : (
        <Button type="button" variant="secondary" className="text-destructive" onClick={() => setConfirm("delete")} disabled={pending}>
          <Trash2 /> Delete
        </Button>
      )}

      <ConfirmDialog
        open={confirm === "archive"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Archive this customer?"
        description="They'll be hidden from your customer list and from the pickers in new quotes and invoices. Their existing quotes and invoices stay as they are. You can restore them any time."
        confirmLabel="Archive customer"
        pending={pending}
        onConfirm={() => run("archive")}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Delete this customer?"
        description="They have no quotes or invoices, so this removes them completely. This can't be undone."
        confirmLabel="Delete customer"
        pending={pending}
        onConfirm={() => run("delete")}
      />
    </div>
  );
}
