/** Voice-note rules shared by the recorder (browser) and the API route (server). */

export const MAX_RECORDING_SECONDS = 120;
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  webm: "audio/webm",
  mp4: "audio/mp4",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp3: "audio/mpeg",
};

/** "audio/webm;codecs=opus" -> "audio/webm". Storage and Gemini want the bare type. */
export function baseMime(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase();
}

export function extensionForMime(mime: string): string {
  const base = baseMime(mime);
  if (base === "audio/webm" || base === "video/webm") return "webm";
  if (base === "audio/mp4" || base === "audio/x-m4a") return "mp4";
  if (base === "audio/ogg") return "ogg";
  if (base === "audio/wav" || base === "audio/x-wav") return "wav";
  if (base === "audio/mpeg") return "mp3";
  return "webm";
}

/** MIME type to send to Gemini for a stored object path, or null for an unknown extension. */
export function mimeForPath(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? null;
}

/**
 * Preferred MediaRecorder type: WebM/Opus (Chrome, Firefox, Edge), then MP4 (Safari),
 * else null so the browser picks its default. `isSupported` is MediaRecorder.isTypeSupported.
 */
export function pickRecorderMime(isSupported: (mime: string) => boolean): string | null {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((m) => isSupported(m)) ?? null;
}

export function voicePathFor(businessId: string, uuid: string, mime: string): string {
  return `${businessId}/${uuid}.${extensionForMime(mime)}`;
}

const VOICE_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webm|mp4|m4a|ogg|wav|mp3)$/;

/** True only for `{business_id}/{uuid}.{ext}`: the caller's own folder, one level deep. */
export function isValidVoicePath(path: string, businessId: string): boolean {
  const prefix = `${businessId}/`;
  return path.startsWith(prefix) && VOICE_FILE.test(path.slice(prefix.length));
}

/** 83 -> "01:23" */
export function formatTimer(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Reduce a list of 0..1 amplitudes to `bars` values for drawing a waveform.
 * Each bar is the maximum of its slice, then everything is scaled so the loudest bar is 1.
 */
export function downsamplePeaks(peaks: readonly number[], bars = 48): number[] {
  if (peaks.length === 0) return Array.from({ length: bars }, () => 0.15);
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const start = Math.floor((i * peaks.length) / bars);
    const end = Math.max(start + 1, Math.floor(((i + 1) * peaks.length) / bars));
    let max = 0;
    for (let j = start; j < end && j < peaks.length; j++) max = Math.max(max, Math.abs(peaks[j]));
    out.push(max);
  }
  const top = Math.max(...out, 0.0001);
  // Keep a small floor so quiet bars stay visible.
  return out.map((v) => Math.max(0.08, v / top));
}
