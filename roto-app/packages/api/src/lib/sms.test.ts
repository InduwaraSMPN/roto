import { describe, expect, it } from "vitest";
import { sendSms, sosTextFor } from "./sms";

describe("sosTextFor", () => {
  it("builds an English SOS text with the rider name and live link", () => {
    const text = sosTextFor("en", "Amal", "https://example.test/t/abc");
    expect(text).toContain("Amal");
    expect(text).toContain("https://example.test/t/abc");
    expect(text).toContain("1990");
  });

  it("builds Sinhala and Tamil variants", () => {
    expect(sosTextFor("si", "Amal", "https://example.test/t/abc")).toContain("https://example.test/t/abc");
    expect(sosTextFor("ta", "Amal", "https://example.test/t/abc")).toContain("https://example.test/t/abc");
  });

  it("falls back to English for unknown languages", () => {
    expect(sosTextFor("fr", "Amal", "https://example.test/t/abc")).toBe(sosTextFor("en", "Amal", "https://example.test/t/abc"));
  });
});

describe("sendSms", () => {
  it("is a no-op with the default none provider (D3)", async () => {
    const result = await sendSms(["+94771234567"], "hello");
    expect(result.provider).toBe("none");
    expect(result.sent).toBe(0);
  });
});
