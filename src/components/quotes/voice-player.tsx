"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { analyzeAudio } from "@/lib/audio-peaks";
import { downsamplePeaks, formatTimer } from "@/lib/voice";
import { cn } from "@/lib/utils";

const BARS = 48;

/** Play button, waveform and duration, as in the reference voice note card. */
export function VoicePlayer({ url, fallbackSeconds }: { url: string; fallbackSeconds: number | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [peaks, setPeaks] = useState<number[]>(() => downsamplePeaks([], BARS));
  const [duration, setDuration] = useState<number | null>(fallbackSeconds);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let alive = true;
    void analyzeAudio(url, BARS).then((result) => {
      if (!alive) return;
      setPeaks(result.peaks);
      if (result.duration) setDuration(result.duration);
    });
    return () => {
      alive = false;
    };
  }, [url]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }

  const playedBars = Math.round(progress * BARS);

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-surface-muted p-4">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-colors duration-150 hover:bg-accent-hover"
      >
        {playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="size-5 translate-x-px" fill="currentColor" />}
      </button>
      <div className="flex h-9 min-w-0 flex-1 items-center gap-[3px]" aria-hidden="true">
        {peaks.map((p, i) => (
          <span
            key={i}
            className={cn("w-[3px] flex-1 rounded-full", i < playedBars ? "bg-text/70" : "bg-text/30")}
            style={{ height: `${Math.round(p * 100)}%` }}
          />
        ))}
      </div>
      <span className="tabular text-body shrink-0 text-text-muted">{duration ? formatTimer(duration) : "--:--"}</span>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          const total = duration ?? (Number.isFinite(a.duration) ? a.duration : 0);
          setProgress(total > 0 ? Math.min(1, a.currentTime / total) : 0);
        }}
      />
    </div>
  );
}
