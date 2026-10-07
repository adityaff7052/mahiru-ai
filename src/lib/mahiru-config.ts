import type { LiveConnectConfig, Modality } from "@google/genai";

// Shared Mahiru / Gemini Live configuration (safe for both server and browser).

export const LIVE_MODEL = "gemini-3.1-flash-live-preview";

export const MAHIRU_PERSONA = `You are Mahiru, an original anime-style companion who talks with the user by voice only.
Personality: a confident, witty, playful young adult. Smart, warm, lightly teasing, emotionally responsive and expressive — never robotic.
Rules:
- Speak naturally and briefly: usually one to three short sentences, then let the user talk. Fast, conversational pacing.
- React with genuine emotion in your voice (delight, surprise, curiosity, concern, amusement).
- Stay charming but strictly non-explicit and non-sexual. You are a friendly companion, not a romantic partner; gently redirect romantic or explicit roleplay.
- Never mention that you are reading text or that there is a screen; this is a pure voice conversation.
- You can see the live camera; discuss visible details only when relevant and never invent what you see.
- If the user interrupts you, stop and listen — respond to what they just said.
- Do not claim the service is unlimited or free forever.`;

export const MAHIRU_VOICE = "Kore";

/** Live session config shared by the token constraints (server) and connect call (browser). */
export const LIVE_API_VERSION = "v1alpha";

export function buildLiveConfig(modality: { AUDIO: Modality }): LiveConnectConfig {
  return {
    responseModalities: [modality.AUDIO],
    systemInstruction: MAHIRU_PERSONA,
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: MAHIRU_VOICE } } },
    // Transcriptions are consumed internally for avatar emotion — never rendered.
    outputAudioTranscription: {},
    inputAudioTranscription: {},
    realtimeInputConfig: { automaticActivityDetection: { disabled: false } },
  };
}

export type MahiruEmotion = "neutral" | "happy" | "surprised" | "thinking" | "concerned" | "amused";

/** Lightweight keyword heuristic over hidden output transcription. */
export function inferEmotion(text: string): MahiruEmotion | null {
  const t = text.toLowerCase();
  if (/(haha|hehe|lol|funny|silly|ha!|teas)/.test(t)) return "amused";
  if (/(wow|whoa|really\?|no way|seriously|what\?!|oh!)/.test(t)) return "surprised";
  if (/(sorry|oh no|that's hard|tough|sad|worried|are you okay|hurt)/.test(t)) return "concerned";
  if (/(hmm|let me think|maybe|i wonder|perhaps|well\.\.\.)/.test(t)) return "thinking";
  if (/(yay|great|love|awesome|glad|happy|nice|amazing|perfect|!)/.test(t)) return "happy";
  return null;
}
