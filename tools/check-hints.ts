// ヒントだけをたどって ★3 で解けるかを、全問の「空の盤面」と「でたらめに置いた盤面」から確かめる。
import { evaluate } from '../src/engine/train.ts'
import { nextHint } from '../src/puzzles/hint.ts'
import { puzzles } from '../src/puzzles/index.ts'
import type { Layer, Placement, Puzzle } from '../src/puzzles/types.ts'

let seed = 7
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function apply(placed: Placement[], h: NonNullable<ReturnType<typeof nextHint>>): Placement[] {
  const rest = placed.filter((g) => !(g.peg === h.peg && g.layer === h.layer))
  return h.teeth === null ? rest : [...rest, { peg: h.peg, layer: h.layer, teeth: h.teeth }]
}

/** ヒントに従って解く。最初の盤面が空なら、ちょうど best 手で解けるはず。 */
function follow(p: Puzzle, start: Placement[]): { ok: boolean; steps: number } {
  let placed = start
  for (let steps = 0; steps < 40; steps++) {
    const ev = evaluate(p, placed)
    if (ev.solved && placed.length === p.best) return { ok: true, steps }
    const h = nextHint(p, placed)
    if (!h) return { ok: false, steps }
    placed = apply(placed, h)
  }
  return { ok: false, steps: 40 }
}

function randomState(p: Puzzle): Placement[] {
  const givenKeys = new Set(p.given.map((g) => `${g.peg}:${g.layer}`))
  const out: Placement[] = []
  for (const peg of p.pegs) {
    for (let layer = 0; layer < p.layers; layer++) {
      if (givenKeys.has(`${peg.id}:${layer}`) || random() < 0.7) continue
      out.push({ peg: peg.id, layer: layer as Layer, teeth: p.teeth[Math.floor(random() * p.teeth.length)] })
    }
  }
  return out
}

let failures = 0
let states = 0
for (const [i, p] of puzzles.entries()) {
  const empty = follow(p, [])
  const problems: string[] = []
  if (!empty.ok || empty.steps !== p.best) problems.push(`空の盤面から ${empty.ok ? `${empty.steps} 手` : '解けない'}（最少 ${p.best}）`)
  for (let k = 0; k < 100; k++) {
    states++
    const start = randomState(p)
    const r = follow(p, start)
    if (!r.ok) {
      problems.push(`でたらめな盤面から解けない: ${JSON.stringify(start)}`)
      break
    }
  }
  console.log(`${String(i + 1).padStart(2)} ${p.id.padEnd(16)} ${problems.length ? `NG ${problems.join(' / ')}` : 'ok'}`)
  if (problems.length) failures++
}
console.log(failures ? `\n${failures} 問が NG` : `\nすべて ok（${puzzles.length} 問 × 101 盤面、計 ${states + puzzles.length}）`)
process.exit(failures ? 1 : 0)
