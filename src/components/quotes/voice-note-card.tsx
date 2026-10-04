"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleCheck, LoaderCircle, Mic, RotateCcw, Square, Trash2, X } from "lucide-react";
import { UpgradeDialog } from "@/components/billing/upgrade-dialog";
import { useVoiceRecorder, type RecordingResult } from "@/components/quotes/use-voice-recorder";
import { VoicePlayer } from "@/components/quotes/voice-player";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { baseMime, formatTimer, voicePathFor } from "@/lib/voice";
import { cn } from "@/lib/utils";
import type { DraftApiResponse } from "@/app/api/ai/draft-quote/route";

export type VoiceAudio = { url: string; durationSeconds: number | null };

type Phase = "idle" | "uploading" | "drafting" | "error";

const EXAMPLE =
  "Sarah Thompson, 42 Maple Avenue, replace the kitchen mixer tap and fix the leak under the sink, parts about eighty dollars.";

async function requestDraft(path: string): Promise<{ ok: true; draft: DraftApiResponse } | { ok: false; message: string; limit?: "ai_draft" }> {
  try {
    const res = await fetch("/api/ai/draft-quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceNotePath: path }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 402 && body?.error?.code === "limit_reached") return { ok: false, message: body.error.message, limit: "ai_draft" };
      return { ok: false, message: body?.error?.message ?? "Voice drafting hit a problem. Try again, or fill the quote in by hand." };
    }
    return { ok: true, draft: body as DraftApiResponse };
  } catch {
    return { ok: false, message: "We couldn't reach the server. Check your connection and try again." };
  }
}

/**
 * Voice note card: record -> upload -> draft -> playback + transcript.
 * It never saves anything; it hands the draft to the builder, which fills the form.
 */
export function VoiceNoteCard({
  aiEnabled,
  businessId,
  autoRecord,
  transcript,
  audio,
  fromPriceBook,
  onDraft,
  onClear,
}: {
  aiEnabled: boolean;
  businessId: string;
  autoRecord: boolean;
  /** Transcript currently on the quote (from a new recording or a saved draft). */
  transcript: string;
  audio: VoiceAudio | null;
  fromPriceBook: boolean;
  onDraft: (draft: DraftApiResponse, audio: VoiceAudio) => void;
  onClear: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const pending = useRef<{ blob?: Blob; mime?: string; path?: string; seconds: number } | null>(null);

  const draftFromPath = useCallback(
    async (path: string, seconds: number, blob: Blob | null) => {
      setPhase("drafting");
      const result = await requestDraft(path);
      if (!result.ok) {
        if (result.limit) setLimitMessage(result.message);
        setMessage(result.message);
        setPhase("error");
        return;
      }
      const url = blob ? URL.createObjectURL(blob) : "";
      pending.current = null;
      setPhase("idle");
      onDraft(result.draft, { url, durationSeconds: seconds });
    },
    [onDraft],
  );

  const handleRecording = useCallback(
    async (rec: RecordingResult) => {
      setMessage(null);
      setPhase("uploading");
      const path = voicePathFor(businessId, crypto.randomUUID(), rec.mime);
      pending.current = { blob: rec.blob, mime: rec.mime, seconds: rec.durationSeconds };

      const { error } = await createClient()
        .storage.from("voice-notes")
        .upload(path, rec.blob, { contentType: baseMime(rec.mime), cacheControl: "3600", upsert: false });
      if (error) {
        setMessage("We couldn't upload your recording. Check your connection and try again.");
        setPhase("error");
        return;
      }
      pending.current = { ...pending.current, path };
      await draftFromPath(path, rec.durationSeconds, rec.blob);
    },
    [businessId, draftFromPath],
  );

  const recorder = useVoiceRecorder(handleRecording);

  // "Record" buttons on the dashboard and mobile bar open /quotes/new?record=1.
  const autoStarted = useRef(false);
  const { start } = recorder;
  useEffect(() => {
    if (!autoRecord || !aiEnabled || autoStarted.current) return;
    autoStarted.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    void start();
  }, [autoRecord, aiEnabled, start]);

  function retry() {
    const p = pending.current;
    if (p?.path) void draftFromPath(p.path, p.seconds, p.blob ?? null);
    else if (p?.blob && p.mime) void handleRecording({ blob: p.blob, mime: p.mime, durationSeconds: p.seconds });
    else {
      setPhase("idle");
      void start();
    }
  }

  const recording = recorder.status === "recording";
  const busy = phase === "uploading" || phase === "drafting";
  const hasVoice = transcript.trim() !== "" || audio !== null;

  return (
    <Card>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-h2">Voice note</h2>
        <button
          type="button"
          onClick={onClear}
          disabled={!hasVoice || busy || recording}
          aria-label="Remove voice note"
          className="rounded-md p-1 text-text-muted transition-colors hover:text-destructive disabled:text-text-subtle disabled:hover:text-text-subtle"
        >
          <Trash2 className="size-5" strokeWidth={1.5} />
        </button>
      </div>

      {!aiEnabled ? (
        <p className="text-body text-text-muted">Voice quoting isn&apos;t available right now. Fill the quote in by hand.</p>
      ) : recording ? (
        <div className="space-y-4" role="status" aria-label="Recording">
          <div className="flex items-center gap-4 rounded-lg border border-accent-border bg-accent-soft p-4">
            <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-white">
              <Mic className="size-5 animate-pulse" strokeWidth={1.75} />
            </span>
            <div className="flex h-9 min-w-0 flex-1 items-center gap-[3px]" aria-hidden="true">
              {recorder.levels.map((level, i) => (
                <span key={i} className="w-[3px] flex-1 rounded-full bg-text/70" style={{ height: `${Math.max(8, Math.round(level * 100))}%` }} />
              ))}
            </div>
            <span className="tabular text-body-strong shrink-0">{formatTimer(recorder.seconds)}</span>
          </div>
          <div className="flex gap-3">
            <Button type="button" className="flex-1" onClick={recorder.stop}>
              <Square className="size-4" fill="currentColor" /> Stop and draft
            </Button>
            <Button type="button" variant="secondary" onClick={recorder.cancel}>
              <X /> Cancel
            </Button>
          </div>
          <p className="text-small text-text-muted">Up to 2 minutes. Say who it&apos;s for, what needs doing, and any prices.</p>
        </div>
      ) : busy ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted p-4" role="status" aria-live="polite">
          <LoaderCircle className="size-5 animate-spin text-accent" aria-hidden="true" />
          <p className="text-body">{phase === "uploading" ? "Uploading your recording" : "Drafting your estimate"}</p>
        </div>
      ) : phase === "error" ? (
        <div className="space-y-4">
          <p role="alert" className="text-body text-destructive">
            {message}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={retry}>
              <RotateCcw /> Try again
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                pending.current = null;
                setPhase("idle");
              }}
            >
              Fill in manually
            </Button>
          </div>
        </div>
      ) : hasVoice ? (
        <div className="space-y-4">
          {audio?.url ? <VoicePlayer url={audio.url} fallbackSeconds={audio.durationSeconds} /> : null}
          {transcript.trim() ? (
            <blockquote className="text-body rounded-lg bg-surface-muted p-4 text-[15px] leading-6 text-text-muted italic">
              &ldquo;{transcript.trim()}&rdquo;
            </blockquote>
          ) : null}
          <p className="text-body flex items-center gap-2 text-text-muted">
            <CircleCheck className="size-5 shrink-0 text-positive" strokeWidth={1.5} />
            {fromPriceBook ? "Drafted from your price book" : "Drafted from your voice note"}
          </p>
          <Button type="button" variant="secondary" size="compact" onClick={() => void recorder.start()}>
            <Mic /> Record again
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Button type="button" className="h-14 w-full" onClick={() => void recorder.start()} disabled={recorder.status === "requesting"}>
            <Mic /> {recorder.status === "requesting" ? "Waiting for microphone..." : "Tap to record"}
          </Button>
          <p className="text-small text-text-muted">
            Try saying: <span className="italic">&ldquo;{EXAMPLE}&rdquo;</span>
          </p>
        </div>
      )}

      {recorder.error ? (
        <p role="alert" className={cn("text-small mt-3 text-destructive")}>
          {recorder.error}
        </p>
      ) : null}

      <UpgradeDialog limit={limitMessage ? "ai_draft" : null} message={limitMessage} onClose={() => setLimitMessage(null)} />
    </Card>
  );
}
