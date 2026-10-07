/**
 * Original anime-style upper-body companion drawn in SVG so every feature
 * (mouth, eyelids, brows, hair strands) can be animated per-frame from audio.
 * Animation runs in a rAF loop writing attributes directly (no React re-renders).
 */
import { useEffect, useRef } from "react";
import type { MahiruEmotion } from "@/lib/mahiru-config";
import type { MahiruState } from "@/hooks/use-mahiru-live";

import { EXPRESSIONS as EMO, type Expression as Params } from "@/lib/avatar-expression";

interface Props {
  state: MahiruState;
  emotion: MahiruEmotion;
  getOutputLevel: () => number;
  getInputLevel: () => number;
}

export function MahiruAvatar({ state, emotion, getOutputLevel, getInputLevel }: Props) {
  const root = useRef<SVGSVGElement>(null);
  const live = useRef({ state, emotion });
  live.current = { state, emotion };

  useEffect(() => {
    const svg = root.current;
    if (!svg) return;
    const q = <T extends Element>(id: string) => svg.querySelector<T>(`[data-part="${id}"]`);
    const head = q<SVGGElement>("head");
    const body = q<SVGGElement>("body");
    const eyes = [q<SVGGElement>("eyeL"), q<SVGGElement>("eyeR")];
    const brows = [q<SVGPathElement>("browL"), q<SVGPathElement>("browR")];
    const lip = q<SVGPathElement>("lip");
    const mouth = q<SVGPathElement>("mouth");
    const blush = q<SVGGElement>("blush");
    const tears = q<SVGGElement>("tears");
    if (!head || !body || !eyes[0] || !eyes[1] || !brows[0] || !brows[1] || !lip || !mouth || !blush) return;
    const gaze = Array.from(svg.querySelectorAll<SVGGElement>("[data-gaze]"));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const strands = Array.from(svg.querySelectorAll<SVGGElement>("[data-strand]"));

    const cur: Params = { ...EMO.neutral };
    let mouthOpen = 0;
    let sway = 0.4;
    let nextBlink = performance.now() + 2000;
    let blinkStart = -1;
    let raf = 0;
    let previousTime = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(50, now - previousTime);
      previousTime = now;
      const smooth = 1 - Math.exp(-dt / 180);
      const { state: st, emotion: em } = live.current;
      const tgt = { ...EMO[em] };
      if (st === "listening" || st === "interrupted") tgt.head += 1.5;
      if (st === "thinking") Object.assign(tgt, { ...EMO.thinking });
      if (st === "error") Object.assign(tgt, { ...EMO.concerned });
      (Object.keys(cur) as (keyof Params)[]).forEach((k) => (cur[k] += (tgt[k] - cur[k]) * smooth));

      // Mouth from real-time output amplitude.
      const speaking = st === "speaking";
      const amp = speaking ? Math.min(1, getOutputLevel() * 7) : 0;
      if (!speaking) mouthOpen = 0;
      else mouthOpen += (amp - mouthOpen) * (amp > mouthOpen ? 0.55 : 0.3);
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

      const t = reducedMotion ? 0 : now / 1000;
      gaze.forEach((eye) => eye.setAttribute("transform", `translate(${Math.sin(t * .45) * 1.3} ${Math.cos(t * .3) * .6})`));
      const breathe = Math.sin(t * 1.6);
      body.setAttribute("transform", `translate(0 ${breathe * 1.6}) scale(1 ${1 + breathe * 0.004})`);
      const headRot = cur.head + Math.sin(t * 0.7) * 1.2 + (speaking ? Math.sin(t * 5) * mouthOpen * 1.2 : 0) + listenReact * 1.5;
      head.setAttribute("transform", `translate(0 ${breathe * 2 - listenReact * 2}) rotate(${headRot} 200 270)`);

      const ey = Math.max(0.05, cur.eye * lid);
      eyes[0]?.setAttribute("transform", `translate(0 195) scale(1 ${ey}) translate(0 -195)`);
      eyes[1]?.setAttribute("transform", `translate(0 195) scale(1 ${ey}) translate(0 -195)`);
      const b = 160 - cur.brow;
      brows[0]?.setAttribute("d", `M154 ${b + cur.tilt * 0.6} Q170 ${b - 6} 186 ${b - cur.tilt * 0.4}`);
      brows[1]?.setAttribute("d", `M214 ${b - cur.tilt * 0.4} Q230 ${b - 6} 246 ${b + cur.tilt * 0.6}`);

      const s = cur.smile * 5;
      const o = mouthOpen * 15;
      lip.setAttribute("d", `M188 ${250 - s * 0.4} Q200 ${250 + s} 212 ${250 - s * 0.4}`);
      mouth.setAttribute(
        "d",
        `M190 ${250 - s * 0.3} Q200 ${250 + s * 0.6 - 1} 210 ${250 - s * 0.3} Q200 ${252 + o + s} 190 ${250 - s * 0.3}Z`,
      );
      mouth.setAttribute("opacity", String(Math.min(1, mouthOpen * 4)));
      blush.setAttribute("opacity", String(cur.blush));
      tears?.setAttribute("opacity", String(cur.tears));

      sway += ((speaking ? 1 + mouthOpen : 0.45) - sway) * 0.04;
      strands.forEach((el, i) => {
        const [x, y] = (el.dataset["strand"] ?? "200,90").split(",").map(Number);
        const a = Math.sin(t * (1.3 + i * 0.17) + i * 1.7) * 2.2 * sway;
        el.setAttribute("transform", `rotate(${a} ${x} ${y})`);
      });

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return (
    <svg ref={root} viewBox="35 0 330 475" className="mahiru-avatar" role="img" aria-label="Mahiru">
      <defs>
        <linearGradient id="hair" x1="0" y1="0" x2=".85" y2="1">
          <stop stopColor="var(--mahiru-hair-light)" /><stop offset=".35" stopColor="var(--mahiru-hair)" /><stop offset="1" stopColor="var(--mahiru-hair-deep)" />
        </linearGradient>
        <linearGradient id="hair-sheen" x1="0" y1="0" x2="1" y2=".3">
          <stop stopColor="var(--mahiru-hair)" /><stop offset=".5" stopColor="var(--mahiru-hair-light)" /><stop offset="1" stopColor="var(--mahiru-hair)" />
        </linearGradient>
        <linearGradient id="hoodie" x1="0" y1="0" x2=".8" y2="1">
          <stop stopColor="var(--mahiru-cloth-trim)" /><stop offset=".45" stopColor="var(--mahiru-cloth)" /><stop offset="1" stopColor="var(--mahiru-cloth-shade)" />
        </linearGradient>
        <radialGradient id="skin" cx=".5" cy=".4" r=".65">
          <stop stopColor="var(--mahiru-skin)" /><stop offset="1" stopColor="var(--mahiru-skin-shade)" />
        </radialGradient>
        <linearGradient id="iris" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="var(--mahiru-pupil)" /><stop offset=".45" stopColor="var(--mahiru-iris)" /><stop offset="1" stopColor="var(--mahiru-iris-light)" />
        </linearGradient>
        <radialGradient id="cheek">
          <stop stopColor="var(--mahiru-blush)" stopOpacity=".65" /><stop offset="1" stopColor="var(--mahiru-blush)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g data-part="body">
        <g data-strand="200,90">
          <path d="M118 173 Q91 100 124 58 Q155 15 204 24 Q268 16 288 84 Q302 147 284 214 Q307 326 283 403 Q297 442 325 468 Q283 477 265 444 Q242 481 202 460 Q161 482 136 444 Q115 476 77 468 Q111 426 111 387 Q89 283 118 173Z" fill="url(#hair)" stroke="var(--mahiru-hair-light)" strokeWidth="1" />
          <path d="M125 178 Q106 272 134 374 Q144 420 124 455 M279 167 Q301 284 269 379 Q257 425 277 455" fill="none" stroke="var(--mahiru-hair-light)" opacity=".3" strokeWidth="2" />
        </g>
        <path d="M178 269 L222 269 L226 310 Q200 334 174 310Z" fill="var(--mahiru-skin-shade)" />
        <path d="M133 313 Q146 288 175 296 L200 318 L225 296 Q254 288 267 313 L288 360 L112 360Z" fill="var(--mahiru-cloth-shade)" stroke="var(--mahiru-cloth-trim)" />
        <path d="M39 475 Q44 379 99 342 Q127 317 154 318 L200 339 L246 318 Q273 317 301 342 Q356 379 361 475Z" fill="url(#hoodie)" stroke="var(--mahiru-cloth-trim)" strokeWidth="1.5" />
        <path d="M137 307 Q120 331 164 356 L198 340 Q173 321 173 302 M263 307 Q280 331 236 356 L202 340 Q227 321 227 302" fill="var(--mahiru-cloth-trim)" stroke="var(--mahiru-cloth-shade)" strokeWidth="2" />
        <path d="M172 306 Q200 331 228 306" fill="none" stroke="var(--mahiru-jewelry)" strokeWidth="1.2" />
        <path d="M197 321 L203 321 L202 329 L198 329Z" fill="var(--mahiru-jewelry)" />
        <path d="M182 348 Q176 386 180 416 M218 348 Q224 386 220 416" fill="none" stroke="var(--mahiru-cord)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M178 409 L182 409 L182 419 L178 419Z M218 409 L222 409 L222 419 L218 419Z" fill="var(--mahiru-jewelry)" />
        <path d="M88 381 Q108 414 101 475 M312 381 Q292 414 299 475 M144 455 Q200 440 256 455 L263 475 M143 456 L137 475 M65 437 L81 444 M319 444 L335 437" fill="none" stroke="var(--mahiru-cloth-trim)" strokeWidth="2" opacity=".65" />
        <g data-part="head">
          <ellipse cx="141" cy="208" rx="9" ry="17" fill="var(--mahiru-skin-shade)" />
          <ellipse cx="259" cy="208" rx="9" ry="17" fill="var(--mahiru-skin-shade)" />
          <path d="M138 155 Q137 211 151 241 Q167 268 200 283 Q233 268 249 241 Q263 211 262 155 Q259 101 200 98 Q141 101 138 155Z" fill="url(#skin)" stroke="var(--mahiru-skin-shade)" strokeWidth=".8" />
          <g data-part="blush">
            <ellipse cx="157" cy="230" rx="23" ry="13" fill="url(#cheek)" /><ellipse cx="243" cy="230" rx="23" ry="13" fill="url(#cheek)" />
            <path d="M150 227 l-1 5 M155 227 l-1 5 M160 227 l-1 5 M240 227 l-1 5 M245 227 l-1 5 M250 227 l-1 5" stroke="var(--mahiru-blush)" strokeWidth=".8" />
          </g>
          {[170, 230].map((cx, i) => (
            <g key={cx} data-part={i ? "eyeR" : "eyeL"}>
              <path d={`M${cx - 21} 190 Q${cx} 175 ${cx + 21} 190 Q${cx + 15} 217 ${cx} 216 Q${cx - 16} 217 ${cx - 21} 190Z`} fill="var(--mahiru-eye-white)" />
              <g data-gaze>
                <ellipse cx={cx} cy="198" rx="12.8" ry="17.5" fill="url(#iris)" />
                <ellipse cx={cx} cy="196" rx="5" ry="10" fill="var(--mahiru-pupil)" />
                <path d={`M${cx - 9} 207 Q${cx} 217 ${cx + 9} 207`} fill="none" stroke="var(--mahiru-iris-light)" strokeWidth="2" />
                <ellipse cx={cx - 4} cy="188" rx="3.7" ry="5" fill="var(--mahiru-eye-white)" />
                <circle cx={cx + 6} cy="202" r="2.2" fill="var(--mahiru-eye-white)" />
                <circle cx={cx - 4} cy="210" r="1" fill="var(--mahiru-eye-white)" />
              </g>
              <path d={`M${cx - 22} 190 Q${cx} 172 ${cx + 22} 190 Q${cx} 180 ${cx - 22} 193Z`} fill="var(--mahiru-line)" />
              <path d={i ? "M250 189 l6 -6 M249 187 l3 -6" : "M150 189 l-6 -6 M151 187 l-3 -6"} stroke="var(--mahiru-line)" strokeWidth="2" strokeLinecap="round" />
              <path d={`M${cx - 16} 211 Q${cx} 220 ${cx + 16} 211`} fill="none" stroke="var(--mahiru-skin-shade)" strokeWidth="1" />
            </g>
          ))}
          <g data-part="tears" opacity="0">
            <path d="M153 213 Q148 238 153 244 Q159 238 153 213 M247 213 Q242 238 247 244 Q253 238 247 213" fill="var(--mahiru-tear)" opacity=".7" />
            <path d="M149 214 Q170 221 188 213 M212 213 Q230 221 251 214" fill="none" stroke="var(--mahiru-tear)" strokeWidth="2" />
          </g>
          <path d="M201 219 Q198 225 202 227" fill="none" stroke="var(--mahiru-skin-shade)" strokeWidth="1.2" strokeLinecap="round" />
          <path data-part="mouth" d="" fill="var(--mahiru-mouth)" />
          <path data-part="lip" d="" stroke="var(--mahiru-line)" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <path d="M194 263 Q200 265 206 263" fill="none" stroke="var(--mahiru-skin-shade)" strokeWidth=".8" opacity=".5" />
          <path data-part="browL" d="" stroke="var(--mahiru-hair)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path data-part="browR" d="" stroke="var(--mahiru-hair)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M128 167 Q107 89 147 53 Q196 20 248 49 Q287 76 271 168 Q249 115 204 105 Q155 106 128 167Z" fill="url(#hair)" />
          {[
            ["M158 75 Q136 107 139 179 Q157 156 169 130 Q180 110 196 84 Q175 113 158 139 Q155 107 177 76Z", "163,75"],
            ["M190 65 Q176 115 167 159 Q198 135 209 87 Q219 130 237 160 Q240 102 217 63Z", "202,65"],
            ["M224 73 Q243 97 241 137 Q259 157 261 182 Q274 121 247 80Z", "239,75"],
          ].map(([d, anchor]) => <g key={anchor} data-strand={anchor}><path d={d} fill="url(#hair-sheen)" /></g>)}
          <g data-strand="139,110">
            <path d="M139 108 Q103 159 110 243 Q95 315 122 389 Q129 427 107 459 Q143 442 145 397 Q137 337 145 299 Q128 236 148 181Z" fill="url(#hair)" stroke="var(--mahiru-hair-light)" strokeWidth=".7" />
            <path d="M132 158 Q117 213 131 266 Q116 335 135 391" fill="none" stroke="var(--mahiru-hair-light)" strokeWidth="1.2" opacity=".55" />
          </g>
          <g data-strand="261,110">
            <path d="M261 108 Q297 159 290 243 Q305 315 278 389 Q271 427 293 459 Q257 442 255 397 Q263 337 255 299 Q272 236 252 181Z" fill="url(#hair)" stroke="var(--mahiru-hair-light)" strokeWidth=".7" />
            <path d="M268 158 Q283 213 269 266 Q284 335 265 391" fill="none" stroke="var(--mahiru-hair-light)" strokeWidth="1.2" opacity=".55" />
          </g>
          <path d="M139 93 Q151 52 185 49 M221 47 Q258 56 267 94" fill="none" stroke="var(--mahiru-hair-light)" strokeWidth="1.5" opacity=".5" />
          <path d="M199 30 Q184 16 174 24 Q190 17 203 32" fill="none" stroke="var(--mahiru-hair-light)" strokeWidth="2" />
        </g>
      </g>
    </svg>
  );
}
