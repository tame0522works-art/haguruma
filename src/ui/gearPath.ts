import { ADDENDUM, pitchRadius } from '../engine/geom.ts'
import type { Teeth } from '../puzzles/types.ts'

const cache = new Map<number, string>()

/**
 * 歯車の輪郭（中心が原点、角度 0 の方向に歯の中心）。歯は台形で近似する。
 * 歯先の円は ピッチ円 + 1、歯底は ピッチ円 − 1.25（モジュール 1 の標準の歯たけ）。真ん中に軸の穴。
 */
export function gearPath(teeth: Teeth): string {
  const hit = cache.get(teeth)
  if (hit) return hit
  const r = pitchRadius(teeth)
  const outer = r + ADDENDUM
  const root = r - 1.25
  const step = (2 * Math.PI) / teeth
  const pt = (radius: number, a: number) => `${(radius * Math.cos(a)).toFixed(3)} ${(radius * Math.sin(a)).toFixed(3)}`
  const parts: string[] = []
  for (let k = 0; k < teeth; k++) {
    const a = k * step
    parts.push(
      `${k === 0 ? 'M' : 'L'}${pt(root, a - 0.5 * step)}`,
      `L${pt(root, a - 0.3 * step)}`,
      `L${pt(outer, a - 0.12 * step)}`,
      `L${pt(outer, a + 0.12 * step)}`,
      `L${pt(root, a + 0.3 * step)}`,
    )
  }
  const hole = 1.1
  const d = `${parts.join('')}Z M${hole} 0 A${hole} ${hole} 0 1 0 ${-hole} 0 A${hole} ${hole} 0 1 0 ${hole} 0Z`
  cache.set(teeth, d)
  return d
}
