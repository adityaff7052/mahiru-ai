# Airi — voice-first AI companion

Full-screen black stage, an animated anime companion, and nothing else. You talk; she talks back (Gemini Live, `gemini-3.1-flash-live-preview`, audio-to-audio).

## Environment variables
| Name | Where | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | server secret (Project Settings → Secrets) | Used only on the server to mint single-use ephemeral Live tokens. |
| `VITE_AIRI_MOCK` | build env (`.env.local`) | `true` = mock mode: no Gemini calls, synthetic voice replies for UI testing. |

## Local dev
```
bun install
echo "GEMINI_API_KEY=your_key" > .env   # server-side only
# optional: echo "VITE_AIRI_MOCK=true" > .env.local
bun run dev   # http://localhost:8080
```
Microphone access requires a secure origin (https or localhost). `file://` will not work. For a desktop app, wrap the served app with Electron/Tauri pointing at localhost or a bundled server.

## Pipeline
Mic → AudioWorklet (downsample to 16 kHz Int16, 40 ms chunks) → Live session (ephemeral token) → 24 kHz PCM → gapless queue → analyser (mouth). On `interrupted` the queue is flushed instantly. Session resumption handles + backoff reconnect recover from drops. Gemini usage is billed to your API key per Google's pricing.
