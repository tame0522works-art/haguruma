// 画面操作のテスト。公開と同じ設定でビルドしたもの（CSP 入り）をローカルで配信し、画面なしの Chrome に
// 本物のマウス・タッチ・キーボードの入力を送って、歯車の置き方・ぶつかりと固まりの案内・★と記録・ヒント・通信の制限を確かめる。
// `npm run e2e` で実行する（先に dist-e2e へビルドしてから、このスクリプトが配信とブラウザを立ち上げる）。
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { relation } from '../src/engine/geom.ts'
import { solve } from '../src/engine/solve.ts'
import { evaluate } from '../src/engine/train.ts'
import { puzzles } from '../src/puzzles/index.ts'
import type { Layer, Placement, Puzzle } from '../src/puzzles/types.ts'
import { Browser, sleep, type Page, type Viewport } from './cdp.ts'

const PORT = 4213
const BASE = `http://127.0.0.1:${PORT}/`
const DESKTOP: Viewport = { width: 1280, height: 860 }
const PHONE: Viewport = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, touch: true }
const FAILURES = 'e2e-failures'
type Input = 'mouse' | 'touch'

class Ui {
  readonly page: Page
  readonly input: Input
  constructor(page: Page, input: Input) {
    this.page = page
    this.input = input
  }

  async open() {
    await this.page.goto(BASE)
    await this.page.waitFor(`document.querySelector('.levels button')`, '一覧の表示')
  }

  text(selector: string) {
    return this.page.run<string>(`return (document.querySelector(${JSON.stringify(selector)})?.textContent ?? '').replace(/\\s+/g, ' ').trim()`)
  }

  count(selector: string) {
    return this.page.run<number>(`return document.querySelectorAll(${JSON.stringify(selector)}).length`)
  }

  private async tap(c: { x: number; y: number }) {
    if (this.input === 'touch') {
      await this.page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [c] })
      await sleep(50)
      await this.page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      // 指を離してすぐの次のタップは Chrome が click にしないことがある（kakijun で分かったこと）
      await sleep(350)
    } else {
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
        await this.page.send('Input.dispatchMouseEvent', { type, ...c, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 })
      }
      await sleep(60)
    }
  }

  private async center(selectorJs: string, label: string) {
    const c = await this.page.run<{ x: number; y: number } | null>(`
      const el = ${selectorJs};
      if (!el) return null;
      el.scrollIntoView({ block: 'nearest' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    `)
    assert.ok(c, `${label}がない`)
    return c
  }

  /** 見えている文字（空白を除く）か aria-label でボタンを押す。aria-label は先頭一致（「12枚歯、残り 1」など） */
  async press(label: string) {
    const L = JSON.stringify(label)
    await this.tap(
      await this.center(
        `[...document.querySelectorAll('button')].find(b => b.textContent.replace(/\\s+/g, '') === ${L} || (b.getAttribute('aria-label') ?? '').split(/[、 ]/)[0] === ${L})`,
        `「${label}」のボタン`,
      ),
    )
  }

  async disabled(label: string) {
    const L = JSON.stringify(label)
    return this.page.run<boolean>(`return [...document.querySelectorAll('button')].find(b => b.textContent.replace(/\\s+/g, '') === ${L} || (b.getAttribute('aria-label') ?? '').split(/[、 ]/)[0] === ${L}).disabled`)
  }

  /** 盤面の軸を押す（軸の当たりは歯車より上に描いてある） */
  async peg(p: Puzzle, id: string) {
    const k = p.pegs.findIndex((q) => q.id === id)
    await this.tap(await this.center(`document.querySelectorAll('.board .hit')[${k}]`, `軸 ${id}`))
  }

  pegLabel(p: Puzzle, id: string) {
    const k = p.pegs.findIndex((q) => q.id === id)
    return this.page.run<string>(`return document.querySelectorAll('.board .hit')[${k}]?.getAttribute('aria-label') ?? ''`)
  }

  selectedPeg(p: Puzzle) {
    return this.page.run<number>(`return [...document.querySelectorAll('.board .hit')].findIndex(h => h.getAttribute('aria-pressed') === 'true')`).then((k) => p.pegs[k]?.id ?? null)
  }

  /** 歯車を1枚置く: 軸を選び（開いていなければ）、段を合わせ、歯数を押す */
  async place(p: Puzzle, g: Placement) {
    if ((await this.selectedPeg(p)) !== g.peg) await this.peg(p, g.peg)
    if (p.layers === 2) {
      const on = await this.page.run<string>(`return document.querySelector('.seg .on')?.textContent ?? ''`)
      const want = g.layer ? '上段' : '下段'
      if (on !== want) await this.press(want)
    }
    await this.press(`${g.teeth}枚歯`)
  }

  async placeAll(p: Puzzle, gears: readonly Placement[]) {
    for (const g of gears) await this.place(p, g)
  }

  solvedShown() {
    return this.page.run<boolean>(`return !!document.querySelector('.clear')`)
  }

  async key(key: string, code: string, vk: number) {
    // Enter でボタンを押すには文字（\r）も送る必要がある（keyDown だけでは click にならない）
    const text = key === 'Enter' ? '\r' : undefined
    for (const type of ['keyDown', 'keyUp']) await this.page.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk, ...(type === 'keyDown' && text ? { text } : {}) })
    await sleep(60)
  }
}

const best = (i: number) => solve(puzzles[i]).solutions[0]

/** 最少解に1枚足しても解ける置き方（★2 の確認用）。足した歯車はどこにも噛み合わない所に置く。 */
function oneExtra(i: number): Placement[] {
  const p = puzzles[i]
  const sol = best(i)
  const taken = new Set([...p.given, ...sol].map((g) => `${g.peg}:${g.layer}`))
  for (const peg of p.pegs)
    for (let layer = 0; layer < p.layers; layer++)
      for (const teeth of p.teeth) {
        if (taken.has(`${peg.id}:${layer}`)) continue
        // 足す1枚を先に置く（最少解を置き終えた時点で解けて、案内が出てしまうので）
        const extra = [{ peg: peg.id, layer: layer as Layer, teeth }, ...sol]
        if (evaluate(p, extra).solved) return extra
      }
  throw new Error(`${p.id} に1枚足して解ける置き方がない`)
}

/**
 * 置くと固まり（jam）だけが起きる置き方を探す（3枚まで）。最後の1枚を置くまでは問題がない置き方にする。
 * 置く候補は、すでにある歯車と噛み合うか同じ軸の別の段だけ（輪を作るにはそれで足りる）。
 */
function jamSet(): { index: number; gears: Placement[] } {
  for (const [index, p] of puzzles.entries()) {
    const pegs = new Map(p.pegs.map((q) => [q.id, q]))
    const dfs = (placed: Placement[]): Placement[] | null => {
      const ev = evaluate(p, placed)
      if (ev.issues.length) return ev.issues.every((x) => x.kind === 'jam') ? placed : null
      if (placed.length === 3) return null
      const all = [...p.given, ...placed]
      const taken = new Set(all.map((g) => `${g.peg}:${g.layer}`))
      for (const g of all)
        for (const q of p.pegs)
          for (let layer = 0; layer < p.layers; layer++)
            for (const teeth of p.teeth) {
              if (taken.has(`${q.id}:${layer}`)) continue
              const same = q.id === g.peg && layer !== g.layer
              if (!same && (layer !== g.layer || relation(pegs.get(g.peg)!, g.teeth, q, teeth) !== 'mesh')) continue
              const r = dfs([...placed, { peg: q.id, layer: layer as Layer, teeth }])
              if (r) return r
            }
      return null
    }
    const gears = dfs([])
    if (gears) return { index, gears }
  }
  throw new Error('3枚までで固まる置き方がない')
}

interface Scenario {
  name: string
  viewport?: Viewport
  setup?: string
  run(ui: Ui): Promise<void>
}

const scenarios: Scenario[] = [
  {
    name: '一覧: 20問・★ 0 / 60',
    async run(ui) {
      await ui.open()
      assert.equal(await ui.count('.levels button'), 20)
      assert.match(await ui.text('.menu header .muted'), /★ 0 \/ 60/)
    },
  },
  {
    name: 'スマホの指で1問目: 届かない案内 → 置き直して ★3、記録が残る',
    viewport: PHONE,
    async run(ui) {
      const p = puzzles[0]
      await ui.open()
      await ui.press('1問目')
      assert.match(await ui.text('.goal'), /出力を同じ向きに同じ速さで回す/)
      await ui.place(p, { peg: 'a', layer: 0, teeth: 8 })
      await sleep(300)
      assert.equal(await ui.pegLabel(p, 'a'), '軸、8枚歯', JSON.stringify(await ui.page.run(`return [...document.querySelectorAll('.board .hit')].map(h => h.getAttribute('aria-label'))`)))
      assert.match(await ui.text('.status'), /出力の軸（金の輪）まで回転が届いていない/)
      await ui.press('なし')
      await ui.place(p, { peg: 'b', layer: 0, teeth: 12 })
      assert.ok(await ui.solvedShown(), '完成の案内が出ない')
      assert.match(await ui.text('.clear'), /★★★.*歯車 1 枚で回った。最少の枚数。.*記録しました/)
      await ui.press('回るところを見る')
      await ui.press('←一覧')
      assert.match(await ui.text('.menu header .muted'), /★ 3 \/ 60/)
      // 読み込み直しても残っている
      await ui.open()
      assert.match(await ui.text('.menu header .muted'), /★ 3 \/ 60/)
      assert.match(await ui.text('.levels li:first-child'), /★★★/)
    },
  },
  {
    name: '3問目: ぶつかる・はみ出す案内、1手戻す・最初から',
    async run(ui) {
      const p = puzzles[2]
      await ui.open()
      await ui.press('3問目')
      assert.ok(await ui.disabled('1手戻す'))
      await ui.place(p, { peg: 'a', layer: 0, teeth: 16 })
      assert.match(await ui.text('.status'), /ぶつかっている/)
      assert.ok((await ui.count('.gear.bad')) >= 2, 'ぶつかった歯車が赤くならない')
      await ui.press('1手戻す')
      assert.equal(await ui.count('.gear.bad'), 0)
      assert.equal(await ui.text('.meters b'), '0')
      await ui.place(p, { peg: 'a', layer: 0, teeth: 12 })
      await ui.place(p, { peg: 'b', layer: 0, teeth: 8 })
      assert.equal(await ui.text('.meters b'), '2')
      await ui.press('最初から')
      assert.equal(await ui.text('.meters b'), '0')
      assert.ok(await ui.disabled('最初から'))
    },
  },
  {
    name: '噛み合いの輪で固まる: 赤く揺れて、回らない',
    async run(ui) {
      const { index, gears } = jamSet()
      const p = puzzles[index]
      await ui.open()
      await ui.press(`${index + 1}問目`)
      await ui.placeAll(p, gears)
      assert.match(await ui.text('.status'), /固まって動かない/)
      assert.ok((await ui.count('.gear.bad')) >= 3, '固まった歯車が赤くならない')
      const a = await ui.page.run<string[]>(`return [...document.querySelectorAll('.gear .shake > g')].map(g => g.getAttribute('transform'))`)
      await sleep(300)
      const b = await ui.page.run<string[]>(`return [...document.querySelectorAll('.gear .shake > g')].map(g => g.getAttribute('transform'))`)
      assert.deepEqual(a, b, '固まっているのに回っている')
    },
  },
  {
    name: '7問目（同軸の2段）を答えどおりに置いて ★3、歯車が回る',
    // OS が「動きを減らす」設定だとヘッドレスの Chrome もそれに従い、回さない画面になるので、ここでは設定なしにする
    setup: `const mm = window.matchMedia.bind(window); window.matchMedia = (q) => q.includes('reduced-motion') ? { matches: false, media: q, addEventListener() {}, removeEventListener() {} } : mm(q);`,
    async run(ui) {
      const p = puzzles[6]
      await ui.open()
      await ui.press('7問目')
      await ui.placeAll(p, best(6))
      assert.ok(await ui.solvedShown())
      assert.match(await ui.text('.clear'), /★★★/)
      const a = await ui.page.run<string[]>(`return [...document.querySelectorAll('.gear .shake > g')].map(g => g.getAttribute('transform'))`)
      await sleep(300)
      const b = await ui.page.run<string[]>(`return [...document.querySelectorAll('.gear .shake > g')].map(g => g.getAttribute('transform'))`)
      assert.notDeepEqual(a, b, '解けたのに回っていない')
    },
  },
  {
    name: '動きを減らす設定: 回さずに向きの矢印を出す',
    setup: `const mm = window.matchMedia.bind(window); window.matchMedia = (q) => q.includes('reduced-motion') ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : mm(q);`,
    async run(ui) {
      const p = puzzles[6]
      await ui.open()
      await ui.press('7問目')
      await ui.placeAll(p, best(6))
      assert.ok((await ui.count('.spin-arrow')) >= 3, '向きの矢印が出ない')
      const a = await ui.page.run<string[]>(`return [...document.querySelectorAll('.gear .shake > g')].map(g => g.getAttribute('transform'))`)
      await sleep(300)
      const b = await ui.page.run<string[]>(`return [...document.querySelectorAll('.gear .shake > g')].map(g => g.getAttribute('transform'))`)
      assert.deepEqual(a, b, '動きを減らす設定なのに回っている')
    },
  },
  {
    name: '1枚多く使って解くと ★2、1手戻して置き直せる',
    async run(ui) {
      const p = puzzles[1]
      await ui.open()
      await ui.press('2問目')
      await ui.placeAll(p, oneExtra(1))
      assert.match(await ui.text('.clear'), /★★☆.*最少は 2 枚/)
      await ui.press('1手戻して、もっと少ない枚数を探す')
      assert.equal(await ui.solvedShown(), false)
      assert.equal(await ui.text('.meters b'), '2')
    },
  },
  {
    name: '在庫（11問目）: 12枚歯を1枚置くと、ほかの軸では選べない',
    async run(ui) {
      const p = puzzles[10]
      await ui.open()
      await ui.press('11問目')
      await ui.peg(p, 'a')
      assert.equal(await ui.page.run<string>(`return document.querySelector('[aria-label^="12枚歯"]').getAttribute('aria-label')`), '12枚歯、残り 1')
      await ui.press('12枚歯')
      await ui.peg(p, 'b')
      assert.ok(await ui.disabled('12枚歯'), '在庫切れなのに選べる')
      // 置いた軸ではそのまま選び直せる
      await ui.peg(p, 'a')
      assert.equal(await ui.disabled('12枚歯'), false)
    },
  },
  {
    name: 'スマホの指で20問目をヒントだけで解く',
    viewport: PHONE,
    async run(ui) {
      const p = puzzles[19]
      await ui.open()
      await ui.press('20問目')
      for (let step = 0; step < p.best + 2 && !(await ui.solvedShown()); step++) {
        await ui.press('ヒント')
        const hint = await ui.text('.hint-text')
        const k = await ui.page.run<number>(`return [...document.querySelectorAll('.board .hit')].findIndex(h => h.parentElement.querySelector('.hint-ring'))`)
        assert.ok(k >= 0, 'ヒントの軸が光らない')
        const m = hint.match(/(上段|下段)?に (\d+)枚歯 を置く/)
        assert.ok(m, `空の盤面からのヒントは「置く」のはず: ${hint}`)
        await ui.place(p, { peg: p.pegs[k].id, layer: m[1] === '上段' ? 1 : 0, teeth: Number(m[2]) as Placement['teeth'] })
      }
      assert.ok(await ui.solvedShown(), 'ヒントだけで解けない')
      assert.match(await ui.text('.clear'), /★★★/)
    },
  },
  {
    name: 'ヒント: 要らない歯車があれば先に外すよう示す',
    async run(ui) {
      const p = puzzles[1]
      const extra = oneExtra(1)[0]
      await ui.open()
      await ui.press('2問目')
      await ui.place(p, extra)
      await ui.press('ヒント')
      assert.match(await ui.text('.hint-text'), /歯車を外す（なくても解ける）/)
    },
  },
  {
    name: '完成の案内から次の問題へ進める',
    async run(ui) {
      await ui.open()
      await ui.press('1問目')
      await ui.placeAll(puzzles[0], best(0))
      await ui.press('次の問題へ')
      assert.match(await ui.text('.top .title'), /^2\. /)
    },
  },
  {
    name: 'キーボード: Tab で軸に移り、Enter で選ぶ欄を開いて歯車を置く',
    async run(ui) {
      await ui.open()
      await ui.press('1問目')
      // 戻る → 1つめの軸（入力）→ 2つめの軸（a）
      for (let i = 0; i < 3; i++) await ui.key('Tab', 'Tab', 9)
      assert.equal(await ui.page.run<string>(`return document.activeElement?.getAttribute('aria-label') ?? ''`), '軸、空き')
      await ui.key('Enter', 'Enter', 13)
      assert.ok(await ui.count('.picker'), '選ぶ欄が開かない')
      await ui.page.run(`document.querySelector('[aria-label="8枚歯"]').focus()`)
      await ui.key('Enter', 'Enter', 13)
      assert.equal(await ui.text('.meters b'), '1')
    },
  },
  {
    name: '保存できないブラウザでも遊べる（記録は残らない）',
    setup: `Storage.prototype.getItem = () => { throw new Error('blocked') }; Storage.prototype.setItem = () => { throw new Error('blocked') };`,
    async run(ui) {
      await ui.open()
      await ui.press('1問目')
      await ui.placeAll(puzzles[0], best(0))
      assert.ok(await ui.solvedShown())
      await ui.press('←一覧')
      // 画面の中では覚えているが、読み込み直すと消える
      assert.match(await ui.text('.menu header .muted'), /★ 3 \/ 60/)
      await ui.open()
      assert.match(await ui.text('.menu header .muted'), /★ 0 \/ 60/)
    },
  },
  {
    name: '公開版の CSP: 通信は拒否し、すべて同じ場所から読む',
    async run(ui) {
      await ui.open()
      const csp = await ui.page.run<string>(`return document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? ''`)
      assert.match(csp, /connect-src 'none'/)
      const files = await ui.page.run<string[]>(`return performance.getEntriesByType('resource').map(e => e.name)`)
      assert.ok(files.every((f) => f.startsWith(BASE)), `別の場所から読んでいる: ${files.join(', ')}`)
      const blocked = await ui.page.run<boolean>(`try { await fetch('${BASE}'); return false } catch { return true }`)
      assert.ok(blocked, 'fetch が通ってしまう')
      assert.deepEqual(await ui.page.run(`return window.__csp`), [`connect-src ${BASE}`])
    },
  },
]

let server: ChildProcess | null = null

async function startServer() {
  // vite の preview で dist-e2e を配信する（npx を介さず、どの OS でも同じ起動のしかたにする）
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
  for (let i = 0; i < 100; i++) {
    if (await fetch(BASE).then((r) => r.ok, () => false)) return
    await sleep(100)
  }
  await stopServer()
  throw new Error('テスト用のサーバーが起動しませんでした')
}

async function stopServer() {
  if (!server) return
  const s = server
  server = null
  const exited = new Promise((r) => s.once('exit', r))
  s.kill()
  await exited
}

async function main() {
  const only = process.argv[2]
  await startServer()
  const browser = await Browser.launch(9353)
  let failed = 0
  try {
    for (const s of scenarios.filter((s) => !only || s.name.includes(only))) {
      const viewport = s.viewport ?? DESKTOP
      const page = await browser.newPage(viewport)
      // 裏のタブでは requestAnimationFrame が止まり、歯車が回らないので前に出す
      await page.send('Page.bringToFront')
      // ページの中で起きた CSP 違反とエラーを記録しておく（意図して起こすもの以外は起きないはず）
      await page.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `window.__csp = []; window.__errors = [];
          document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
          addEventListener('error', e => window.__errors.push(String(e.message)));
          ${s.setup ?? ''}`,
      })
      const ui = new Ui(page, viewport.touch ? 'touch' : 'mouse')
      const t0 = Date.now()
      try {
        await s.run(ui)
        if (!s.name.startsWith('公開版の CSP')) assert.deepEqual(await page.run(`return window.__csp`), [], 'CSP 違反が起きた')
        assert.deepEqual(await page.run(`return window.__errors`), [], 'ページでエラーが起きた')
        console.log(`  ✓ ${s.name}（${((Date.now() - t0) / 1000).toFixed(1)}秒）`)
      } catch (e) {
        failed++
        console.log(`  ✗ ${s.name}\n      ${e instanceof Error ? e.message : String(e)}`)
        mkdirSync(FAILURES, { recursive: true })
        const { data } = await page.send('Page.captureScreenshot', { format: 'png' }).catch(() => ({ data: '' }))
        if (data) writeFileSync(join(FAILURES, `${scenarios.indexOf(s) + 1}.png`), Buffer.from(data, 'base64'))
      } finally {
        await page.send('Page.close').catch(() => {})
      }
    }
  } finally {
    await browser.close()
    await stopServer()
  }
  if (failed > 0) {
    console.log(`\n${failed} 件失敗しました（失敗時の画面: ${FAILURES}/）`)
    process.exit(1)
  }
  console.log('\ne2e OK')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
