// 画面は2週目に作る。いまはビルドが通るよう、問題の数だけ出しておく。
import { puzzles } from './puzzles/index.ts'

export default function App() {
  return <p>haguruma（準備中、{puzzles.length} 問）</p>
}
