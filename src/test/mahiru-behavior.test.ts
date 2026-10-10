import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MAHIRU_PERSONA, MAHIRU_VOICE, buildLiveConfig } from "@/lib/mahiru-config";
import { PresencePolicy, PRESENCE_DEFAULTS } from "@/lib/presence-policy";
import { isEntryCodeValid } from "@/lib/entry-gate";
import type { Modality } from "@google/genai";

describe("Mahiru behavior", () => {
  it("default persona is polite and forbids teasing, pet names and unsolicited camera remarks", () => {
    expect(MAHIRU_PERSONA).toMatch(/respectful, polite, calm/);
    expect(MAHIRU_PERSONA).toMatch(/Never use pet names or romantic language/);
    expect(MAHIRU_PERSONA).toMatch(/Never comment on a person's appearance/);
    expect(MAHIRU_PERSONA).not.toMatch(/witty|lightly teasing|playful young adult/);
  });
  it("token constraints and connection share the single persona", () => {
    expect(buildLiveConfig({ AUDIO: "AUDIO" as Modality }).systemInstruction).toBe(MAHIRU_PERSONA);
    expect(readFileSync("src/lib/live-token.functions.ts", "utf8")).not.toMatch(/systemInstruction/);
  });
  it("camera presence alone never triggers speech", () => {
    expect(PRESENCE_DEFAULTS.enabled).toBe(false);
    const p = new PresencePolicy();
    for (let t = 0; t <= 300000; t += 500) expect(p.update(t, true, true, false)).toBe(false);
    expect(readFileSync("src/hooks/use-mahiru-live.ts", "utf8")).not.toMatch(/Local attention event/);
  });
  it("keeps Leda voice and code 8917", () => {
    expect(MAHIRU_VOICE).toBe("Leda");
    expect(isEntryCodeValid("8917")).toBe(true);
  });
});
