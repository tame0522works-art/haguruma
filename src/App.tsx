import { useMemo, useState } from 'react'
import { rat, type Rational } from './engine/rational.ts'
import { stars as starsOf } from './engine/score.ts'
import { evaluate, type Issue } from './engine/train.ts'
import { nextHint, type Hint } from './puzzles/hint.ts'
import { puzzles } from './puzzles/index.ts'
import type { Layer, Placement, Puzzle, Teeth } from './puzzles/types.ts'
import { loadProgress, loadSpin, saveSpin, saveStars, type Progress } from './storage.ts'
import { Board, roleOf } from './ui/Board.tsx'
import { gearPath } from './ui/gearPath.ts'

export default function App() {
  const [progress, setProgress] = useState<Progress>(loadProgress)
  const [current, setCurrent] = useState<number | null>(null)
  // 動きを減らす設定（Windows のアニメーション効果オフなど）では回さずに矢印で示す。本人が選べば回す
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [spin, setSpin] = useState(loadSpin)

  if (current === null) return <Menu progress={progress} onPick={setCurrent} />
  const puzzle = puzzles[current]
  return (
    <Play
      key={puzzle.id}
      index={current}
      puzzle={puzzle}
      bestBefore={progress[puzzle.id] ?? 0}
      onSolved={(s) => setProgress((p) => saveStars(p, puzzle.id, s))}
      onBack={() => setCurrent(null)}
      onNext={current + 1 < puzzles.length ? () => setCurrent(current + 1) : null}
      reduced={reduced}
      spin={spin}
      onSpin={(s) => {
        setSpin(s)
        saveSpin(s)
      }}
    />
  )
}

const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n)

function Menu({ progress, onPick }: { progress: Progress; onPick: (i: number) => void }) {
  const total = puzzles.reduce((s, p) => s + (progress[p.id] ?? 0), 0)
  return (
    <main className="menu">
      <header>
        <h1>haguruma</h1>
        <p className="lead">軸に歯車を置いて、出力の軸を決められた向きと速さで回すパズル。</p>
        <p className="muted">
          ★ {total} / {puzzles.length * 3}
        </p>
      </header>
      <ol className="levels">
        {puzzles.map((p, i) => {
          const s = progress[p.id] ?? 0
          return (
            <li key={p.id}>
              <button type="button" className={s ? 'done' : undefined} onClick={() => onPick(i)} aria-label={`${i + 1}問目 ${p.title}${s ? `、★${s}` : ''}`}>
                <span className="num">{i + 1}</span>
                <span className="name">{p.title}</span>
                <span className="check" aria-hidden="true">
                  {s ? starText(s) : ''}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <footer className="muted">記録はこの端末のブラウザにだけ保存します。</footer>
    </main>
  )
}

/** 回転比を言葉にする。「逆向きに 1/2 の速さ」「同じ向きに 3倍」。 */
function describeRatio(r: Rational): string {
  if (r.n === 0) return '止まっている'
  const dir = r.n > 0 ? '同じ向き' : '逆向き'
  const m = rat(Math.abs(r.n), r.d)
  if (m.n === m.d) return `${dir}に同じ速さ`
  if (m.d === 1) return `${dir}に ${m.n}倍`
  return `${dir}に ${m.n}/${m.d} の速さ`
}

const ISSUE_TEXT: { [k in Issue['kind']]: string } = {
  collide: '赤い歯車どうしがぶつかっている。噛み合うのは、軸の間がちょうど2枚の半径の和のときだけ。',
  covers: '歯車が、ほかの歯車の付いた軸にかぶさっている。',
  obstacle: '歯車が障害物に当たっている。',
  outside: '歯車が盤からはみ出している。',
  jam: '噛み合いの輪で回る向きか速さが食い違い、固まって動かない。',
  stock: 'この大きさの歯車はもう残っていない。',
  overlap: '同じ所に歯車が2枚ある。',
}

interface PlayProps {
  index: number
  puzzle: Puzzle
  bestBefore: number
  onSolved: (stars: 1 | 2 | 3) => void
  onBack: () => void
  onNext: (() => void) | null
  reduced: boolean
  spin: boolean
  onSpin: (spin: boolean) => void
}

function Play({ index, puzzle, bestBefore: bestAtStart, onSolved, onBack, onNext, reduced, spin, onSpin }: PlayProps) {
  // 解いた直後に記録が書き換わるので、開いた時点の値を持っておく
  const [bestBefore] = useState(bestAtStart)
  const [history, setHistory] = useState<Placement[][]>([[]])
  const [selected, setSelected] = useState<string | null>(null)
  const [layer, setLayer] = useState<Layer>(0)
  const [dismissed, setDismissed] = useState(false)
  const [hint, setHint] = useState<Hint | null>(null)
  const gears = history[history.length - 1]
  const ev = useMemo(() => evaluate(puzzle, gears), [puzzle, gears])
  const solved = ev.solved
  const stars = starsOf(gears.length, puzzle.best)

  const commit = (next: Placement[]) => {
    setHistory((h) => [...h, next])
    setHint(null)
    const r = evaluate(puzzle, next)
    if (r.solved) {
      onSolved(starsOf(next.length, puzzle.best))
      setSelected(null)
      setDismissed(false)
    }
  }

  const choose = (teeth: Teeth | null) => {
    if (!selected || solved) return
    const rest = gears.filter((g) => !(g.peg === selected && g.layer === layer))
    const before = gears.find((g) => g.peg === selected && g.layer === layer)
    if ((before?.teeth ?? null) === teeth) return
    commit(teeth === null ? rest : [...rest, { peg: selected, layer, teeth }])
  }

  const select = (peg: string) => {
    if (solved) return
    if (peg === selected) {
      setSelected(null)
      return
    }
    setSelected(peg)
    // ヒントの軸ならヒントの段を、下段が最初から埋まっている軸（入力・出力）なら上段を選んでおく
    const lowerFixed = puzzle.given.some((g) => g.peg === peg && g.layer === 0)
    setLayer(hint?.peg === peg ? hint.layer : puzzle.layers === 2 && lowerFixed ? 1 : 0)
  }

  const kinds = [...new Set(ev.issues.map((i) => i.kind))]
  const missing = ev.outputs.find((o) => !o.ok)
  let status: string
  if (solved) status = '目標どおりに回った。'
  else if (kinds.length) status = kinds.map((k) => ISSUE_TEXT[k]).join(' ')
  else if (missing && !ev.omega.has(missing.peg)) status = `${roleOf(puzzle, missing.peg)}（金の輪）まで回転が届いていない。`
  else if (missing?.omega) status = `${roleOf(puzzle, missing.peg)}はいま${describeRatio(missing.omega)}で回っている。`
  else status = ''

  return (
    <main className="play">
      <header className="top">
        <button type="button" className="ghost" onClick={onBack}>
          ← 一覧
        </button>
        <span className="title">
          {index + 1}. {puzzle.title}
        </span>
        <span className="meters">
          歯車 <b>{gears.length}</b> 枚（最少 {puzzle.best}）
        </span>
      </header>

      <p className="goal">
        目標:{' '}
        {puzzle.outputs.map((o, i) => (
          <span key={o.peg}>
            {i > 0 && '、'}
            {roleOf(puzzle, o.peg).replace('の軸', '')}を<b>{describeRatio(rat(o.ratio[0], o.ratio[1]))}</b>
          </span>
        ))}
        で回す
      </p>
      {puzzle.note && <p className="rule">{puzzle.note}</p>}

      <div className="stage">
        <Board puzzle={puzzle} gears={gears} ev={ev} selected={selected} hinted={hint?.peg ?? null} still={reduced && !spin} onSelect={select} />
      </div>

      {reduced && (
        <p className="motion-note">
          {spin ? '歯車を回して見せています。' : '端末の「動きを減らす」設定に合わせて、回さずに矢印で向きを示しています。'}
          <button type="button" className="ghost small" onClick={() => onSpin(!spin)}>
            {spin ? '矢印に戻す' : '回して見る'}
          </button>
        </p>
      )}
      <p className={`status${kinds.length ? ' bad' : ''}`} aria-live="polite">
        {status}
      </p>
      {hint && !solved && (
        <p className="hint-text" aria-live="polite">
          ヒント: {hintText(puzzle, hint)}
        </p>
      )}

      {selected && !solved ? (
        <Picker puzzle={puzzle} gears={gears} peg={selected} layer={layer} onLayer={setLayer} onChoose={choose} onClose={() => setSelected(null)} />
      ) : (
        <div className="legend" aria-hidden="true">
          <span>
            <i className="dot input" />
            入力の軸
          </span>
          <span>
            <i className="dot target" />
            出力の軸
          </span>
          {puzzle.obstacles && (
            <span>
              <i className="dot obstacle" />
              障害物
            </span>
          )}
          <span className="muted">濃い歯車は最初から付いていて外せない</span>
        </div>
      )}

      <div className="sub">
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setHistory((h) => h.slice(0, -1))
            setHint(null)
          }}
          disabled={history.length < 2 || solved}
        >
          1手戻す
        </button>
        {!solved && (
          <button
            type="button"
            className="ghost"
            onClick={() => {
              const h = nextHint(puzzle, gears)
              setHint(h)
              // 選ぶ欄がその軸で開いていれば、段もヒントに合わせる
              if (h && h.peg === selected) setLayer(h.layer)
            }}
          >
            ヒント
          </button>
        )}
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setHistory((h) => [h[0]])
            setSelected(null)
            setHint(null)
          }}
          disabled={history.length < 2}
        >
          最初から
        </button>
      </div>

      {solved && !dismissed && (
        <div className="clear" role="dialog" aria-label="完成">
          <p className="big" aria-label={`★${stars}`}>
            {starText(stars)}
          </p>
          <p>
            歯車 {gears.length} 枚で回った。
            {stars < 3 ? `最少は ${puzzle.best} 枚。` : '最少の枚数。'}
          </p>
          <p className="muted">{bestBefore >= stars ? `前に ★${bestBefore} を取っています。` : '記録しました。'}</p>
          <div className="row">
            <button type="button" className="ghost" onClick={() => setDismissed(true)}>
              回るところを見る
            </button>
            {onNext ? (
              <button type="button" onClick={onNext}>
                次の問題へ
              </button>
            ) : (
              <button type="button" onClick={onBack}>
                一覧へ
              </button>
            )}
          </div>
          {stars < 3 && (
            <button
              type="button"
              className="ghost retry"
              onClick={() => {
                setHistory((h) => h.slice(0, -1))
                setDismissed(true)
              }}
            >
              1手戻して、もっと少ない枚数を探す
            </button>
          )}
        </div>
      )}
    </main>
  )
}

interface PickerProps {
  puzzle: Puzzle
  gears: readonly Placement[]
  peg: string
  layer: Layer
  onLayer: (l: Layer) => void
  onChoose: (t: Teeth | null) => void
  onClose: () => void
}

function Picker({ puzzle, gears, peg, layer, onLayer, onChoose, onClose }: PickerProps) {
  const given = puzzle.given.find((g) => g.peg === peg && g.layer === layer)
  const current = given ?? gears.find((g) => g.peg === peg && g.layer === layer)
  const left = (t: Teeth) => {
    const limit = puzzle.stock?.[t]
    if (limit === undefined) return null
    return limit - gears.filter((g) => g.teeth === t && !(g.peg === peg && g.layer === layer)).length
  }
  const role = roleOf(puzzle, peg)

  return (
    <section className="picker" aria-label="置く歯車を選ぶ">
      <div className="picker-head">
        <span>{role}に置く</span>
        {puzzle.layers === 2 && (
          <span className="seg" role="radiogroup" aria-label="段">
            {([0, 1] as const).map((l) => (
              <button key={l} type="button" role="radio" aria-checked={layer === l} className={layer === l ? 'on' : undefined} onClick={() => onLayer(l)}>
                {l ? '上段' : '下段'}
              </button>
            ))}
          </span>
        )}
        <button type="button" className="close" onClick={onClose} aria-label="閉じる">
          ×
        </button>
      </div>
      {given ? (
        <p className="muted fixed-note">この段には最初から {given.teeth}枚歯 が付いていて外せない。</p>
      ) : (
        <div className="choices">
          <button type="button" className={!current ? 'on' : undefined} aria-pressed={!current} onClick={() => onChoose(null)}>
            <span className="none">なし</span>
          </button>
          {puzzle.teeth.map((t) => {
            const n = left(t)
            return (
              <button
                key={t}
                type="button"
                className={current?.teeth === t ? 'on' : undefined}
                aria-pressed={current?.teeth === t}
                disabled={n !== null && n <= 0}
                onClick={() => onChoose(t)}
                aria-label={`${t}枚歯${n !== null ? `、残り ${n}` : ''}`}
              >
                <svg viewBox="-13 -13 26 26" aria-hidden="true">
                  <path d={gearPath(t)} fillRule="evenodd" />
                </svg>
                <span>
                  {t}
                  {n !== null && <small> 残{n}</small>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

function hintText(puzzle: Puzzle, h: Hint): string {
  const where = `光っている${roleOf(puzzle, h.peg)}${puzzle.layers === 2 ? (h.layer ? 'の上段' : 'の下段') : ''}`
  if (h.teeth === null) return `${where}の歯車を外す（なくても解ける）`
  if (h.fix) return `${where}の歯車を ${h.teeth}枚歯 に替える`
  return `${where}に ${h.teeth}枚歯 を置く`
}
