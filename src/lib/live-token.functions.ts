import { createServerFn } from "@tanstack/react-start";
import { LIVE_MODEL, LIVE_API_VERSION, buildLiveConfig } from "./mahiru-config";

/**
 * Mints a short-lived, single-use Gemini ephemeral token locked to the Live
 * model and AUDIO output. The long-lived GEMINI_API_KEY never leaves the server.
 */
export const mintLiveToken = createServerFn({ method: "POST" }).handler(async () => {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured on the server.");

  const { GoogleGenAI, Modality } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: LIVE_API_VERSION } });
  const now = Date.now();

  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(now + 30 * 60_000).toISOString(),
      newSessionExpireTime: new Date(now + 60_000).toISOString(),
      liveConnectConstraints: {
        model: LIVE_MODEL,
        config: { ...buildLiveConfig(Modality), sessionResumption: {} },
      },
      httpOptions: { apiVersion: LIVE_API_VERSION },
    },
  });

  if (!token.name) throw new Error("Failed to mint Live token.");
  return { token: token.name, model: LIVE_MODEL };
});
