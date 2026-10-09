/** Owns voice/camera transport. Transcripts remain internal; media is never stored. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveServerMessage, Session } from "@google/genai";
import { MicCapture, PcmPlayer, base64ToFloat32, int16ToBase64, synthSpeech } from "@/lib/audio/pipeline";
import { LIVE_MODEL, LIVE_API_VERSION, buildLiveConfig, inferEmotion, type MahiruEmotion } from "@/lib/mahiru-config";
import { mintLiveToken } from "@/lib/live-token.functions";
import { startVideoFrames } from "@/lib/video-pipeline";
import { appendMemory, emptyMemory, restoreMemory, saveMemory, resetConversationMemory } from '@/lib/conversation-memory';
import { PresencePolicy } from '@/lib/presence-policy';
import { startPresenceDetector } from '@/lib/presence-detector';

export type MahiruState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "interrupted" | "error";
const MOCK = import.meta.env["VITE_MAHIRU_MOCK"] === "true";

export function useMahiruLive() {
  const [state, setState] = useState<MahiruState>("idle");
  const [emotion, setEmotion] = useState<MahiruEmotion>("neutral");
  const [error, setError] = useState("");
  const stateRef = useRef<MahiruState>("idle");
  const ctxRef = useRef<AudioContext | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const handleRef = useRef<string | undefined>(undefined);
  const retriesRef = useRef(0);
  const closingRef = useRef(true);
  const generationRef = useRef(0);
  const turnDoneRef = useRef(true);
  const suppressOutputRef = useRef(false);
  const transcriptRef = useRef("");
  const userTranscriptRef = useRef("");
  const memoryRef = useRef(emptyMemory());
  const presenceRef = useRef(new PresencePolicy());
  const attentiveRef = useRef(false);
  const stopPresenceRef = useRef<(() => void) | null>(null);
  const mutedRef = useRef(false);
  const readyRef = useRef(false);
  const readyCallbackRef = useRef<(() => void) | null>(null);
  const cameraOnRef = useRef(true);
  const commitMemory = useCallback(() => {
    memoryRef.current = appendMemory(memoryRef.current, 'user', userTranscriptRef.current);
    memoryRef.current = appendMemory(memoryRef.current, 'model', transcriptRef.current);
    userTranscriptRef.current = ''; transcriptRef.current = '';
    try { saveMemory(localStorage, memoryRef.current); } catch { /* Local storage blocked. */ }
  }, []);
  const timersRef = useRef<number[]>([]);
  const stopFramesRef = useRef<(() => void) | null>(null);

  const set = useCallback((s: MahiruState) => { stateRef.current = s; setState(s); }, []);
  const fail = useCallback((boundary: string, reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error(`[mahiru] ${boundary}: ${message}`);
    setError(`${boundary}: ${message}`);
    stopFramesRef.current?.(); stopFramesRef.current = null;
    playerRef.current?.flush();
    set("error");
  }, [set]);
  const interrupt = useCallback(() => {
    playerRef.current?.flush();
    suppressOutputRef.current = true;
    commitMemory();
    presenceRef.current.cancel(Date.now());
    setEmotion('neutral');
    set("interrupted");
  }, [commitMemory, set]);

  const handleMessage = useCallback((msg: LiveServerMessage) => {
    if (msg.sessionResumptionUpdate?.resumable && msg.sessionResumptionUpdate.newHandle) {
      handleRef.current = msg.sessionResumptionUpdate.newHandle;
    }
    if (msg.goAway) { sessionRef.current?.close(); return; }
    const sc = msg.serverContent;
    if (!sc) return;
    if (sc.interrupted) {
      interrupt();
      // The server has acknowledged the interruption; subsequent audio belongs to the new turn.
      suppressOutputRef.current = false;
      turnDoneRef.current = true;
      set("listening");
      return;
    }
    if (sc.inputTranscription?.text) {
      userTranscriptRef.current = (userTranscriptRef.current + sc.inputTranscription.text).slice(-1200);
      presenceRef.current.cancel(Date.now());
      if (!playerRef.current?.playing) set("thinking");
    }
    if (sc.outputTranscription?.text) {
      transcriptRef.current = (transcriptRef.current + sc.outputTranscription.text).slice(-1200);
      const inferred = inferEmotion(transcriptRef.current);
      if (inferred) setEmotion(inferred);
    }
    for (const part of sc.modelTurn?.parts ?? []) {
      const audio = part.inlineData;
      if (audio?.data && audio.mimeType?.startsWith("audio/") && !suppressOutputRef.current) {
        try {
          turnDoneRef.current = false;
          playerRef.current?.enqueue(base64ToFloat32(audio.data));
          set("speaking");
        } catch (reason) { fail("Audio playback", reason); }
      }
    }
    if (sc.turnComplete) {
      turnDoneRef.current = true;
      suppressOutputRef.current = false;
      commitMemory();
      if (!playerRef.current?.playing) set("listening");
    }
  }, [commitMemory, fail, interrupt, set]);

  const connect = useCallback(async function openSession() {
    const generation = ++generationRef.current;
    setError(""); set("connecting");
    stopFramesRef.current?.(); stopFramesRef.current = null;
    sessionRef.current = null;
    commitMemory();
    const resuming = Boolean(handleRef.current);
    let opened = false;
    let ready = false;
    let ended = false;
    let readyHandled = false;
    readyRef.current = false; readyCallbackRef.current = null;
    try {
      const { GoogleGenAI, Modality } = await import("@google/genai");
      const { token } = await mintLiveToken();
      if (closingRef.current || generation !== generationRef.current) return;
      const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: LIVE_API_VERSION } });
      const session = await ai.live.connect({
        model: LIVE_MODEL,
        config: { ...buildLiveConfig(Modality), sessionResumption: handleRef.current ? { handle: handleRef.current } : {} },
        callbacks: {
          onopen: () => { opened = true; },
          onmessage: (message) => {
            if (generation === generationRef.current && !closingRef.current) {
              if (message.setupComplete) { ready = true; readyCallbackRef.current?.(); }
              handleMessage(message);
            }
          },
          onerror: (event) => {
            if (generation !== generationRef.current || closingRef.current) return;
            ended = true;
            stopFramesRef.current?.();
            sessionRef.current?.close(); sessionRef.current = null;
            playerRef.current?.flush();
            fail("Live connection", event.message || "Connection failed");
          },
          onclose: (event) => {
            if (generation !== generationRef.current || closingRef.current) return;
            sessionRef.current = null;
            stopFramesRef.current?.(); stopFramesRef.current = null;
            playerRef.current?.flush();
            if (ended) return;
            ended = true;
            console.warn(`[mahiru] Live closed (${event.code}): ${event.reason || "No reason supplied"}`);
            // Retry only transport loss / scheduled session expiry, never auth or policy failures.
            if (opened && [1000, 1001, 1006, 1011, 1012, 1013].includes(event.code) && retriesRef.current < 3) {
              const delay = 1000 * 2 ** retriesRef.current++;
              set("connecting");
              timersRef.current.push(window.setTimeout(() => void openSession(), delay));
            } else fail("Live closed", `${event.code}: ${event.reason || "Start a new connection"}`);
          },
        },
      });
      if (closingRef.current || generation !== generationRef.current || ended) { session.close(); return; }
      // Keep the session immediately; setupComplete may arrive after connect() resolves.
      sessionRef.current = session;
      suppressOutputRef.current = false;
      const onReady = () => {
        if (readyHandled || generation !== generationRef.current || closingRef.current) return;
        readyHandled = true; readyRef.current = true;
        if (cameraOnRef.current) stopFramesRef.current = startVideoFrames(session, () => videoRef.current, (reason) => fail("Camera frame", reason));
        set("listening");
        // Prefill history silently (turnComplete false): no scripted greeting.
        if (!resuming && memoryRef.current.turns.length) session.sendClientContent({
          turns: memoryRef.current.turns.map(turn => ({ role: turn.role, parts: [{ text: turn.text }] })), turnComplete: false,
        });
      };
      readyCallbackRef.current = onReady;
      if (ready) onReady();
      else timersRef.current.push(window.setTimeout(() => {
        if (!readyHandled && generation === generationRef.current && !closingRef.current) {
          try { session.close(); } catch { /* closed */ }
          sessionRef.current = null;
          fail("Live startup", "Session setup timed out");
        }
      }, 12000));
    } catch (reason) {
      if (!closingRef.current && generation === generationRef.current) fail("Live startup", reason);
    }
  }, [commitMemory, fail, handleMessage, set]);

  const stop = useCallback(() => {
    commitMemory();
    stopPresenceRef.current?.(); stopPresenceRef.current = null;
    attentiveRef.current = false;
    closingRef.current = true; generationRef.current++;
    timersRef.current.forEach((timer) => { clearTimeout(timer); clearInterval(timer); }); timersRef.current = [];
    stopFramesRef.current?.(); stopFramesRef.current = null;
    try { sessionRef.current?.close(); } catch { /* Already closed. */ }
    sessionRef.current = null; readyRef.current = false; readyCallbackRef.current = null;
    micRef.current?.stop(); micRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    playerRef.current?.dispose(); playerRef.current = null;
    void ctxRef.current?.close().catch(() => {}); ctxRef.current = null;
    transcriptRef.current = ""; handleRef.current = undefined;
  }, [commitMemory]);

  const start = useCallback(async (stream: MediaStream) => {
    stop(); closingRef.current = false; streamRef.current = stream;
    try { memoryRef.current = restoreMemory(localStorage); } catch { /* Storage disabled. */ }
    const presenceGeneration = generationRef.current;
    void startPresenceDetector(() => videoRef.current, attention => { attentiveRef.current = attention; }).then(dispose => {
      if (closingRef.current || presenceGeneration > generationRef.current) dispose();
      else stopPresenceRef.current = dispose;
    }).catch(() => { attentiveRef.current = false; console.warn('[mahiru] Local attention unavailable; proactive speech disabled.'); });
    timersRef.current.push(window.setInterval(() => {
      const ctx = ctxRef.current, stream = streamRef.current, session = sessionRef.current;
      const userSpeaking = (micRef.current?.level ?? 0) > .025;
      const available = Boolean(session && stateRef.current === 'listening' && ctx?.state === 'running' && !mutedRef.current && !document.hidden && stream?.getAudioTracks().some(track => track.enabled && !track.muted));
      if (presenceRef.current.update(Date.now(), attentiveRef.current, available, userSpeaking) && session) {
        try { session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: 'Local attention event: the user has been quietly facing the camera for several seconds. If appropriate, offer one brief, varied, friendly non-romantic check-in using our current conversation and visible context. Do not claim exact eye contact or invent observations. Stop if the user speaks.' }] }], turnComplete: true }); }
        catch (reason) { console.warn('[mahiru] Check-in could not be sent'); }
      }
    }, 500));
    setError(""); set("connecting");
    retriesRef.current = 0; turnDoneRef.current = true; suppressOutputRef.current = false;
    try {
      const ctx = new AudioContext({ latencyHint: "interactive" }); ctxRef.current = ctx;
      await ctx.resume();
      if (closingRef.current) return;
      const player = new PcmPlayer(ctx, 24000); playerRef.current = player;
      player.onDrain = () => { if (turnDoneRef.current && stateRef.current === "speaking") set("listening"); };
      const mic = new MicCapture(ctx, stream); micRef.current = mic;
      await mic.start((pcm) => {
        if (closingRef.current || stateRef.current === "error") return;
        // Capture chunks are dropped until connect resolves with an open session.
        const session = sessionRef.current;
        if ((!session || !readyRef.current) && !MOCK) return;
        if (mic.level > .025) presenceRef.current.cancel(Date.now());
        if (stateRef.current === "speaking" && mic.level > 0.035) interrupt();
        if (MOCK) return;
        try { session?.sendRealtimeInput({ audio: { data: int16ToBase64(pcm), mimeType: "audio/pcm;rate=16000" } }); }
        catch (reason) { fail("Microphone send", reason); }
      });
      if (closingRef.current) { mic.stop(); return; }
      if (MOCK) {
        set("listening");
        timersRef.current.push(window.setInterval(() => {
          if (stateRef.current === "listening" && mic.level > 0.04) {
            setEmotion("happy"); turnDoneRef.current = true;
            player.enqueue(synthSpeech(2)); set("speaking");
          } else if (stateRef.current === "interrupted" && mic.level < 0.02) set("listening");
        }, 100));
      } else await connect();
    } catch (reason) { fail("Media startup", reason); }
  }, [connect, fail, interrupt, set, stop]);

  const retry = useCallback(() => {
    if (!micRef.current || closingRef.current) return;
    retriesRef.current = 0;
    const previous = sessionRef.current;
    generationRef.current++;
    sessionRef.current = null;
    previous?.close();
    timersRef.current.forEach((timer) => clearTimeout(timer)); timersRef.current = [];
    void connect();
  }, [connect]);
  useEffect(() => stop, [stop]);
  const getOutputLevel = useCallback(() => playerRef.current?.level() ?? 0, []);
  const getInputLevel = useCallback(() => micRef.current?.level ?? 0, []);
  const clearMemory = useCallback(() => {
    userTranscriptRef.current = ''; transcriptRef.current = '';
    try { memoryRef.current = resetConversationMemory(localStorage); } catch { memoryRef.current = emptyMemory(); }
  }, []);
  const setMuted = useCallback((muted: boolean) => { mutedRef.current = muted; if (muted) { presenceRef.current.cancel(Date.now()); interrupt(); } }, [interrupt]);
  /** Camera off stops frame streaming; audio conversation continues. */
  const setCameraActive = useCallback((active: boolean) => {
    cameraOnRef.current = active;
    stopFramesRef.current?.(); stopFramesRef.current = null;
    const session = sessionRef.current;
    if (active && session && readyRef.current) stopFramesRef.current = startVideoFrames(session, () => videoRef.current, (reason) => fail("Camera frame", reason));
  }, [fail]);
  return { setCameraActive, state, emotion, error, videoRef, start, stop, retry, getOutputLevel, getInputLevel, clearMemory, setMuted, mock: MOCK };
}
