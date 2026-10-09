import { useEffect, useRef } from 'react';
import portrait from '@/assets/mahiru-portrait.png';
import speakingArt from '@/assets/mahiru-speaking.png';
import roundedArt from '@/assets/mahiru-rounded.png';
import blinkArt from '@/assets/mahiru-blink.png';
import tearyArt from '@/assets/mahiru-teary.png';
import { EXPRESSIONS, type MahiruEmotion, type Expression } from '@/lib/avatar-expression';
import { mouthAmplitude } from '@/lib/avatar-motion';
import type { MahiruState } from '@/hooks/use-mahiru-live';
interface Props { state: MahiruState; emotion: MahiruEmotion; getOutputLevel: () => number; getInputLevel: () => number }

/** Shoulders-up crop of the 1024×1536 artwork. */
const CROP_Y = 90, W = 1024, H = 1040;
type Region = { x: number; y: number; rx: number; ry: number };
const EYES: Region = { x: 505, y: 380, rx: 200, ry: 72 };
const MOUTH: Region = { x: 505, y: 515, rx: 80, ry: 48 };
const FACE: Region = { x: 505, y: 440, rx: 210, ry: 175 };

/** Pre-mask an articulation layer to a feathered region so it blends into the base art. */
function masked(img: HTMLImageElement, r: Region) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1536;
  const g = c.getContext('2d'); if (!g) return c;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  g.save(); g.translate(r.x, r.y); g.scale(1, r.ry / r.rx);
  const grad = g.createRadialGradient(0, 0, r.rx * .55, 0, 0, r.rx);
  grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(-r.rx, -r.rx, r.rx * 2, r.rx * 2); g.restore();
  return c;
}

/** Layered raster puppet: base art + feathered blink, mouth and tear layers derived from the same illustration. */
export function MahiruAvatar(props: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef(props); live.current = props;
  useEffect(() => {
    const el = canvas.current; const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const load = (src: string) => new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });
    let layers: { base: HTMLImageElement; blink: HTMLCanvasElement; speak: HTMLCanvasElement; round: HTMLCanvasElement; teary: HTMLCanvasElement } | null = null;
    const blushColor = getComputedStyle(el).getPropertyValue('--mahiru-blush').trim();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, disposed = false, last = performance.now(), blink = -1, nextBlink = last + 1600, mouth = 0, interruptedAt = -1;
    let gazeX = 0, gazeY = 0, targetX = 0, targetY = 0, nextGaze = last + 1300;
    const current: Expression = { ...EXPRESSIONS.neutral };
    void Promise.all([portrait, blinkArt, speakingArt, roundedArt, tearyArt].map(load)).then(([b, bl, sp, ro, te]) => {
      if (disposed || !b || !bl || !sp || !ro || !te) return;
      layers = { base: b, blink: masked(bl, EYES), speak: masked(sp, MOUTH), round: masked(ro, MOUTH), teary: masked(te, FACE) };
    }).catch(() => console.warn('[mahiru] Avatar artwork failed to load'));

    const frame = (now: number) => {
      if (disposed) return;
      const dt = Math.min(50, now - last); last = now;
      if (layers) {
        const { state, emotion, getOutputLevel, getInputLevel } = live.current;
        const key = state === 'error' ? 'concerned' : state === 'thinking' ? 'thinking' : state === 'interrupted' ? 'neutral' : emotion;
        const target = EXPRESSIONS[key];
        const ease = 1 - Math.exp(-dt / 320);
        for (const k of Object.keys(current) as (keyof Expression)[]) current[k] += (target[k] - current[k]) * ease;
        // Barge-in: mouth closes on the same frame.
        if (state === 'interrupted') { mouth = 0; interruptedAt = now; }
        else mouth = mouthAmplitude(mouth, getOutputLevel(), state === 'speaking', dt);
        if (now > nextBlink && blink < 0) blink = now;
        let lid = 0;
        if (blink >= 0) { const p = (now - blink) / 170; lid = p < 1 ? Math.sin(p * Math.PI) : 0; if (p >= 1) { blink = -1; nextBlink = now + (Math.random() < .15 ? 250 : 2000 + Math.random() * 4200); } }
        if (now > nextGaze) { targetX = (Math.random() - .5) * 3; targetY = (Math.random() - .5) * 1.5; nextGaze = now + 1200 + Math.random() * 3200; }
        gazeX += (targetX - gazeX) * .12; gazeY += (targetY - gazeY) * .12;
        const t = reduced ? 0 : now / 1000;
        const listening = state === 'listening' ? Math.min(1, getInputLevel() * 8) : 0;
        const breath = Math.sin(t * 1.4);
        ctx.clearRect(0, 0, W, H); ctx.save();
        ctx.translate(0, -CROP_Y);
        // Gentle head/shoulder motion anchored at the shoulders so she doesn't float.
        ctx.translate(512, 1100);
        ctx.rotate((current.head * .15 + Math.sin(t * .6) * .2) * Math.PI / 180);
        ctx.scale(1 + breath * .002, 1 + breath * .003);
        ctx.translate(-512 + gazeX * .6, -1100 + gazeY * .4 - listening * 2);
        ctx.drawImage(layers.base, 0, 0);
        // Closed-eye artwork: blinking plus sleepy/laughing/happy narrowing.
        const closed = Math.min(1, Math.max(lid, 1 - current.eye));
        if (closed > .01) { ctx.globalAlpha = closed; ctx.drawImage(layers.blink, 0, 0); }
        if (current.tears > .01) { ctx.globalAlpha = Math.min(1, current.tears); ctx.drawImage(layers.teary, 0, 0); }
        // Mouth: rounded vowel shape for small amplitude, open smile for louder/cheerful speech.
        const open = Math.min(1, mouth * 1.4);
        if (open > .02) {
          const wide = Math.min(1, Math.max(0, (open - .35) / .5 + current.smile * .3));
          ctx.globalAlpha = open * (1 - wide); ctx.drawImage(layers.round, 0, 0);
          ctx.globalAlpha = open * wide; ctx.drawImage(layers.speak, 0, 0);
        }
        ctx.globalAlpha = 1;
        if (current.blush > .01) for (const [x, y] of [[395, 455], [615, 445]] as const) {
          const g = ctx.createRadialGradient(x, y, 0, x, y, 50); g.addColorStop(0, blushColor); g.addColorStop(1, 'transparent');
          ctx.globalAlpha = current.blush * .28; ctx.fillStyle = g; ctx.fillRect(x - 50, y - 50, 100, 100);
        }
        ctx.restore(); ctx.globalAlpha = 1;
        el.dataset["mouthOpen"] = String(mouth); el.dataset["emotion"] = emotion;
        el.dataset["interruptedAt"] = String(interruptedAt);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { disposed = true; cancelAnimationFrame(raf); };
  }, []);
  return <canvas ref={canvas} width={W} height={H} className="mahiru-avatar" role="img" aria-label="Mahiru" />;
}
