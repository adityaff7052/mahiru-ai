export function mouthAmplitude(previous: number, output: number, speaking: boolean, dt: number) {
  if (!speaking) return 0;
  const target = Math.min(1, Math.max(0, output) * 7);
  return previous + (target - previous) * (1 - Math.exp(-Math.min(dt, 50) / (target > previous ? 28 : 65)));
}
