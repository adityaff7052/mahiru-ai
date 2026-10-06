// Shared Airi / Gemini Live configuration (safe for both server and browser).

export const LIVE_MODEL = "gemini-3.1-flash-live-preview";

export const AIRI_PERSONA = `You are Airi, an original anime-style companion who talks with the user by voice only.
Personality: a confident, witty, playful young adult. Smart, warm, lightly teasing, emotionally responsive and expressive — never robotic.
Rules:
- Speak naturally and briefly: usually one to three short sentences, then let the user talk. Fast, conversational pacing.
- React with genuine emotion in your voice (delight, surprise, curiosity, concern, amusement).
- Stay charming but strictly non-explicit and non-sexual. You are a friendly companion, not a romantic partner; gently redirect romantic or explicit roleplay.
- Never mention that you are reading text or that there is a screen; this is a pure voice conversation.
- If the user interrupts you, stop and listen — respond to what they just said.
- Do not claim the service is unlimited or free forever.`;

export const AIRI_VOICE = "Kore";

/** Live session config shared by the token constraints (server) and connect call (browser). */
export function buildLiveConfig(Modality: { AUDIO: unknown }) {
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: AIRI_PERSONA,
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: AIRI_VOICE } } },
    // Transcriptions are consumed internally for avatar emotion — never rendered.
    outputAudioTranscription: {},
    inputAudioTranscription: {},
    realtimeInputConfig: { automaticActivityDetection: { disabled: false } },
  };
}

export type AiriEmotion = "neutral" | "happy" | "surprised" | "thinking" | "concerned" | "amused";

/** Lightweight keyword heuristic over hidden output transcription. */
export function inferEmotion(text: string): AiriEmotion | null {
  const t = text.toLowerCase();
  if (/(haha|hehe|lol|funny|silly|ha!|teas)/.test(t)) return "amused";
  if (/(wow|whoa|really\?|no way|seriously|what\?!|oh!)/.test(t)) return "surprised";
  if (/(sorry|oh no|that's hard|tough|sad|worried|are you okay|hurt)/.test(t)) return "concerned";
  if (/(hmm|let me think|maybe|i wonder|perhaps|well\.\.\.)/.test(t)) return "thinking";
  if (/(yay|great|love|awesome|glad|happy|nice|amazing|perfect|!)/.test(t)) return "happy";
  return null;
}
