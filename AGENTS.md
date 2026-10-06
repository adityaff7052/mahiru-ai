<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Gemini key stays server-side; browser gets single-use ephemeral tokens from `mintLiveToken` (src/lib/live-token.functions.ts). Why: never ship long-lived keys.
- Live config/persona lives in src/lib/airi-config.ts and is used both for token constraints and the connect call. Why: one source of truth.
- Audio I/O lives in src/lib/audio/pipeline.ts; session logic in src/hooks/use-airi-live.ts. Why: separation of transport and UI.
- Transcripts are kept in refs only, never rendered. Why: voice-only product requirement.
- Avatar is SVG animated via rAF attribute writes. Why: per-frame mouth/blink without React re-renders.
