// 問題づくりの下調べ。入力・出力の歯車と目標の比を決め、軸を無作為に「育てて」置き、
// 最少枚数・解の数・調べた盤面の数で候補を選ぶ。結果は src/puzzles/index.ts に貼る形で出す。
//
// npx tsx tools/design.ts --ratio=1/3 --in=8 --out=16 --layers=2 --chain=3 --pegs=6 --min=2 --max=4 --trials=300
// --ratio を省くと比は想定の答えに任せる
import { solve } from '../src/engine/solve.ts'
import { evaluate } from '../src/engine/train.ts'
import { ALL_TEETH, type Layer, type Peg, type Obstacle, type Placement, type Puzzle, type Teeth } from '../src/puzzles/types.ts'

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
const obstacleCount = Number(arg("obstacles", "0"))
/** 2つめの出力 P までの歯車の数。-1 なら出力は1つ。 */
const branchLength = Number(arg("branch", "-1"))
const outTeeth2 = Number(arg("out2", "16")) as Teeth
/** 在庫。例 --stock=8:1,12:2、または --stock=auto */
const stockArg = arg("stock", "")
const fixedStock = stockArg && stockArg !== "auto" ? (Object.fromEntries(stockArg.split(",").map((kv) => kv.split(":").map(Number))) as Partial<Record<Teeth, number>>) : undefined

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

  // tip = 伸ばす先の歯車（chain の添字）。枝分かれのときは途中の歯車から伸ばす
  let tip = 0
  const grow = (t: Teeth, outId: string | null): boolean => {
    const cur = chain[tip]
    const at = pegs.find((p) => p.id === cur.peg)!
    for (let k = 0; k < 40; k++) {
      if (!outId && layers === 2 && random() < 0.3 && !chain.some((c) => c.peg === cur.peg && c.layer !== cur.layer)) {
        const g: Placement = { peg: cur.peg, layer: (1 - cur.layer) as Layer, teeth: t }
        if (ok([...chain, g])) return (tip = chain.push(g) - 1), true
        continue
      }
      const [vx, vy] = pick(vectors.get((cur.teeth + t) / 2)!)
      // 右へ進むほうを選びやすくして、盤の中で詰まりにくくする
      if (vx < 0 && random() < 0.8) continue
      const p = { id: outId ?? nextName(), x: at.x + vx, y: at.y + vy }
      if (!fits(p)) continue
      pegs.push(p)
      const g: Placement = { peg: p.id, layer: cur.layer, teeth: t }
      if (ok([...chain, g])) return (tip = chain.push(g) - 1), true
      pegs.pop()
    }
    return false
  }
  for (let i = 0; i < chainLength; i++) if (!grow(pick(teeth), null)) return null
  if (!grow(outTeeth, 'O')) return null
  const out = chain[chain.length - 1]
  const outs: Placement[] = [out]
  if (branchLength >= 0) {
    // 2つめの出力 P: 入力と O の間の歯車から枝分かれさせる
    if (chain.length < 3) return null
    tip = 1 + Math.floor(random() * (chain.length - 2))
    for (let i = 0; i < branchLength; i++) if (!grow(pick(teeth), null)) return null
    if (!grow(outTeeth2, 'P')) return null
    outs.push(chain[chain.length - 1])
  }

  let guard = 0
  while (pegs.length < pegCount + 2 && guard++ < 500) {
    const from = pick(pegs)
    const [vx, vy] = pick(vectors.get(pick(distances))!)
    const p = { id: nextName(), x: from.x + vx, y: from.y + vy }
    if (fits(p)) pegs.push(p)
  }
  const stock = fixedStock
  const omega = evaluate(draft(), chain).omega
  const ratio = omega.get("O")!
  if (rn !== 0 && (ratio.n * rd !== rn * ratio.d)) return null
  const outputs = outs.map((o) => {
    const w = omega.get(o.peg)!
    return { peg: o.peg, ratio: [w.n, w.d] as [number, number] }
  })

  // 障害物は想定の答えに当たらない所に置く（軸の上にも置かない）
  const obstacles: Obstacle[] = []
  for (let k = 0; k < 200 && obstacles.length < obstacleCount; k++) {
    // 軸の近くに置かないと、どの歯車の邪魔にもならない
    const near = pick(pegs)
    const a = random() * 2 * Math.PI
    const d = 7 + random() * 8
    const o = { x: Math.round(near.x + d * Math.cos(a)), y: Math.round(near.y + d * Math.sin(a)), r: 2 }
    if (pegs.some((p) => (p.x - o.x) ** 2 + (p.y - o.y) ** 2 < 36)) continue
    if (evaluate(draft({ obstacles: [...obstacles, o] }), chain).issues.length) continue
    obstacles.push(o)
  }
  return fit(draft({ given: [chain[0], ...outs], outputs, ...(obstacles.length ? { obstacles } : {}), ...(stock ? { stock } : {}) }))
}

/**
 * 盤を軸の範囲＋いちばん大きい歯車の歯先まで詰め、左上を揃える。横長なら 90° 回して縦長にする（スマホの縦画面を広く使うため）。
 * 裏返し（x と y の入れ替え）だと回る向きが逆になるので、回転にする。
 */
function fit(p: Puzzle): Puzzle {
  const xs0 = p.pegs.map((q) => q.x)
  const ys0 = p.pegs.map((q) => q.y)
  if (Math.max(...xs0) - Math.min(...xs0) > Math.max(...ys0) - Math.min(...ys0)) {
    const turn = <T extends { x: number; y: number }>(q: T): T => ({ ...q, x: -q.y, y: q.x })
    p = { ...p, pegs: p.pegs.map(turn), obstacles: p.obstacles?.map(turn) }
  }
  const m = Math.max(...p.teeth) / 2 + 2
  const xs = p.pegs.map((q) => q.x)
  const ys = p.pegs.map((q) => q.y)
  const dx = m - Math.min(...xs)
  const dy = m - Math.min(...ys)
  const width = Math.max(...xs) + dx + m
  const height = Math.max(...ys) + dy + m
  const obstacles = p.obstacles
    ?.map((o) => ({ ...o, x: o.x + dx, y: o.y + dy }))
    .filter((o) => o.x - o.r >= 0 && o.y - o.r >= 0 && o.x + o.r <= width && o.y + o.r <= height)
  return {
    ...p,
    width,
    height,
    pegs: p.pegs.map((q) => ({ ...q, x: q.x + dx, y: q.y + dy })),
    ...(obstacles?.length ? { obstacles } : {}),
  }
}

const found: { p: Puzzle; min: number; sols: number; nodes: number }[] = []
for (let t = 0; t < trials; t++) {
  const p = attempt()
  if (!p) continue
  const start = evaluate(p, [])
  if (start.issues.length || start.solved) continue
  let r = solve(p, { maxGears, limit: stockArg === "auto" ? 30 : maxSolutions + 1 })
  if (stockArg === "auto" && r.min !== null) {
    // 在庫なしで解が複数ある配置に、解を絞るか枚数を増やす在庫を探す（1種、1〜2枚。0枚はその種類を置けないのと同じなので使わない）
    let best: { stock: Partial<Record<Teeth, number>>; r: typeof r } | null = null
    for (const t of teeth)
      for (let n = 1; n <= 2; n++) {
        const q = { ...p, stock: { [t]: n } }
        const r2 = solve(q, { maxGears, limit: maxSolutions + 1 })
        if (r2.min === null || r2.solutions.length > maxSolutions) continue
        if (r2.min === r.min && r2.solutions.length >= r.solutions.length) continue
        if (!best || r2.min > best.r.min! || (r2.min === best.r.min && r2.solutions.length < best.r.solutions.length)) best = { stock: q.stock, r: r2 }
      }
    if (!best) continue
    p.stock = best.stock
    r = best.r
  }
  if (r.min === null || r.min < minGears || r.solutions.length > maxSolutions) continue
  if (p.obstacles) {
    // 障害物が効いている（なければもっと少ない枚数か、別の解がある）ものだけ残す
    const free = solve({ ...p, obstacles: undefined }, { maxGears, limit: maxSolutions + 2 })
    if (free.min === r.min && free.solutions.length === r.solutions.length) continue
  }
  if (p.stock && stockArg !== "auto") {
    // 在庫が効いているものだけ残す。想定の答えが在庫を超えることもあるので、解けることは上の solve で見ている
    const free = solve({ ...p, stock: undefined }, { maxGears, limit: maxSolutions + 2 })
    if (free.min === r.min && free.solutions.length === r.solutions.length) continue
  }
  found.push({ p, min: r.min, sols: r.solutions.length, nodes: r.nodes })
}

found.sort((a, b) => b.min - a.min || a.sols - b.sols || b.nodes - a.nodes)
console.log(`${found.length} 件`)
for (const f of found.slice(0, 3)) {
  console.log(`\n最少 ${f.min} 枚  解 ${f.sols}  盤面 ${f.nodes}`)
  console.log(JSON.stringify({ width: f.p.width, height: f.p.height, pegs: f.p.pegs, given: f.p.given, outputs: f.p.outputs, obstacles: f.p.obstacles, stock: f.p.stock, best: f.min }))
}
