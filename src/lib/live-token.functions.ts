import { createServerFn } from "@tanstack/react-start";
import {
  LIVE_MODEL,
  LIVE_API_VERSION,
  buildLiveConfig,
} from "./mahiru-config";

/**
 * Creates a short-lived, single-use Gemini Live token.
 *
 * IMPORTANT:
 * Keep both long-lived API keys on the server.
 * Prefer GEMINI_API_KEY and GEMINI_API_KEY_2 in Vercel Environment Variables.
 */

// Optional local placeholders.
// For deployment, leave these empty and use server environment variables.
const LOCAL_PRIMARY_API_KEY = "";
const LOCAL_BACKUP_API_KEY = "";

function getApiKeys(): string[] {
  const primary =
    process.env["GEMINI_API_KEY"] || LOCAL_PRIMARY_API_KEY;
  const backup =
    process.env["GEMINI_API_KEY_2"] || LOCAL_BACKUP_API_KEY;

  return [...new Set([primary, backup].filter(Boolean))];
}

function isRetryableForBackup(error: unknown): boolean {
  const err = error as {
    status?: number;
    statusCode?: number;
    message?: string;
    code?: string;
  };

  const status = err?.status ?? err?.statusCode;
  const message = String(err?.message ?? "").toLowerCase();
  const code = String(err?.code ?? "").toLowerCase();

  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    code.includes("resource_exhausted") ||
    code.includes("rate_limit") ||
    message.includes("quota") ||
    message.includes("rate limit") ||
    message.includes("resource_exhausted") ||
    message.includes("temporarily unavailable") ||
    message.includes("internal server error")
  );
}

export const mintLiveToken = createServerFn({
  method: "POST",
}).handler(async () => {
  const apiKeys = getApiKeys();

  if (apiKeys.length === 0) {
    throw new Error(
      "No Gemini API key configured. Set GEMINI_API_KEY on the server.",
    );
  }

  const { GoogleGenAI, Modality } = await import("@google/genai");
  const now = Date.now();

  let lastError: unknown;

  for (let index = 0; index < apiKeys.length; index++) {
    const apiKey = apiKeys[index];

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          apiVersion: LIVE_API_VERSION,
        },
      });

      const token = await ai.authTokens.create({
        config: {
          uses: 1,
          expireTime: new Date(now + 30 * 60_000).toISOString(),
          newSessionExpireTime: new Date(
            now + 60_000,
          ).toISOString(),

          liveConnectConstraints: {
            model: LIVE_MODEL,
            config: {
              ...buildLiveConfig(Modality),
              sessionResumption: {},
            },
          },

          httpOptions: {
            apiVersion: LIVE_API_VERSION,
          },
        },
      });

      if (!token.name) {
        throw new Error("Gemini did not return a Live token.");
      }

      return {
        token: token.name,
        model: LIVE_MODEL,
      };
    } catch (error) {
      lastError = error;

      const hasBackup = index < apiKeys.length - 1;

      if (!hasBackup || !isRetryableForBackup(error)) {
        throw error;
      }

      // Try the next configured key.
      // Never log or return the API key itself.
      console.warn(
        "[mahiru] Primary Gemini token creation failed with a retryable error; trying backup key.",
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Could not create a Gemini Live token.");
});
