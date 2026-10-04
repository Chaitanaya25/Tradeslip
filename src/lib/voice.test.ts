import { describe, expect, it } from "vitest";
import {
  baseMime,
  downsamplePeaks,
  extensionForMime,
  formatTimer,
  isValidVoicePath,
  mimeForPath,
  pickRecorderMime,
  voicePathFor,
} from "./voice";

const BIZ = "6f1c2c1e-0000-4000-8000-000000000001";
const UUID = "123e4567-e89b-42d3-a456-426614174000";

describe("pickRecorderMime", () => {
  it("prefers webm/opus", () => {
    expect(pickRecorderMime(() => true)).toBe("audio/webm;codecs=opus");
  });
  it("falls back to mp4 for Safari", () => {
    expect(pickRecorderMime((m) => m.startsWith("audio/mp4"))).toBe("audio/mp4;codecs=mp4a.40.2");
    expect(pickRecorderMime((m) => m === "audio/mp4")).toBe("audio/mp4");
  });
  it("returns null so the browser default is used", () => {
    expect(pickRecorderMime(() => false)).toBeNull();
  });
});

describe("mime helpers", () => {
  it("strips codec parameters", () => {
    expect(baseMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(baseMime("Audio/MP4")).toBe("audio/mp4");
  });
  it("maps types to extensions and back", () => {
    expect(extensionForMime("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionForMime("audio/mp4")).toBe("mp4");
    expect(extensionForMime("something/odd")).toBe("webm");
    expect(mimeForPath(`${BIZ}/${UUID}.webm`)).toBe("audio/webm");
    expect(mimeForPath(`${BIZ}/${UUID}.mp4`)).toBe("audio/mp4");
    expect(mimeForPath(`${BIZ}/${UUID}.exe`)).toBeNull();
  });
});

describe("voice paths", () => {
  it("builds {business}/{uuid}.{ext}", () => {
    expect(voicePathFor(BIZ, UUID, "audio/webm;codecs=opus")).toBe(`${BIZ}/${UUID}.webm`);
  });
  it("accepts only the caller's own folder with a uuid filename", () => {
    expect(isValidVoicePath(`${BIZ}/${UUID}.webm`, BIZ)).toBe(true);
    expect(isValidVoicePath(`${BIZ}/${UUID}.mp4`, BIZ)).toBe(true);
    expect(isValidVoicePath(`other/${UUID}.webm`, BIZ)).toBe(false);
    expect(isValidVoicePath(`${BIZ}/sub/${UUID}.webm`, BIZ)).toBe(false);
    expect(isValidVoicePath(`${BIZ}/../${BIZ}/${UUID}.webm`, BIZ)).toBe(false);
    expect(isValidVoicePath(`${BIZ}/evil.webm`, BIZ)).toBe(false);
    expect(isValidVoicePath(`${BIZ}/${UUID}.exe`, BIZ)).toBe(false);
    expect(isValidVoicePath("", BIZ)).toBe(false);
  });
});

describe("formatTimer", () => {
  it("formats mm:ss", () => {
    expect(formatTimer(0)).toBe("00:00");
    expect(formatTimer(23)).toBe("00:23");
    expect(formatTimer(83.9)).toBe("01:23");
    expect(formatTimer(120)).toBe("02:00");
    expect(formatTimer(-5)).toBe("00:00");
  });
});

describe("downsamplePeaks", () => {
  it("returns the requested number of bars scaled to the loudest", () => {
    const bars = downsamplePeaks([0.1, 0.5, 0.25, 1, 0.2, 0.2, 0.9, 0.3], 4);
    expect(bars).toHaveLength(4);
    expect(Math.max(...bars)).toBe(1);
    expect(bars[1]).toBe(1); // slice [0.25, 1] -> 1
  });
  it("keeps quiet bars visible and handles empty input", () => {
    expect(downsamplePeaks([0, 0, 0, 1], 2)[0]).toBe(0.08);
    expect(downsamplePeaks([], 5)).toEqual([0.15, 0.15, 0.15, 0.15, 0.15]);
  });
  it("works when there are fewer samples than bars", () => {
    expect(downsamplePeaks([0.5, 1], 6)).toHaveLength(6);
  });
});
