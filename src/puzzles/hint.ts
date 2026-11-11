import { relation } from '../engine/geom.ts'
import { solve } from '../engine/solve.ts'
import { evaluate, keyOf } from '../engine/train.ts'
import type { Layer, Placement, Puzzle, Teeth } from './types.ts'

export interface Hint {
  peg: string
  layer: Layer
  /** 置く（替える）歯数。null は外す。 */
  teeth: Teeth | null
  /** いま付いている歯車を替える・外す手か。 */
  fix: boolean
}

const cache = new WeakMap<Puzzle, Placement[][]>()

/** 最少枚数の解（★3 の答え）をすべて。画面ではヒントを押したときに初めて探す。 */
export function bestSolutions(puzzle: Puzzle): Placement[][] {
  let s = cache.get(puzzle)
  if (!s) {
    s = solve(puzzle, { maxGears: puzzle.best, limit: 50 }).solutions
    cache.set(puzzle, s)
  }
  return s
}

const id = (g: Placement) => `${keyOf(g)}=${g.teeth}`

/**
 * 次の1手。いまの盤面といちばん多く重なる最少解を目当てにし、
 * 目当てにない歯車があれば先に替える・外す（最少の枚数にするには、どのみち要らない）。
 * なければ、目当ての歯車のうち、いま回っている歯車と噛み合うか同じ軸に付くものから置く（置いたらすぐ回るのが見える）。
 * もう解けていれば null。
 */
export function nextHint(puzzle: Puzzle, placed: readonly Placement[]): Hint | null {
  const solutions = bestSolutions(puzzle)
  if (!solutions.length) return null
  const have = new Set(placed.map(id))
  const target = solutions.reduce((a, b) => (b.filter((g) => have.has(id(g))).length > a.filter((g) => have.has(id(g))).length ? b : a))
  const want = new Map(target.map((g) => [keyOf(g), g]))
  const wantIds = new Set(target.map(id))

  const wrong = placed.find((g) => !wantIds.has(id(g)))
  if (wrong) {
    const instead = want.get(keyOf(wrong))
    return { peg: wrong.peg, layer: wrong.layer, teeth: instead?.teeth ?? null, fix: true }
  }

  const missing = target.filter((g) => !have.has(id(g)))
  if (!missing.length) return null
  const ev = evaluate(puzzle, placed)
  const pegs = new Map(puzzle.pegs.map((p) => [p.id, p]))
  const turning = [...puzzle.given, ...placed].filter((g) => ev.omega.has(g.peg))
  const next =
    missing.find(
      (g) =>
        ev.omega.has(g.peg) ||
        turning.some((t) => t.layer === g.layer && t.peg !== g.peg && relation(pegs.get(t.peg)!, t.teeth, pegs.get(g.peg)!, g.teeth) === 'mesh'),
    ) ?? missing[0]
  return { peg: next.peg, layer: next.layer, teeth: next.teeth, fix: false }
}
