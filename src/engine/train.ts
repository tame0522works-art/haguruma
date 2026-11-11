import type { Placement, Puzzle, Teeth } from '../puzzles/types.ts'
import { coversShaft, hitsObstacle, insideBoard, relation } from './geom.ts'
import { eq, mul, neg, rat, type Rational } from './rational.ts'

export const keyOf = (p: { peg: string; layer: number }): string => `${p.peg}:${p.layer}`

export type Issue =
  | { kind: 'collide'; a: string; b: string }
  | { kind: 'covers'; a: string; peg: string }
  | { kind: 'obstacle'; a: string; index: number }
  | { kind: 'outside'; a: string }
  /** 噛み合いの輪で回転が食い違い、固まって動かない。pegs は輪をなす軸の順。 */
  | { kind: 'jam'; pegs: string[] }
  | { kind: 'stock'; teeth: Teeth }
  | { kind: 'overlap'; a: string }

export interface Mesh {
  a: string
  b: string
}

export interface OutputResult {
  peg: string
  target: Rational
  omega: Rational | null
  ok: boolean
}

export interface Evaluation {
  /** 入力軸とつながった軸の回転（入力 = 1）。つながっていない軸は入らない。 */
  omega: Map<string, Rational>
  meshes: Mesh[]
  /** 入力軸につながった歯車に問題がなく、実際に回るか。 */
  moving: boolean
  issues: Issue[]
  outputs: OutputResult[]
  solved: boolean
}

/** given と置いた歯車を合わせる。同じ軸・同じ段に2枚あれば overlap。 */
export function evaluate(puzzle: Puzzle, placed: readonly Placement[]): Evaluation {
  const pegs = new Map(puzzle.pegs.map((p) => [p.id, p]))
  const all = [...puzzle.given, ...placed]
  const issues: Issue[] = []

  const byKey = new Map<string, Placement>()
  for (const p of all) {
    if (!pegs.has(p.peg)) throw new Error(`軸 ${p.peg} がない`)
    if (p.layer >= puzzle.layers) throw new Error(`${keyOf(p)} はこの問題にない段`)
    const k = keyOf(p)
    if (byKey.has(k)) issues.push({ kind: 'overlap', a: k })
    else byKey.set(k, p)
  }

  if (puzzle.stock) {
    for (const t of Object.keys(puzzle.stock).map(Number) as Teeth[]) {
      if (placed.filter((p) => p.teeth === t).length > puzzle.stock[t]!) issues.push({ kind: 'stock', teeth: t })
    }
  }

  const gears = [...byKey.values()]
  const occupied = new Set(gears.map((g) => g.peg))
  const meshes: Mesh[] = []

  for (const [i, g] of gears.entries()) {
    const at = pegs.get(g.peg)!
    if (!insideBoard(at, g.teeth, puzzle.width, puzzle.height)) issues.push({ kind: 'outside', a: keyOf(g) })
    for (const [j, o] of (puzzle.obstacles ?? []).entries()) {
      if (hitsObstacle(at, g.teeth, o)) issues.push({ kind: 'obstacle', a: keyOf(g), index: j })
    }
    for (const h of gears.slice(i + 1)) {
      if (h.peg === g.peg || h.layer !== g.layer) continue
      const rel = relation(at, g.teeth, pegs.get(h.peg)!, h.teeth)
      if (rel === 'mesh') meshes.push({ a: keyOf(g), b: keyOf(h) })
      else if (rel === 'collide') issues.push({ kind: 'collide', a: keyOf(g), b: keyOf(h) })
    }
    // 同じ段の歯車どうしがぶつかる場合は collide で足りるので、別の段の軸にかぶさるときだけ数える
    for (const peg of occupied) {
      if (peg === g.peg) continue
      if (byKey.has(`${peg}:${g.layer}`)) continue
      if (coversShaft(at, g.teeth, pegs.get(peg)!)) issues.push({ kind: 'covers', a: keyOf(g), peg })
    }
  }

  // 軸を節点にして回転を伝える。噛み合う2枚は逆向きに、歯数の逆比で回る。
  const adj = new Map<string, { to: string; factor: Rational }[]>()
  const link = (from: string, to: string, factor: Rational) => {
    if (!adj.has(from)) adj.set(from, [])
    adj.get(from)!.push({ to, factor })
  }
  for (const m of meshes) {
    const a = byKey.get(m.a)!
    const b = byKey.get(m.b)!
    link(a.peg, b.peg, neg(rat(a.teeth, b.teeth)))
    link(b.peg, a.peg, neg(rat(b.teeth, a.teeth)))
  }

  const omega = new Map<string, Rational>()
  const parent = new Map<string, string | null>()
  if (occupied.has(puzzle.input)) {
    omega.set(puzzle.input, rat(1))
    parent.set(puzzle.input, null)
    const queue = [puzzle.input]
    const jams = new Set<string>()
    while (queue.length) {
      const peg = queue.shift()!
      for (const { to, factor } of adj.get(peg) ?? []) {
        const w = mul(omega.get(peg)!, factor)
        const known = omega.get(to)
        if (!known) {
          omega.set(to, w)
          parent.set(to, peg)
          queue.push(to)
        } else if (!eq(known, w)) {
          const cycle = cycleThrough(parent, peg, to)
          const id = [...cycle].sort().join(',')
          if (!jams.has(id)) {
            jams.add(id)
            issues.push({ kind: 'jam', pegs: cycle })
          }
        }
      }
    }
  }

  const inTrain = (key: string) => omega.has(key.split(':')[0])
  const moving =
    omega.size > 0 &&
    !issues.some((i) => {
      switch (i.kind) {
        case 'jam':
          return true
        case 'collide':
          return inTrain(i.a) || inTrain(i.b)
        case 'covers':
          return inTrain(i.a) || omega.has(i.peg)
        case 'obstacle':
        case 'outside':
        case 'overlap':
          return inTrain(i.a)
        case 'stock':
          return false
      }
    })

  const outputs = puzzle.outputs.map((o) => {
    const target = rat(o.ratio[0], o.ratio[1])
    const w = moving ? (omega.get(o.peg) ?? null) : null
    return { peg: o.peg, target, omega: w, ok: w !== null && eq(w, target) }
  })

  return {
    omega,
    meshes,
    moving,
    issues,
    outputs,
    solved: issues.length === 0 && outputs.every((o) => o.ok),
  }
}

/** 探索の木で a と b を結ぶ道（＋ a–b の辺）が輪になる。a から根へ、b から根へたどって合流点で結ぶ。 */
function cycleThrough(parent: Map<string, string | null>, a: string, b: string): string[] {
  const up = (x: string) => {
    const path = [x]
    for (let p = parent.get(x); p; p = parent.get(p)) path.push(p)
    return path
  }
  const pa = up(a)
  const pb = up(b)
  const inB = new Set(pb)
  const meet = pa.find((x) => inB.has(x))!
  return [...pa.slice(0, pa.indexOf(meet) + 1), ...pb.slice(0, pb.indexOf(meet)).reverse()]
}
