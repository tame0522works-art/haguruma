// README に載せる画面の画像を撮る。公開と同じ設定のビルドを配信した状態（npm run build → npm run preview）で
// `npm run screenshots` を実行する。Edge（なければ Chrome）を画面なしで起動し、Chrome DevTools Protocol で操作する。
// 操作は決まった手順なので、アプリを直したら同じ画像を撮り直せる。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { solve } from '../src/engine/solve.ts'
import { puzzles } from '../src/puzzles/index.ts'
import type { Placement, Puzzle } from '../src/puzzles/types.ts'
import { Browser, sleep, type Page } from './cdp.ts'

const BASE = process.argv[2] ?? 'http://localhost:5214/'
const OUT = 'docs/images'

async function shoot(cdp: Page, name: string) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(OUT, name), Buffer.from(data, 'base64'))
  console.log(`  ${OUT}/${name}`)
}

async function open(cdp: Page) {
  await cdp.goto(BASE)
  // 同じポートで別の作品が動いていると、その画面を撮ってしまうので、haguruma であることを先に確かめる
  const title = await cdp.run<string>(`return document.title`)
  if (title !== 'haguruma') throw new Error(`${BASE} で動いているのは haguruma ではありません（ページの題名: ${title || 'なし'}）`)
  await cdp.waitFor(`document.querySelector('.levels button')`, '一覧の表示')
}

/** 見えている文字か aria-label の先頭でボタンを押す（画像に写らない操作なので click で足りる） */
const press = (cdp: Page, label: string) =>
  cdp.run(
    `[...document.querySelectorAll('button')].find(b => b.textContent.replace(/\\s+/g, '') === ${JSON.stringify(label)} || (b.getAttribute('aria-label') ?? '').split(/[、 ]/)[0] === ${JSON.stringify(label)}).click()`,
  )

async function place(cdp: Page, p: Puzzle, g: Placement) {
  const k = p.pegs.findIndex((q) => q.id === g.peg)
  const selected = await cdp.run<boolean>(`return document.querySelectorAll('.board .hit')[${k}].getAttribute('aria-pressed') === 'true'`)
  if (!selected) await cdp.run(`document.querySelectorAll('.board .hit')[${k}].dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
  if (p.layers === 2) await press(cdp, g.layer ? '上段' : '下段')
  await press(cdp, `${g.teeth}枚歯`)
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  // このブラウザ専用の一時プロファイルを使うので、普段のデータには触れない
  const browser = await Browser.launch()
  try {
    const cdp = await browser.newPage({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
    // OS が「動きを減らす」設定でも、画像では回っている途中（歯の噛み合い）を撮る
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
    console.log('撮影:')

    // 1. 18問目（出力が2つ）を2枚まで置いて、次の1手のヒントを出したところ
    const p = puzzles[17]
    const sol = solve(p).solutions[0]
    await open(cdp)
    await press(cdp, '18問目')
    await place(cdp, p, sol[0])
    await place(cdp, p, sol[1])
    await press(cdp, 'ヒント')
    await sleep(400)
    await shoot(cdp, 'start.png')

    // 2. 10問目（1/9）を解いて、回っているところ
    const q = puzzles[9]
    await open(cdp)
    await press(cdp, '10問目')
    for (const g of solve(q).solutions[0]) await place(cdp, q, g)
    await sleep(1500)
    await shoot(cdp, 'clear.png')

    // 3. 一覧（10問目だけ解いた記録がある）
    await press(cdp, '←一覧')
    await sleep(200)
    await shoot(cdp, 'menu.png')
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
