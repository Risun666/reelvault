import { create } from 'zustand'
import { newId } from '../types'

type Tone = 'default' | 'good' | 'bad'

interface Item {
  id: string
  text: string
  tone: Tone
}

interface ToastState {
  items: Item[]
  push: (text: string, tone?: Tone) => void
  drop: (id: string) => void
}

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],
  push(text, tone = 'default') {
    const id = newId()
    set({ items: [...get().items, { id, text, tone }] })
    setTimeout(() => get().drop(id), 2600)
  },
  drop(id) {
    set({ items: get().items.filter((i) => i.id !== id) })
  }
}))

export const toast = (text: string, tone: Tone = 'default') => useToastStore.getState().push(text, tone)

const TONE_STYLE: Record<Tone, string> = {
  default: 'bg-ink/90 text-white',
  good: 'bg-moss text-white',
  bad: 'bg-reel text-white'
}

export default function ToastHost() {
  const items = useToastStore((s) => s.items)
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex flex-col items-center gap-2 px-4">
      {items.map((i) => (
        <div
          key={i.id}
          className={`fade-in max-w-[92vw] rounded-full px-4 py-2 text-[0.8125rem] shadow-lg ${TONE_STYLE[i.tone]}`}
        >
          {i.text}
        </div>
      ))}
    </div>
  )
}
