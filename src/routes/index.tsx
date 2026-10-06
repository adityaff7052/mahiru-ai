import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { Mic, RotateCw } from "lucide-react";
import { AiriAvatar } from "@/components/AiriAvatar";
import { useAiriLive } from "@/hooks/use-airi-live";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Airi — Voice Companion" },
      { name: "description", content: "Talk with Airi, a witty anime-style AI companion. Voice only." },
      { property: "og:title", content: "Airi — Voice Companion" },
      { property: "og:description", content: "Talk with Airi, a witty anime-style AI companion. Voice only." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Phase = "gate" | "requesting" | "denied" | "main";

function Index() {
  const [phase, setPhase] = useState<Phase>("gate");
  const live = useAiriLive();

  // Mic is requested only here, from a user gesture (also unlocks audio playback).
  const requestMic = useCallback(async () => {
    setPhase("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      setPhase("main");
      await live.start(stream);
    } catch {
      setPhase("denied");
    }
  }, [live]);

  if (phase !== "main") {
    return (
      <main className="stage">
        <div className="gate">
          {phase === "denied" ? (
            <>
              <p className="gate-text">Microphone access is needed to talk with Airi.</p>
              <button className="gate-btn" onClick={requestMic}>
                <RotateCw className="size-4" /> Try again
              </button>
            </>
          ) : (
            <button className="gate-mic" onClick={requestMic} disabled={phase === "requesting"} aria-label="Enable microphone">
              <Mic className="size-7" />
            </button>
          )}
          {phase !== "denied" && <p className="gate-hint">Tap to enable microphone</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="stage">
      <AiriAvatar
        state={live.state}
        emotion={live.emotion}
        getOutputLevel={live.getOutputLevel}
        getInputLevel={live.getInputLevel}
      />
      {live.state === "error" ? (
        <button className="status-retry" onClick={live.retry} aria-label="Reconnect">
          <RotateCw className="size-4" />
        </button>
      ) : (
        <span className="status-dot" data-state={live.state} role="status" aria-label={live.state} />
      )}
    </main>
  );
}
