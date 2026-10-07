import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, RotateCw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasRequiredMedia } from "@/lib/video-pipeline";
import { MahiruAvatar } from "@/components/MahiruAvatar";
import { useMahiruLive } from "@/hooks/use-mahiru-live";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mahiru — Voice Companion" },
      { name: "description", content: "Talk with Mahiru, a witty anime-style AI companion. Voice only." },
      { property: "og:title", content: "Mahiru — Voice Companion" },
      { property: "og:description", content: "Talk with Mahiru, a witty anime-style AI companion. Voice only." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Phase = "gate" | "requesting" | "denied" | "main";

function Index() {
  const [phase, setPhase] = useState<Phase>("gate");
  const live = useMahiruLive();
  const [stream, setStream] = useState<MediaStream | null>(null);
  const requesting = useRef(false);
  const grantedStream = useRef<MediaStream | null>(null);
  useEffect(() => () => {
    grantedStream.current?.getTracks().forEach((track) => track.stop());
  }, []);
  useEffect(() => {
    const video = live.videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch((error: unknown) => console.warn("[mahiru] Preview playback", error));
    return () => { video.srcObject = null; };
  }, [stream, live.videoRef]);

  // Mic is requested only here, from a user gesture (also unlocks audio playback).
  const requestMic = useCallback(async () => {
    if (requesting.current) return;
    requesting.current = true;
    setPhase("requesting");
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 360 } },
      });
      if (!hasRequiredMedia(media)) {
        media.getTracks().forEach((track) => track.stop());
        throw new Error("Both microphone and camera are required.");
      }
    } catch {
      requesting.current = false;
      setPhase("denied");
      return;
    }
    grantedStream.current = media;
    setStream(media);
    setPhase("main");
    requesting.current = false;
    await live.start(media);
  }, [live.start]);

  if (phase !== "main") {
    return (
      <main className="stage">
        <div className="gate">
          {phase === "denied" ? (
            <>
              <p className="gate-text">Microphone and camera access are needed to talk with Mahiru.</p>
              <Button variant="ghost" className="gate-btn" onClick={requestMic}>
                <RotateCw className="size-4" /> Try again
              </Button>
            </>
          ) : (
            <Button variant="ghost" className="gate-mic" onClick={requestMic} disabled={phase === "requesting"} aria-label="Enable microphone and camera">
              <Mic className="size-7" />
            </Button>
          )}
          {phase !== "denied" && <p className="gate-hint">Tap to enable microphone and camera</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="stage">
      {/* Shown only on portrait phones (CSS); the voice session keeps running underneath. */}
      <div className="rotate-prompt" role="status" aria-label="Rotate your phone to landscape">
        <Smartphone className="rotate-icon" strokeWidth={1.25} />
      </div>
      <MahiruAvatar
        state={live.state}
        emotion={live.emotion}
        getOutputLevel={live.getOutputLevel}
        getInputLevel={live.getInputLevel}
      />
      <video ref={live.videoRef} className="camera-preview" autoPlay muted playsInline aria-label="Your live camera preview" />
      {live.state === "error" ? (
        <Button variant="ghost" className="status-retry" onClick={live.retry} aria-label="Reconnect" title={live.error}>
          <RotateCw className="size-4" />
        </Button>
      ) : (
        <span className="status-dot" data-state={live.state} role="status" aria-label={live.state} />
      )}
    </main>
  );
}
