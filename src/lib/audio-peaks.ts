import { downsamplePeaks } from "./voice";

/**
 * Browser only. Decodes an audio file to draw its waveform and learn its true duration.
 * (MediaRecorder WebM files carry no duration, so <audio>.duration is Infinity.)
 * Falls back to a flat waveform if the browser cannot decode the format.
 */
export async function analyzeAudio(source: string | Blob, bars = 48): Promise<{ peaks: number[]; duration: number | null }> {
  try {
    const buffer = typeof source === "string" ? await (await fetch(source)).arrayBuffer() : await source.arrayBuffer();
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    try {
      const audio = await ctx.decodeAudioData(buffer);
      const channel = audio.getChannelData(0);
      const step = Math.max(1, Math.floor(channel.length / (bars * 8)));
      const samples: number[] = [];
      for (let i = 0; i < channel.length; i += step) samples.push(Math.abs(channel[i]));
      return { peaks: downsamplePeaks(samples, bars), duration: audio.duration };
    } finally {
      void ctx.close();
    }
  } catch {
    return { peaks: downsamplePeaks([], bars), duration: null };
  }
}
