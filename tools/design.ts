// 問題づくりの下調べ。入力・出力の歯車と目標の比を決め、軸を無作為に「育てて」置き、
// 最少枚数・解の数・調べた盤面の数で候補を選ぶ。結果は src/puzzles/index.ts に貼る形で出す。
//
// npx tsx tools/design.ts --ratio=1/3 --in=8 --out=16 --layers=2 --chain=3 --pegs=6 --min=2 --max=4 --trials=300
// --ratio を省くと比は想定の答えに任せる
import { solve } from '../src/engine/solve.ts'
import { evaluate } from '../src/engine/train.ts'
import { ALL_TEETH, type Layer, type Peg, type Placement, type Puzzle, type Teeth } from '../src/puzzles/types.ts'

const arg = (name: string, def: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? def
const [rn, rd] = arg('ratio', '0/1').split('/').map(Number)
const inTeeth = Number(arg('in', '16')) as Teeth
const outTeeth = Number(arg('out', '16')) as Teeth
const layers = Number(arg('layers', '1')) as 1 | 2
const teeth = arg('teeth', '8,12,16,24').split(',').map(Number) as Teeth[]
const pegCount = Number(arg('pegs', '5'))
const width = Number(arg('w', '64'))
const height = Number(arg('h', '44'))
const minGears = Number(arg('min', '1'))
const maxGears = Number(arg('max', '4'))
const maxSolutions = Number(arg('sol', '3'))
const trials = Number(arg('trials', '200'))
let seed = Number(arg('seed', '1'))

const random = () => {
  // 再現できるように種つきの乱数（mulberry32）
  seed = (seed + 0x6d2b79f5) | 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(random() * xs.length)]

// 噛み合う距離（ピッチ円の半径の和）と、その長さの整数ベクトル
const distances = [...new Set(ALL_TEETH.flatMap((a) => ALL_TEETH.map((b) => (a + b) / 2)))]
const vectors = new Map<number, [number, number][]>()
for (const d of distances) {
  const vs: [number, number][] = []
  for (let x = -d; x <= d; x++)
    for (let y = -d; y <= d; y++) if (x * x + y * y === d * d) vs.push([x, y])
  vectors.set(d, vs)
}

const chainLength = Number(arg("chain", "3"))

/**
 * 解ける問題を作るため、まず入力から歯車を1枚ずつ伸ばした「想定の答え」を作り、その先に出力の軸を置く。
 * そのあと、すでにある軸から噛み合う距離に「おとりの軸」を足す。最少の解は想定の答えより短いこともあるので、最後に solve で測る。
 */
function attempt(): Puzzle | null {
  const margin = inTeeth / 2 + 2
  const pegs: Peg[] = [{ id: "I", x: Math.round(margin + random() * 4), y: Math.round(height / 2 + (random() - 0.5) * 10) }]
  const names = "abcdefghijklmn"
  const nextName = () => names[pegs.length - 1]
  const chain: Placement[] = [{ peg: "I", layer: 0, teeth: inTeeth }]
  const draft = (extra: Partial<Puzzle> = {}): Puzzle => ({
    id: "draft", title: "draft", width, height, pegs, layers, teeth, given: [], input: "I", outputs: [], best: 0, ...extra,
  })
  const ok = (p: Placement[]) => evaluate(draft(), p).issues.length === 0
  const fits = (p: Peg) => p.x >= 5 && p.y >= 5 && p.x <= width - 5 && p.y <= height - 5 && !pegs.some((q) => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 < 25)

  const grow = (t: Teeth, last: boolean): boolean => {
    const cur = chain[chain.length - 1]
    const at = pegs.find((p) => p.id === cur.peg)!
    for (let k = 0; k < 40; k++) {
      if (!last && layers === 2 && random() < 0.3 && !chain.some((c) => c.peg === cur.peg && c.layer !== cur.layer)) {
        const g: Placement = { peg: cur.peg, layer: (1 - cur.layer) as Layer, teeth: t }
        if (ok([...chain, g])) return chain.push(g), true
        continue
      }
      const [vx, vy] = pick(vectors.get((cur.teeth + t) / 2)!)
      // 右へ進むほうを選びやすくして、盤の中で詰まりにくくする
      if (vx < 0 && random() < 0.8) continue
      const p = { id: last ? "O" : nextName(), x: at.x + vx, y: at.y + vy }
      if (!fits(p)) continue
      pegs.push(p)
      const g: Placement = { peg: p.id, layer: cur.layer, teeth: t }
      if (ok([...chain, g])) return chain.push(g), true
      pegs.pop()
    }
    return false
  }
  for (let i = 0; i < chainLength; i++) if (!grow(pick(teeth), false)) return null
  if (!grow(outTeeth, true)) return null
  const out = chain[chain.length - 1]

  let guard = 0
  while (pegs.length < pegCount + 2 && guard++ < 500) {
    const from = pick(pegs)
    const [vx, vy] = pick(vectors.get(pick(distances))!)
    const p = { id: nextName(), x: from.x + vx, y: from.y + vy }
    if (fits(p)) pegs.push(p)
  }
  const ratio = evaluate(draft(), chain).omega.get("O")!
  if (rn !== 0 && (ratio.n * rd !== rn * ratio.d)) return null
  return draft({ given: [chain[0], out], outputs: [{ peg: "O", ratio: [ratio.n, ratio.d] }] })
}

const found: { p: Puzzle; min: number; sols: number; nodes: number }[] = []
for (let t = 0; t < trials; t++) {
  const p = attempt()
  if (!p) continue
  const start = evaluate(p, [])
  if (start.issues.length || start.solved) continue
  const r = solve(p, { maxGears, limit: maxSolutions + 1 })
  if (r.min === null || r.min < minGears || r.solutions.length > maxSolutions) continue
  found.push({ p, min: r.min, sols: r.solutions.length, nodes: r.nodes })
}

found.sort((a, b) => b.min - a.min || a.sols - b.sols || b.nodes - a.nodes)
console.log(`${found.length} 件`)
for (const f of found.slice(0, 3)) {
  console.log(`\n最少 ${f.min} 枚  解 ${f.sols}  盤面 ${f.nodes}`)
  console.log(JSON.stringify({ width, height, pegs: f.p.pegs, given: f.p.given, outputs: f.p.outputs, best: f.min }))
}
