import type { Obstacle, Peg, Teeth } from '../puzzles/types.ts'

/** 歯先は ピッチ円 + モジュール（= 1）。 */
export const ADDENDUM = 1
/** 軸の太さ。歯車はほかの歯車が付いた軸にかぶせられない。 */
export const SHAFT = 1

export const pitchRadius = (t: Teeth): number => t / 2
export const outerRadius = (t: Teeth): number => t / 2 + ADDENDUM

export const sqDist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2

export type Relation = 'mesh' | 'collide' | 'free'

/**
 * 同じ段の2枚の歯車の関係。軸の距離がピッチ円の半径の和ちょうどなら噛み合う。
 * それより少しでもずれて歯先の円が重なれば、歯どうしがぶつかる（離れすぎ・近すぎの中間はない）。
 */
export function relation(a: Peg, ta: Teeth, b: Peg, tb: Teeth): Relation {
  const d2 = sqDist(a, b)
  const pitch = pitchRadius(ta) + pitchRadius(tb)
  if (d2 === pitch * pitch) return 'mesh'
  const outer = outerRadius(ta) + outerRadius(tb)
  return d2 < outer * outer ? 'collide' : 'free'
}

/** 歯車が別の軸（ほかの歯車が付いている軸）にかぶさるか。 */
export function coversShaft(a: Peg, ta: Teeth, b: Peg): boolean {
  const r = outerRadius(ta) + SHAFT
  return sqDist(a, b) < r * r
}

export function hitsObstacle(a: Peg, ta: Teeth, o: Obstacle): boolean {
  const r = outerRadius(ta) + o.r
  return sqDist(a, o) < r * r
}

export function insideBoard(a: Peg, ta: Teeth, width: number, height: number): boolean {
  const r = outerRadius(ta)
  return a.x - r >= 0 && a.y - r >= 0 && a.x + r <= width && a.y + r <= height
}
