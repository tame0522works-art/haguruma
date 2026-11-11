/**
 * 問題ごとのいちばん良い★を、この端末のブラウザ（localStorage）に置く。どこへも送らない。
 * 読めない・書けない（プライベートウィンドウなど）ときは、保存なしで動く。
 */
export type Progress = { readonly [id: string]: 1 | 2 | 3 }

const KEY = 'haguruma:progress:v1'

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const data = JSON.parse(raw) as unknown
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    const out: { [id: string]: 1 | 2 | 3 } = {}
    for (const [id, v] of Object.entries(data)) if (v === 1 || v === 2 || v === 3) out[id] = v
    return out
  } catch {
    return {}
  }
}

const MOTION_KEY = 'haguruma:motion:v1'

/** 動きを減らす設定の端末で、本人が「回して見る」を選んだか。 */
export function loadSpin(): boolean {
  try {
    return localStorage.getItem(MOTION_KEY) === 'spin'
  } catch {
    return false
  }
}

export function saveSpin(spin: boolean) {
  try {
    if (spin) localStorage.setItem(MOTION_KEY, 'spin')
    else localStorage.removeItem(MOTION_KEY)
  } catch {
    // 保存できなくても、開いているあいだは切り替えが効く
  }
}

export function saveStars(progress: Progress, id: string, stars: 1 | 2 | 3): Progress {
  if ((progress[id] ?? 0) >= stars) return progress
  const next = { ...progress, [id]: stars }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // 保存できなくても遊べる
  }
  return next
}
