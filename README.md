# Mahiru — voice-first AI companion

Full-screen black stage, an animated anime companion, and a small local camera preview. You talk; she talks back (Gemini Live, `gemini-3.1-flash-live-preview`, audio-to-audio).

## Environment variables
| Name | Where | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | server secret (Project Settings → Secrets) | Used only on the server to mint single-use ephemeral Live tokens. |
| `VITE_MAHIRU_MOCK` | build env (`.env.local`) | `true` = mock mode: no Gemini calls, synthetic voice replies for UI testing. |

## Local dev
```
bun install
echo "GEMINI_API_KEY=your_key" > .env   # server-side only
# optional: echo "VITE_MAHIRU_MOCK=true" > .env.local
bun run dev   # http://localhost:8080
```
Microphone and camera access require a secure origin (https or localhost). `file://` will not work. For a desktop app, wrap the served app with Electron/Tauri pointing at localhost or a bundled server.

## Pipeline
Mic → AudioWorklet (downsample to 16 kHz Int16, 40 ms chunks) → Live session (ephemeral token) → 24 kHz PCM → gapless queue → analyser (mouth). On `interrupted` the queue is flushed instantly. Session resumption handles + backoff reconnect recover from drops. Gemini usage is billed to your API key per Google's pricing.

Camera frames are JPEG 320×180, sent at most once per second after Live setup completes. No recording, file storage, or visible transcripts. Both permissions are required; portrait phones hide the character and preview without stopping granted media.

The installed SDK requires `v1alpha` for ephemeral tokens and constrained Live connections; both use the shared API version. A socket opening alone is not readiness: microphone/video streaming waits for `setupComplete`. The model remains exactly `gemini-3.1-flash-live-preview`.
