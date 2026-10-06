/**
 * useAiriLive — owns the whole voice session:
 * mic capture → Gemini Live (ephemeral token) → gapless playback, with
 * interruption handling, session resumption/reconnect, and full cleanup.
 * Transcriptions are kept in refs only (emotion inference) and never rendered.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveServerMessage, Session } from "@google/genai";
import { MicCapture, PcmPlayer, base64ToFloat32, int16ToBase64, synthSpeech } from "@/lib/audio/pipeline";
import { LIVE_MODEL, buildLiveConfig, inferEmotion, type AiriEmotion } from "@/lib/airi-config";
import { mintLiveToken } from "@/lib/live-token.functions";

export type AiriState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "interrupted" | "error";

const MOCK = import.meta.env.VITE_AIRI_MOCK === "true";
const MAX_RETRIES = 5;

export function useAiriLive() {
  const [state, setState] = useState<AiriState>("idle");
  const [emotion, setEmotion] = useState<AiriEmotion>("neutral");
  const stateRef = useRef<AiriState>("idle");
  const ctxRef = useRef<AudioContext | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const handleRef = useRef<string | undefined>(undefined);
  const retriesRef = useRef(0);
  const closingRef = useRef(false);
  const turnDoneRef = useRef(true);
  const transcriptRef = useRef(""); // hidden — emotion only
  const timersRef = useRef<number[]>([]);

  const set = useCallback((s: AiriState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const interrupt = useCallback(() => {
    playerRef.current?.flush();
    transcriptRef.current = "";
    set("interrupted");
    const id = window.setTimeout(() => stateRef.current === "interrupted" && set("listening"), 350);
    timersRef.current.push(id);
  }, [set]);

  // ---------- Real Gemini Live ----------
  const handleMessage = useCallback(
    (msg: LiveServerMessage) => {
      const sc = msg.serverContent;
      if (msg.sessionResumptionUpdate?.resumable && msg.sessionResumptionUpdate.newHandle) {
        handleRef.current = msg.sessionResumptionUpdate.newHandle;
      }
      if (msg.goAway) {
        // Server will close soon — reconnect proactively with the resumption handle.
        sessionRef.current?.close();
        return;
      }
      if (!sc) return;
      if (sc.interrupted) {
        interrupt();
        return;
      }
      if (sc.inputTranscription?.text && !playerRef.current?.playing) {
        if (stateRef.current === "listening") set("thinking");
      }
      if (sc.outputTranscription?.text) {
        transcriptRef.current = (transcriptRef.current + sc.outputTranscription.text).slice(-200);
        const e = inferEmotion(sc.outputTranscription.text) ?? inferEmotion(transcriptRef.current);
        if (e) setEmotion(e);
      }
      for (const part of sc.modelTurn?.parts ?? []) {
        const d = part.inlineData;
        if (d?.data && d.mimeType?.startsWith("audio/")) {
          turnDoneRef.current = false;
          playerRef.current?.enqueue(base64ToFloat32(d.data));
          if (stateRef.current !== "speaking") set("speaking");
        }
      }
      if (sc.turnComplete) {
        turnDoneRef.current = true;
        transcriptRef.current = "";
        if (!playerRef.current?.playing) set("listening");
      }
    },
    [interrupt, set],
  );

  const connect = useCallback(async () => {
    set("connecting");
    try {
      const { GoogleGenAI, Modality } = await import("@google/genai");
      const { token } = await mintLiveToken();
      const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: "v1alpha" } });
      const session = await ai.live.connect({
        model: LIVE_MODEL,
        config: {
          ...(buildLiveConfig(Modality) as object),
          sessionResumption: { handle: handleRef.current },
        },
        callbacks: {
          onopen: () => {
            retriesRef.current = 0;
          },
          onmessage: handleMessage,
          onerror: (e) => console.warn("[airi] live error", e),
          onclose: () => {
            sessionRef.current = null;
            if (closingRef.current) return;
            playerRef.current?.flush();
            if (retriesRef.current < MAX_RETRIES) {
              const delay = 400 * 2 ** retriesRef.current++;
              const id = window.setTimeout(() => void connect(), delay);
              timersRef.current.push(id);
              set("connecting");
            } else set("error");
          },
        },
      });
      sessionRef.current = session;
      set("listening");
    } catch (err) {
      console.error("[airi] connect failed", err);
      if (!closingRef.current && retriesRef.current < 2) {
        retriesRef.current++;
        const id = window.setTimeout(() => void connect(), 1000);
        timersRef.current.push(id);
      } else set("error");
    }
  }, [handleMessage, set]);

  // ---------- Mock mode (VITE_AIRI_MOCK=true) ----------
  const mockLoop = useCallback(() => {
    let loud = 0;
    let quiet = 0;
    const emotions: AiriEmotion[] = ["happy", "amused", "surprised", "thinking", "concerned", "neutral"];
    const id = window.setInterval(() => {
      const lvl = micRef.current?.level ?? 0;
      const st = stateRef.current;
      const talking = lvl > 0.04;
      if (st === "speaking" && talking) {
        loud++;
        if (loud > 3) {
          loud = 0;
          interrupt();
        }
        return;
      }
      if (st === "listening" || st === "interrupted") {
        if (talking) {
          loud++;
          quiet = 0;
        } else if (loud > 4) {
          quiet++;
          if (quiet > 8) {
            loud = quiet = 0;
            set("thinking");
            setEmotion("thinking");
            const t = window.setTimeout(() => {
              setEmotion(emotions[Math.floor(Math.random() * emotions.length)]);
              turnDoneRef.current = true;
              playerRef.current?.enqueue(synthSpeech(2 + Math.random() * 2.5));
              set("speaking");
            }, 600);
            timersRef.current.push(t);
          }
        } else loud = 0;
      }
    }, 50);
    timersRef.current.push(id);
  }, [interrupt, set]);

  /** Must be called from the user gesture that granted the mic (autoplay policy). */
  const start = useCallback(
    async (stream: MediaStream) => {
      closingRef.current = false;
      const ctx = new AudioContext({ latencyHint: "interactive" });
      await ctx.resume();
      ctxRef.current = ctx;
      const player = new PcmPlayer(ctx, 24000);
      player.onDrain = () => {
        if (turnDoneRef.current && stateRef.current === "speaking") set("listening");
      };
      playerRef.current = player;
      const mic = new MicCapture(ctx, stream);
      micRef.current = mic;
      await mic.start((pcm) => {
        const s = sessionRef.current;
        if (!s) return;
        try {
          s.sendRealtimeInput({ audio: { data: int16ToBase64(pcm), mimeType: "audio/pcm;rate=16000" } });
        } catch {
          /* socket closing; reconnect logic handles it */
        }
      });
      if (MOCK) {
        set("listening");
        mockLoop();
      } else await connect();
    },
    [connect, mockLoop, set],
  );

  const stop = useCallback(() => {
    closingRef.current = true;
    timersRef.current.forEach((t) => {
      clearTimeout(t);
      clearInterval(t);
    });
    timersRef.current = [];
    try {
      sessionRef.current?.close();
    } catch {
      /* ignore */
    }
    sessionRef.current = null;
    micRef.current?.stop();
    micRef.current = null;
    playerRef.current?.dispose();
    playerRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    transcriptRef.current = "";
  }, []);

  const retry = useCallback(() => {
    retriesRef.current = 0;
    if (!micRef.current) return;
    void connect();
  }, [connect]);

  useEffect(() => stop, [stop]);

  const getOutputLevel = useCallback(() => playerRef.current?.level() ?? 0, []);
  const getInputLevel = useCallback(() => micRef.current?.level ?? 0, []);

  return { state, emotion, start, stop, retry, getOutputLevel, getInputLevel, mock: MOCK };
}
