import { describe, expect, it } from "vitest";
import {
  PHOTO_MAX_INPUT_BYTES,
  fitWithin,
  isValidPhotoPath,
  photoPathFor,
  validatePhotoFile,
} from "./job-photos";

const BIZ = "6f1c2c1e-0000-4000-8000-000000000001";
const QUOTE = "6f1c2c1e-0000-4000-8000-000000000002";
const UUID = "123e4567-e89b-42d3-a456-426614174000";

describe("fitWithin", () => {
  it("scales the longest side down to 1600, keeping the ratio", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(3200, 3200)).toEqual({ width: 1600, height: 1600 });
  });
  it("never scales up", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 1000)).toEqual({ width: 1600, height: 1000 });
  });
  it("keeps at least one pixel on a very thin image", () => {
    expect(fitWithin(16000, 3)).toEqual({ width: 1600, height: 1 });
  });
});

describe("validatePhotoFile", () => {
  it("accepts png, jpg and webp", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) expect(validatePhotoFile({ type, size: 5000 })).toBeNull();
  });
  it("rejects other types, empty and oversize files", () => {
    expect(validatePhotoFile({ type: "image/gif", size: 5 })).toMatch(/PNG, JPG or WebP/);
    expect(validatePhotoFile({ type: "image/heic", size: 5 })).toMatch(/PNG, JPG or WebP/);
    expect(validatePhotoFile({ type: "image/png", size: 0 })).toMatch(/empty/);
    expect(validatePhotoFile({ type: "image/png", size: PHOTO_MAX_INPUT_BYTES + 1 })).toMatch(/too large/);
  });
});

describe("photo paths", () => {
  it("builds {business}/{quote}/{uuid}.jpg", () => {
    expect(photoPathFor(BIZ, QUOTE, UUID)).toBe(`${BIZ}/${QUOTE}/${UUID}.jpg`);
  });
  it("only accepts this business's folder for this quote", () => {
    expect(isValidPhotoPath(photoPathFor(BIZ, QUOTE, UUID), BIZ, QUOTE)).toBe(true);
    expect(isValidPhotoPath(photoPathFor("other", QUOTE, UUID), BIZ, QUOTE)).toBe(false);
    expect(isValidPhotoPath(photoPathFor(BIZ, "other", UUID), BIZ, QUOTE)).toBe(false);
    expect(isValidPhotoPath(`${BIZ}/${QUOTE}/../x/${UUID}.jpg`, BIZ, QUOTE)).toBe(false);
    expect(isValidPhotoPath(`${BIZ}/${QUOTE}/evil.jpg`, BIZ, QUOTE)).toBe(false);
    expect(isValidPhotoPath(`${BIZ}/${QUOTE}/${UUID}.png`, BIZ, QUOTE)).toBe(false);
  });
});
