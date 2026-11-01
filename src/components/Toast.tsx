import { create } from 'zustand'
import { newId } from '../types'
import Icon from './Icon'

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
  default: 'bg-ink text-ink-inverse',
  good: 'bg-moss text-moss-on',
  bad: 'bg-danger text-danger-on'
}
const TONE_ICON: Record<Tone, 'check' | 'check' | 'close'> = {
  default: 'check',
  good: 'check',
  bad: 'close'
}

export default function ToastHost() {
  const items = useToastStore((s) => s.items)
  return (
    <div className="pointer-events-none fixed inset-x-0 pt-safe z-[80] flex flex-col items-center gap-2 px-4">
      {items.map((i) => (
        <div
          key={i.id}
          className={`animate-slideUp flex max-w-[92vw] items-center gap-2 rounded-full px-4 py-2.5 text-body-sm font-medium shadow-pop ${
            TONE_STYLE[i.tone]
          }`}
        >
          <Icon name={TONE_ICON[i.tone]} size={15} weight={2.2} />
          <span className="truncate">{i.text}</span>
        </div>
      ))}
    </div>
  )
}
