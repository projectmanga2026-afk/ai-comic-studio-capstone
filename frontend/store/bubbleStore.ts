import { create } from 'zustand'
import { bubblesApi } from '@/lib/api'
import type { SpeechBubble, BubbleType, BubbleStyle } from '@/types'
import { debounce } from '@/lib/utils'

interface BubbleStore {
  bubbles: SpeechBubble[]
  selected: SpeechBubble | null
  pageId: string | null
  isLoading: boolean

  isEditingText: boolean

  setPageId: (id: string) => void
  fetch: (pageId: string) => Promise<void>
  add: (type: BubbleType, style: BubbleStyle, x: number, y: number, overrides?: Partial<SpeechBubble>) => Promise<SpeechBubble>
  update: (id: string, data: Partial<SpeechBubble>) => void
  remove: (id: string) => Promise<void>
  setSelected: (b: SpeechBubble | null) => void
  setIsEditingText: (val: boolean) => void
}

export const useBubbleStore = create<BubbleStore>((set, get) => {
  const _persistUpdate = debounce(async (pageId: string, id: string, data: Partial<SpeechBubble>) => {
    try { await bubblesApi.update(pageId, id, data) } catch {}
  }, 500) as (pageId: string, id: string, data: Partial<SpeechBubble>) => void

  return {
    bubbles: [],
    selected: null,
    pageId: null,
    isLoading: false,
    isEditingText: false,

    setPageId: (id) => set({ pageId: id }),

    fetch: async (pageId) => {
      set({ isLoading: true, pageId })
      try {
        const bubbles = await bubblesApi.list(pageId)
        set({ bubbles, isLoading: false })
      } catch {
        set({ isLoading: false })
      }
    },

    add: async (type, style, x, y, overrides = {}) => {
      const { pageId } = get()
      if (!pageId) throw new Error('No page selected')
      const bubble = await bubblesApi.create(pageId, {
        bubble_type: type, style, x, y,
        width: 200, height: 120, z_index: get().bubbles.length + 10,
        ...overrides,
      })
      set(s => ({ bubbles: [...s.bubbles, bubble], selected: bubble }))
      return bubble
    },

    update: (id, data) => {
      set(s => {
        const bubbles = s.bubbles.map(b => b.id === id ? { ...b, ...data } : b)
        const selected = s.selected?.id === id ? { ...s.selected, ...data } : s.selected
        if (s.pageId) _persistUpdate(s.pageId, id, data)
        return { bubbles, selected }
      })
    },

    remove: async (id) => {
      const { pageId } = get()
      if (!pageId) return
      await bubblesApi.delete(pageId, id)
      set(s => ({
        bubbles: s.bubbles.filter(b => b.id !== id),
        selected: s.selected?.id === id ? null : s.selected,
      }))
    },

    setSelected: (b) => set({ selected: b }),
    setIsEditingText: (val) => set({ isEditingText: val }),
  }
})
