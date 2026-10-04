import { Mic, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";

/** Placeholder for the voice recorder (built in a later update). Matches the reference layout. */
export function VoiceNoteCard() {
  return (
    <Card>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-h2">Voice note</h2>
        <Trash2 className="size-5 text-text-subtle" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <div className="flex items-center gap-4 rounded-lg border border-border bg-surface-muted p-4">
        <button
          type="button"
          disabled
          aria-label="Record a voice note (not available yet)"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-border-strong text-white"
        >
          <Mic className="size-5" strokeWidth={1.75} />
        </button>
        <p className="text-body text-text-muted">Voice quoting is coming in the next update.</p>
      </div>
    </Card>
  );
}
