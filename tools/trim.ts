// 盤の余白を詰めて src/puzzles/index.ts を書き直す。
// 各辺の余白は、最初からある歯車と最少解の歯車が収まる分（最低 6）＋ 1。詰めたあと解が変わらないことを確かめる。
import { writeFileSync } from 'node:fs'
import { outerRadius } from '../src/engine/geom.ts'
import { solve } from '../src/engine/solve.ts'
import { puzzles } from '../src/puzzles/index.ts'
import type { Puzzle } from '../src/puzzles/types.ts'

const key = (sols: ReturnType<typeof solve>) => JSON.stringify(sols.solutions.map((s) => s.map((g) => `${g.peg}:${g.layer}:${g.teeth}`).sort()).sort())

const out: Puzzle[] = []
for (const p of puzzles) {
  const before = solve(p)
  const gears = [...p.given, ...before.solutions.flat()]
  const pegs = new Map(p.pegs.map((q) => [q.id, q]))
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const q of p.pegs) {
    x0 = Math.min(x0, q.x - 6)
    y0 = Math.min(y0, q.y - 6)
    x1 = Math.max(x1, q.x + 6)
    y1 = Math.max(y1, q.y + 6)
  }
  for (const g of gears) {
    const q = pegs.get(g.peg)!
    const r = outerRadius(g.teeth)
    x0 = Math.min(x0, q.x - r)
    y0 = Math.min(y0, q.y - r)
    x1 = Math.max(x1, q.x + r)
    y1 = Math.max(y1, q.y + r)
  }
  const dx = 1 - x0
  const dy = 1 - y0
  const move = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: o.x + dx, y: o.y + dy })
  const width = x1 + dx + 1
  const height = y1 + dy + 1
  const obstacles = p.obstacles?.map(move).filter((o) => o.x - o.r >= 0 && o.y - o.r >= 0 && o.x + o.r <= width && o.y + o.r <= height)
  const next: Puzzle = { ...p, width, height, pegs: p.pegs.map(move), obstacles: obstacles?.length ? obstacles : undefined }
  const after = solve(next)
  // 詰めると「はみ出す」で消える解がありうるので、最少と解の集合が同じものだけ詰める
  const same = after.min === before.min && key(after) === key(before)
  console.log(`${p.id.padEnd(10)} ${p.width}×${p.height} → ${same ? `${width}×${height}` : '詰めない（解が変わる）'}`)
  out.push(same ? next : p)
}

const order = ['id', 'title', 'note', 'width', 'height', 'pegs', 'layers', 'teeth', 'given', 'input', 'outputs', 'obstacles', 'best'] as const
const lit = (v: unknown) =>
  JSON.stringify(v)
    .replace(/"(\w+)":/g, '$1: ')
    .replace(/"/g, "'")
    .replace(/,/g, ', ')
    .replace(/\{/g, '{ ')
    .replace(/\}/g, ' }')
const body = out
  .map(
    (p) =>
      '  {\n' +
      order
        .filter((k) => p[k] !== undefined)
        .map((k) => `    ${k}: ${lit(p[k])},`)
        .join('\n') +
      '\n  },',
  )
  .join('\n')
writeFileSync(
  new URL('../src/puzzles/index.ts', import.meta.url),
  `import type { Puzzle } from './types.ts'

// 座標の単位は歯車のモジュール（8枚歯のピッチ円の半径が 4）。2問目以降は tools/design.ts で作った配置。
// 盤の大きさは tools/trim.ts で詰めている（問題を足したら npm run trim）。
export const puzzles: Puzzle[] = [
${body}
]
`,
)
