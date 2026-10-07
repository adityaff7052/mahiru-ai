import { useEffect, useRef } from 'react';
import portrait from '@/assets/mahiru-portrait.png';
import base from '@/assets/mahiru-base.png';
import { EXPRESSIONS, type MahiruEmotion, type Expression } from '@/lib/avatar-expression';
import { mouthAmplitude } from '@/lib/avatar-motion';
import type { MahiruState } from '@/hooks/use-mahiru-live';
interface Props { state: MahiruState; emotion: MahiruEmotion; getOutputLevel: () => number; getInputLevel: () => number }
/** High-resolution textured 2D puppet. Original raster eye layers + procedural face overlays.
 * Canvas writes avoid React updates per frame; media transport is deliberately independent. */
export function MahiruAvatar(props: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef(props); live.current = props;
  useEffect(() => {
    const el = canvas.current; const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const art = new Image(), clean = new Image(); art.src = portrait; clean.src = base;
    const colors = getComputedStyle(el);
    const color = (name: string) => colors.getPropertyValue(`--mahiru-${name}`).trim();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, disposed = false, last = performance.now(), blink = -1, nextBlink = last + 1600;
    let gazeX = 0, gazeY = 0, targetX = 0, targetY = 0, nextGaze = last + 1300, mouth = 0;
    const current: Expression = { ...EXPRESSIONS.neutral };
    const eye = (x: number, y: number, w: number, h: number, openness: number) => {
      ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(1, Math.max(.025, openness));
      ctx.beginPath(); ctx.ellipse(0, 0, w / 2 + 2, h / 2, -.08, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(art, x, y, w, h, -w / 2 + gazeX, -h / 2 + gazeY, w, h); ctx.restore();
      if (openness < .2) {
        ctx.strokeStyle = color('line'); ctx.lineWidth = 2.2; ctx.beginPath();
        ctx.moveTo(x + 5, y + h / 2); ctx.quadraticCurveTo(x + w / 2, y + h / 2 + 8, x + w - 5, y + h / 2 - 3); ctx.stroke();
      }
    };
    const frame = (now: number) => {
      if (disposed) return;
      const dt = Math.min(50, now - last); last = now;
      if (art.complete && art.naturalWidth && clean.complete && clean.naturalWidth) {
        const { state, emotion, getOutputLevel, getInputLevel } = live.current;
        const target = EXPRESSIONS[state === 'error' ? 'concerned' : state === 'thinking' ? 'thinking' : state === 'interrupted' ? 'neutral' : emotion];
        for (const key of Object.keys(current) as (keyof Expression)[]) current[key] += (target[key] - current[key]) * (1 - Math.exp(-dt / 220));
        mouth = mouthAmplitude(mouth, getOutputLevel(), state === 'speaking', dt);
        if (now > nextBlink && blink < 0) blink = now;
        let lid = 1;
        if (blink >= 0) { const p = (now - blink) / 165; lid = p < 1 ? Math.abs(1 - 2 * p) : 1; if (p >= 1) { blink = -1; nextBlink = now + 1900 + Math.random() * 4400; } }
        if (now > nextGaze) { targetX = (Math.random() - .5) * 4; targetY = (Math.random() - .5) * 2; nextGaze = now + 1300 + Math.random() * 3000; }
        gazeX += (targetX - gazeX) * .18; gazeY += (targetY - gazeY) * .18;
        const t = reduced ? 0 : now / 1000;
        const listening = state === 'listening' ? Math.min(1, getInputLevel() * 8) : 0;
        ctx.clearRect(0, 0, 1024, 1536); ctx.save();
        ctx.translate(512, 730 + Math.sin(t * 1.5) * 3 - listening * 3);
        ctx.rotate((current.head * .18 + Math.sin(t * .65) * .25) * Math.PI / 180);
        ctx.scale(1, 1 + Math.sin(t * 1.5) * .0015); ctx.translate(-512, -730);
        ctx.drawImage(clean, 0, 0, 1024, 1536);
        // Independently move outer hair layers, leaving the face and hoodie centered.
        for (const side of [0, 1]) {
          ctx.save(); ctx.beginPath();
          if (side === 0) { ctx.moveTo(120,280); ctx.lineTo(345,290); ctx.lineTo(295,900); ctx.lineTo(230,1300); ctx.lineTo(30,930); }
          else { ctx.moveTo(725,250); ctx.lineTo(850,350); ctx.lineTo(1000,970); ctx.lineTo(760,900); }
          ctx.closePath(); ctx.clip();
          const shift = Math.sin(t * (1.1 + side * .2) + side * 2) * (state === 'speaking' ? 3 : 1.5);
          ctx.drawImage(clean, shift, 0, 1024, 1536); ctx.restore();
        }
        eye(344,351,114,69,current.eye * lid); eye(550,327,114,72,current.eye * lid);
        // Brow accents, cheeks and tear layers combine with raster eye articulation.
        ctx.strokeStyle = color('hair'); ctx.lineWidth = 2.5; ctx.globalAlpha = .5;
        for (const [x,y] of [[367,327],[555,303]]) { ctx.beginPath(); ctx.moveTo(x,y-current.brow); ctx.quadraticCurveTo(x+35,y-10-current.brow-current.tilt,x+75,y-4-current.brow); ctx.stroke(); }
        ctx.globalAlpha = 1;
        for (const [x,y] of [[374,438],[612,425]]) {
          const blush = ctx.createRadialGradient(x,y,0,x,y,45); blush.addColorStop(0,color('blush')); blush.addColorStop(1,'transparent');
          ctx.globalAlpha = current.blush * .32; ctx.fillStyle = blush; ctx.fillRect(x-45,y-45,90,90);
          ctx.globalAlpha = current.tears * .75; ctx.fillStyle = color('tear');
          ctx.beginPath(); ctx.ellipse(x+5,y+18,4,22 + Math.sin(t*2)*3,0,0,Math.PI*2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        const smile = current.smile * 8, open = mouth * 24;
        ctx.strokeStyle = color('line'); ctx.lineWidth = 2; ctx.lineCap = 'round';
        if (open > .3) {
          ctx.fillStyle = color('mouth'); ctx.beginPath(); ctx.moveTo(475,510-smile*.2); ctx.quadraticCurveTo(510,516+smile,545,506-smile*.2); ctx.quadraticCurveTo(515,514+open+smile,475,510-smile*.2); ctx.fill();
          if (mouth > .35) { ctx.fillStyle = color('eye-white'); ctx.beginPath(); ctx.ellipse(510,512,18,2.5,0,0,Math.PI); ctx.fill(); }
        } else { ctx.beginPath(); ctx.moveTo(475,511-smile*.2); ctx.quadraticCurveTo(510,513+smile,545,507-smile*.2); ctx.stroke(); }
        ctx.restore(); el.dataset.mouthOpen = String(mouth); el.dataset.emotion = emotion;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { disposed = true; cancelAnimationFrame(raf); };
  }, []);
  return <canvas ref={canvas} width={1024} height={1536} className="mahiru-avatar" role="img" aria-label="Mahiru" />;
}
