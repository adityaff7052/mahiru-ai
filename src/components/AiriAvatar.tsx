/**
 * Original anime-style upper-body companion drawn in SVG so every feature
 * (mouth, eyelids, brows, hair strands) can be animated per-frame from audio.
 * Animation runs in a rAF loop writing attributes directly (no React re-renders).
 */
import { useEffect, useRef } from "react";
import type { AiriEmotion } from "@/lib/airi-config";
import type { AiriState } from "@/hooks/use-airi-live";

type Params = { brow: number; tilt: number; smile: number; eye: number; blush: number; head: number };
const EMO: Record<AiriEmotion, Params> = {
  neutral: { brow: 0, tilt: 0, smile: 0.25, eye: 1, blush: 0.25, head: 0 },
  happy: { brow: 2, tilt: 0, smile: 1, eye: 0.82, blush: 0.55, head: 2 },
  surprised: { brow: 6, tilt: 0, smile: -0.1, eye: 1.15, blush: 0.3, head: 0 },
  thinking: { brow: 2, tilt: -4, smile: 0, eye: 0.9, blush: 0.2, head: -4 },
  concerned: { brow: 3, tilt: 6, smile: -0.5, eye: 1, blush: 0.15, head: -2 },
  amused: { brow: 1, tilt: 0, smile: 0.85, eye: 0.72, blush: 0.5, head: 3 },
};

interface Props {
  state: AiriState;
  emotion: AiriEmotion;
  getOutputLevel: () => number;
  getInputLevel: () => number;
}

export function AiriAvatar({ state, emotion, getOutputLevel, getInputLevel }: Props) {
  const root = useRef<SVGSVGElement>(null);
  const live = useRef({ state, emotion });
  live.current = { state, emotion };

  useEffect(() => {
    const svg = root.current;
    if (!svg) return;
    const q = <T extends Element>(id: string) => svg.querySelector<T>(`[data-part="${id}"]`)!;
    const head = q<SVGGElement>("head");
    const body = q<SVGGElement>("body");
    const eyes = [q<SVGGElement>("eyeL"), q<SVGGElement>("eyeR")];
    const brows = [q<SVGPathElement>("browL"), q<SVGPathElement>("browR")];
    const lip = q<SVGPathElement>("lip");
    const mouth = q<SVGPathElement>("mouth");
    const blush = q<SVGGElement>("blush");
    const strands = Array.from(svg.querySelectorAll<SVGGElement>("[data-strand]"));

    const cur: Params = { ...EMO.neutral };
    let mouthOpen = 0;
    let sway = 0.4;
    let nextBlink = performance.now() + 2000;
    let blinkStart = -1;
    let raf = 0;

    const frame = (now: number) => {
      const { state: st, emotion: em } = live.current;
      const tgt = { ...EMO[em] };
      if (st === "listening" || st === "interrupted") tgt.head += 1.5;
      if (st === "thinking") Object.assign(tgt, { ...EMO.thinking });
      if (st === "error") Object.assign(tgt, { ...EMO.concerned });
      (Object.keys(cur) as (keyof Params)[]).forEach((k) => (cur[k] += (tgt[k] - cur[k]) * 0.08));

      // Mouth from real-time output amplitude.
      const speaking = st === "speaking";
      const amp = speaking ? Math.min(1, getOutputLevel() * 7) : 0;
      mouthOpen += (amp - mouthOpen) * (amp > mouthOpen ? 0.55 : 0.3);
      const listenReact = st === "listening" ? Math.min(1, getInputLevel() * 10) : 0;

      // Blink with randomized cadence.
      if (blinkStart < 0 && now > nextBlink) blinkStart = now;
      let lid = 1;
      if (blinkStart >= 0) {
        const p = (now - blinkStart) / 140;
        lid = p < 1 ? Math.abs(1 - p * 2) : 1;
        if (p >= 1) {
          blinkStart = -1;
          nextBlink = now + 1800 + Math.random() * 4200 * (Math.random() < 0.15 ? 0.1 : 1);
        }
      }

      const t = now / 1000;
      const breathe = Math.sin(t * 1.6);
      body.setAttribute("transform", `translate(0 ${breathe * 1.6}) scale(1 ${1 + breathe * 0.004})`);
      const headRot = cur.head + Math.sin(t * 0.7) * 1.2 + (speaking ? Math.sin(t * 5) * mouthOpen * 1.2 : 0) + listenReact * 1.5;
      head.setAttribute("transform", `translate(0 ${breathe * 2 - listenReact * 2}) rotate(${headRot} 200 270)`);

      const ey = Math.max(0.05, cur.eye * lid);
      eyes[0]!.setAttribute("transform", `translate(0 195) scale(1 ${ey}) translate(0 -195)`);
      eyes[1]!.setAttribute("transform", `translate(0 195) scale(1 ${ey}) translate(0 -195)`);
      const b = 160 - cur.brow;
      brows[0]!.setAttribute("d", `M154 ${b + cur.tilt * 0.6} Q170 ${b - 6} 186 ${b - cur.tilt * 0.4}`);
      brows[1]!.setAttribute("d", `M214 ${b - cur.tilt * 0.4} Q230 ${b - 6} 246 ${b + cur.tilt * 0.6}`);

      const s = cur.smile * 5;
      const o = mouthOpen * 13;
      lip.setAttribute("d", `M188 ${250 - s * 0.4} Q200 ${250 + s} 212 ${250 - s * 0.4}`);
      mouth.setAttribute(
        "d",
        `M190 ${250 - s * 0.3} Q200 ${250 + s * 0.6 - 1} 210 ${250 - s * 0.3} Q200 ${252 + o + s} 190 ${250 - s * 0.3}Z`,
      );
      mouth.setAttribute("opacity", String(Math.min(1, mouthOpen * 4)));
      blush.setAttribute("opacity", String(cur.blush));

      sway += ((speaking ? 1 + mouthOpen : 0.45) - sway) * 0.04;
      strands.forEach((el, i) => {
        const [x, y] = el.dataset["strand"]!.split(",").map(Number);
        const a = Math.sin(t * (1.3 + i * 0.17) + i * 1.7) * 2.2 * sway;
        el.setAttribute("transform", `rotate(${a} ${x} ${y})`);
      });

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [getOutputLevel, getInputLevel]);

  return (
    <svg ref={root} viewBox="0 0 400 500" className="airi-avatar" role="img" aria-label="Airi">
      <defs>
        <linearGradient id="hair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--airi-hair-light)" />
          <stop offset="1" stopColor="var(--airi-hair)" />
        </linearGradient>
        <radialGradient id="iris" cx="0.5" cy="0.35" r="0.7">
          <stop offset="0" stopColor="var(--airi-iris-light)" />
          <stop offset="1" stopColor="var(--airi-iris)" />
        </radialGradient>
        <radialGradient id="rim" cx="0.5" cy="0.3" r="0.8">
          <stop offset="0.7" stopColor="var(--airi-glow)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--airi-glow)" stopOpacity="0.25" />
        </radialGradient>
      </defs>

      <g data-part="body">
        {/* back hair */}
        <g data-strand="200,90">
          <path d="M118 165 Q104 70 200 60 Q296 70 282 165 Q296 290 318 410 L82 410 Q104 290 118 165Z" fill="url(#hair)" />
        </g>
        <g transform="translate(0 -28)">
        <path d="M184 290 L216 290 L218 340 L182 340Z" fill="var(--airi-skin-shade)" />
        <path d="M70 500 Q76 365 200 335 Q324 365 330 500Z" fill="var(--airi-cloth)" />
        <path d="M150 348 L200 400 L250 348 Q225 340 200 338 Q175 340 150 348Z" fill="var(--airi-skin)" />
        <path d="M150 348 L200 400 L250 348 L262 356 L200 420 L138 356Z" fill="var(--airi-cloth-trim)" />
        <path d="M193 402 L207 402 L212 430 L200 440 L188 430Z" fill="var(--airi-accent)" />
        <path d="M70 500 Q76 365 200 335 Q324 365 330 500Z" fill="url(#rim)" /><path d="M70 500 L330 500 L330 530 L70 530Z" fill="var(--airi-cloth)" /></g>

        <g data-part="head">
          {/* face */}
          <path d="M140 170 Q140 252 200 288 Q260 252 260 170 Q260 105 200 105 Q140 105 140 170Z" fill="var(--airi-skin)" />
          <g data-part="blush" opacity="0.3">
            <ellipse cx="160" cy="228" rx="14" ry="6" fill="var(--airi-blush)" />
            <ellipse cx="240" cy="228" rx="14" ry="6" fill="var(--airi-blush)" />
          </g>
          {/* eyes */}
          {[170, 230].map((cx, i) => (
            <g key={cx} data-part={i ? "eyeR" : "eyeL"}>
              <ellipse cx={cx} cy="198" rx="17" ry="20" fill="var(--airi-eye-white)" />
              <ellipse cx={cx} cy="200" rx="12.5" ry="17" fill="url(#iris)" />
              <ellipse cx={cx} cy="202" rx="5.5" ry="8" fill="var(--airi-pupil)" />
              <circle cx={cx - 5} cy="192" r="4.5" fill="var(--airi-eye-white)" />
              <circle cx={cx + 5} cy="208" r="2" fill="var(--airi-eye-white)" opacity="0.8" />
              <path
                d={i ? `M${cx - 19} 184 Q${cx} 172 ${cx + 21} 186 L${cx + 18} 181 Q${cx} 168 ${cx - 18} 180Z` : `M${cx + 19} 184 Q${cx} 172 ${cx - 21} 186 L${cx - 18} 181 Q${cx} 168 ${cx + 18} 180Z`}
                fill="var(--airi-line)"
              />
            </g>
          ))}
          <path d="M199 222 L201 226" stroke="var(--airi-skin-shade)" strokeWidth="1.5" strokeLinecap="round" />
          <path data-part="mouth" d="" fill="var(--airi-mouth)" />
          <path data-part="lip" d="" stroke="var(--airi-line)" strokeWidth="2" fill="none" strokeLinecap="round" />

          {/* bangs */}
          <path d="M136 165 Q132 92 200 84 Q268 92 264 165 Q250 120 200 112 Q150 120 136 165Z" fill="url(#hair)" />
          {[
            ["M150 108 Q140 140 146 176 Q158 140 172 112Z", "155,105"],
            ["M168 100 Q166 140 178 172 Q186 132 196 104Z", "180,100"],
            ["M190 98 Q196 136 204 160 Q214 128 216 100Z", "203,98"],
            ["M210 100 Q222 136 226 170 Q236 134 234 106Z", "220,100"],
            ["M230 106 Q250 136 254 176 Q262 140 252 110Z", "242,105"],
          ].map(([d, p]) => (
            <g key={p} data-strand={p}>
              <path d={d} fill="url(#hair)" />
            </g>
          ))}
          {/* side locks */}
          <g data-strand="142,140">
            <path d="M142 130 Q120 240 128 350 Q140 300 156 196 Q152 160 142 130Z" fill="url(#hair)" />
          </g>
          <g data-strand="258,140">
            <path d="M258 130 Q280 240 272 350 Q260 300 244 196 Q248 160 258 130Z" fill="url(#hair)" />
          </g>
          {/* ahoge */}
          <g data-strand="200,70">
            <path d="M198 72 Q190 40 214 30 Q200 46 206 72Z" fill="var(--airi-hair-light)" />
          </g>
          {/* hair clip */}
          <path d="M238 120 l14 -6 l2 6 l-14 6Z" fill="var(--airi-accent)" />
          <path data-part="browL" d="" stroke="var(--airi-hair)" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.85" />
          <path data-part="browR" d="" stroke="var(--airi-hair)" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.85" />
        </g>
      </g>
    </svg>
  );
}
