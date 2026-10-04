"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_RECORDING_SECONDS, pickRecorderMime } from "@/lib/voice";

export type RecordingResult = { blob: Blob; mime: string; durationSeconds: number };

export const WAVE_BARS = 40;

/** Friendly wording for the ways getUserMedia can fail. */
export function micErrorMessage(error: unknown): string {
  const name = (error as { name?: string } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access is blocked. Allow the microphone in your browser's address bar, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone was found. Plug one in, or fill the quote in by hand.";
  }
  if (name === "NotReadableError") {
    return "Your microphone is being used by another app. Close it and try again.";
  }
  return "We couldn't start the microphone. Try again, or fill the quote in by hand.";
}

/**
 * Tap-to-start / tap-to-stop recording with a live level meter.
 * Stops by itself at the 120 second cap. Everything (tracks, audio context,
 * animation frame, timers) is released on stop, cancel and unmount.
 */
export function useVoiceRecorder(onComplete: (result: RecordingResult) => void) {
  const [status, setStatus] = useState<"idle" | "requesting" | "recording">("idle");
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: WAVE_BARS }, () => 0));
  const [error, setError] = useState<string | null>(null);

  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audioCtx = useRef<AudioContext | null>(null);
  const raf = useRef<number | null>(null);
  const timer = useRef<number | null>(null);
  const startedAt = useRef(0);
  const cancelled = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const release = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    if (timer.current !== null) window.clearInterval(timer.current);
    raf.current = null;
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (audioCtx.current && audioCtx.current.state !== "closed") void audioCtx.current.close();
    audioCtx.current = null;
  }, []);

  const finish = useCallback(
    (mime: string) => {
      const durationSeconds = Math.min(MAX_RECORDING_SECONDS, (performance.now() - startedAt.current) / 1000);
      const blob = new Blob(chunks.current, { type: mime });
      chunks.current = [];
      release();
      recorder.current = null;
      setStatus("idle");
      setSeconds(0);
      setLevels(Array.from({ length: WAVE_BARS }, () => 0));
      if (!cancelled.current && blob.size > 0) onCompleteRef.current({ blob, mime, durationSeconds });
    },
    [release],
  );

  const stop = useCallback(() => {
    cancelled.current = false;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelled.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    else release();
  }, [release]);

  const start = useCallback(async () => {
    setError(null);
    if (typeof window === "undefined" || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("Recording needs a secure connection (https) or localhost. Open the app that way, or fill the quote in by hand.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setError("This browser can't record audio. Try Chrome, Edge, Firefox or Safari, or fill the quote in by hand.");
      return;
    }

    setStatus("requesting");
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      setStatus("idle");
      setError(micErrorMessage(e));
      return;
    }

    stream.current = media;
    cancelled.current = false;
    chunks.current = [];

    const mimeType = pickRecorderMime((m) => MediaRecorder.isTypeSupported(m));
    let rec: MediaRecorder;
    try {
      rec = mimeType ? new MediaRecorder(media, { mimeType }) : new MediaRecorder(media);
    } catch {
      release();
      setStatus("idle");
      setError("We couldn't start recording in this browser. Fill the quote in by hand instead.");
      return;
    }
    recorder.current = rec;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data);
    };
    rec.onstop = () => finish(rec.mimeType || mimeType || "audio/webm");

    // Level meter: one bar per tick, newest on the right.
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      audioCtx.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(media).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let last = 0;
      const tick = (now: number) => {
        raf.current = requestAnimationFrame(tick);
        if (now - last < 60) return;
        last = now;
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
        setLevels((prev) => [...prev.slice(1), Math.min(1, peak * 1.6)]);
      };
      raf.current = requestAnimationFrame(tick);
    } catch {
      // The meter is cosmetic; recording still works without it.
    }

    startedAt.current = performance.now();
    rec.start(250);
    setStatus("recording");
    setSeconds(0);
    timer.current = window.setInterval(() => {
      const elapsed = (performance.now() - startedAt.current) / 1000;
      setSeconds(elapsed);
      if (elapsed >= MAX_RECORDING_SECONDS) stop();
    }, 250);
  }, [finish, release, stop]);

  // Release the microphone if the component goes away mid-recording.
  useEffect(
    () => () => {
      cancelled.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      release();
    },
    [release],
  );

  return { status, seconds, levels, error, start, stop, cancel, clearError: () => setError(null) };
}
