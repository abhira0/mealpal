import { describe, expect, it } from "vitest";
import { parseByteRange } from "@/lib/video-clip";

describe("parseByteRange", () => {
  it("returns null when there's no Range header", () => {
    expect(parseByteRange(null, 1000)).toBeNull();
  });

  it("returns null for a header that isn't a byte range", () => {
    expect(parseByteRange("nonsense", 1000)).toBeNull();
    expect(parseByteRange("items=0-1", 1000)).toBeNull();
  });

  it("returns null for a suffix range (last N bytes) — unsupported", () => {
    expect(parseByteRange("bytes=-500", 1000)).toBeNull();
  });

  it("parses a fully-specified range within bounds", () => {
    expect(parseByteRange("bytes=0-499", 1000)).toEqual({ start: 0, end: 499 });
  });

  it("defaults the end to size-1 when omitted", () => {
    expect(parseByteRange("bytes=500-", 1000)).toEqual({ start: 500, end: 999 });
  });

  it("clamps an end past EOF down to size-1", () => {
    expect(parseByteRange("bytes=500-1500", 1000)).toEqual({ start: 500, end: 999 });
  });

  it("returns null when start is at or past EOF", () => {
    expect(parseByteRange("bytes=1000-", 1000)).toBeNull();
    expect(parseByteRange("bytes=1000-1005", 1000)).toBeNull();
  });

  it("returns null when start is after end", () => {
    expect(parseByteRange("bytes=500-100", 1000)).toBeNull();
  });

  it("accepts the very last byte as a valid single-byte range", () => {
    expect(parseByteRange("bytes=999-999", 1000)).toEqual({ start: 999, end: 999 });
  });

  it("accepts a zero-length file's only possible degenerate range as out of bounds", () => {
    expect(parseByteRange("bytes=0-0", 0)).toBeNull(); // start(0) >= size(0)
  });
});
