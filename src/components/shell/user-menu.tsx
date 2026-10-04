"use client";

import Link from "next/link";
import { ChevronRight, LogOut, Settings } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/server/actions/auth";

export type ShellUser = { name: string; initials: string; businessName: string };

/** Bottom-of-sidebar user block. Name and business collapse away on the icon rail. */
export function UserMenu({ user }: { user: ShellUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-center gap-3 rounded-lg p-2 text-left transition-colors duration-150 hover:bg-surface-muted data-[state=open]:bg-surface-muted lg:justify-start"
          aria-label={`Account menu for ${user.name}`}
        >
          <Avatar name={user.name} initials={user.initials} />
          <span className="hidden min-w-0 flex-1 lg:block">
            <span className="text-body-strong block truncate">{user.name}</span>
            <span className="text-small block truncate text-text-muted">{user.businessName}</span>
          </span>
          <ChevronRight className="hidden size-4 shrink-0 text-text-muted lg:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={8}>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <form action={signOut} className="w-full">
            <button type="submit" className="flex w-full items-center gap-1.5 text-left">
              <LogOut className="size-4" /> Sign out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
