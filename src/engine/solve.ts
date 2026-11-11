import type { Layer, Placement, Puzzle } from '../puzzles/types.ts'
import { relation } from './geom.ts'
import { evaluate, keyOf } from './train.ts'

export interface SolveResult {
  /** 解ける最少の枚数。maxGears までに解がなければ null。 */
  min: number | null
  /** 最少枚数の解（置き方の集合として重複なし）。limit で打ち切る。 */
  solutions: Placement[][]
  /** 調べた盤面の数（問題づくりの目安）。 */
  nodes: number
}

const stateKey = (placed: readonly Placement[]) =>
  placed
    .map((p) => `${keyOf(p)}=${p.teeth}`)
    .sort()
    .join('|')

/**
 * 最少枚数の解を探す。入力軸につながらない歯車は回転に関係しないので、最少の解は
 * 「入力側から1枚ずつ、回っている歯車と噛み合うか同じ軸に付ける」順で必ず作れる。
 * ぶつかり・固まりは歯車を足しても消えないので、問題が出た時点で枝を切る。
 */
export function solve(puzzle: Puzzle, opts: { maxGears?: number; limit?: number } = {}): SolveResult {
  const maxGears = opts.maxGears ?? 8
  const limit = opts.limit ?? 50
  const pegs = new Map(puzzle.pegs.map((p) => [p.id, p]))
  let nodes = 0

  const candidates = (placed: readonly Placement[]): Placement[] => {
    const ev = evaluate(puzzle, placed)
    const all = [...puzzle.given, ...placed]
    const taken = new Set(all.map(keyOf))
    const out = new Map<string, Placement>()
    const add = (p: Placement) => {
      if (!taken.has(keyOf(p))) out.set(`${keyOf(p)}=${p.teeth}`, p)
    }
    for (const g of all) {
      if (!ev.omega.has(g.peg)) continue
      for (let layer = 0; layer < puzzle.layers; layer++) {
        if (layer !== g.layer) for (const teeth of puzzle.teeth) add({ peg: g.peg, layer: layer as Layer, teeth })
      }
      const at = pegs.get(g.peg)!
      for (const peg of puzzle.pegs) {
        if (peg.id === g.peg) continue
        for (const teeth of puzzle.teeth) {
          if (relation(at, g.teeth, peg, teeth) === 'mesh') add({ peg: peg.id, layer: g.layer, teeth })
        }
      }
    }
    return [...out.values()]
  }

  for (let depth = 0; depth <= maxGears; depth++) {
    const found = new Map<string, Placement[]>()
    const seen = new Set<string>()
    const dfs = (placed: Placement[]) => {
      if (found.size >= limit) return
      const key = stateKey(placed)
      if (seen.has(key)) return
      seen.add(key)
      nodes++
      const ev = evaluate(puzzle, placed)
      if (ev.issues.length) return
      if (placed.length === depth) {
        if (ev.solved) found.set(key, [...placed])
        return
      }
      for (const c of candidates(placed)) dfs([...placed, c])
    }
    dfs([])
    if (found.size) return { min: depth, solutions: [...found.values()], nodes }
  }
  return { min: null, solutions: [], nodes }
}
