import { create } from 'zustand'
import { pagesApi } from '@/lib/api'
import type { ComicPage, SlotData } from '@/types'

interface AssemblyStore {
  pages: ComicPage[]
  currentPage: ComicPage | null
  slots: SlotData[]
  selectedSlotId: string | null
  isLoading: boolean
  isDirty: boolean

  fetchPages: () => Promise<void>
  createPage: (title?: string, template?: string) => Promise<ComicPage>
  renamePage: (id: string, title: string) => Promise<void>
  setCurrentPage: (page: ComicPage | null) => void
  setSlots: (slots: SlotData[]) => void
  assignPanel: (slotId: string, panelId: string, imageUrl: string) => void
  saveLayout: () => Promise<void>
  initSlots: (template: string, canvasWidth: number, canvasHeight: number) => void
  removePage: (id: string) => Promise<void>

  // Slot Manipulation
  setSelectedSlotId: (id: string | null) => void
  addCustomSlot: (slot: SlotData) => void
  updateSlotTransform: (id: string, attrs: Partial<SlotData>) => void
  updateSlotImageState: (id: string, attrs: Partial<SlotData>) => void
  deleteSlot: (id: string, isCustomTemplate: boolean) => void
}

export const TEMPLATES: Record<string, Omit<SlotData, 'slot_id'>[]> = {
  '2-vertical': [
    { x: 0, y: 0, width: 1, height: 0.5 },
    { x: 0, y: 0.5, width: 1, height: 0.5 },
  ],
  '3-horizontal': [
    { x: 0, y: 0, width: 0.333, height: 1 },
    { x: 0.333, y: 0, width: 0.333, height: 1 },
    { x: 0.666, y: 0, width: 0.334, height: 1 },
  ],
  '4-grid': [
    { x: 0, y: 0, width: 0.5, height: 0.5 },
    { x: 0.5, y: 0, width: 0.5, height: 0.5 },
    { x: 0, y: 0.5, width: 0.5, height: 0.5 },
    { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
  ],
  'manga-mixed': [
    { x: 0, y: 0, width: 0.6, height: 0.55 },
    { x: 0.6, y: 0, width: 0.4, height: 0.35 },
    { x: 0.6, y: 0.35, width: 0.4, height: 0.2 },
    { x: 0, y: 0.55, width: 0.4, height: 0.45 },
    { x: 0.4, y: 0.55, width: 0.6, height: 0.45 },
  ],
}

export const useAssemblyStore = create<AssemblyStore>((set, get) => ({
  pages: [],
  currentPage: null,
  slots: [],
  selectedSlotId: null,
  isLoading: false,
  isDirty: false,

  fetchPages: async () => {
    set({ isLoading: true })
    try {
      const pages = await pagesApi.list()
      set({ pages, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  createPage: async (title = 'Untitled Page', template = '4-grid') => {
    const page = await pagesApi.create({ title, template })
    set(s => ({ pages: [page, ...s.pages], currentPage: page }))
    get().initSlots(template, page.canvas_width, page.canvas_height)
    return page
  },

  renamePage: async (id, title) => {
    try {
      const updated = await pagesApi.update(id, { title })
      set(s => ({
        pages: s.pages.map(p => p.id === id ? { ...p, title: updated.title } : p),
        currentPage: s.currentPage?.id === id ? { ...s.currentPage, title: updated.title } : s.currentPage
      }))
    } catch (e) {
      console.error('Failed to rename page', e)
    }
  },

  setCurrentPage: (page) => {
    set({ currentPage: page, isDirty: false })
    if (!page) {
      set({ slots: [] })
      return
    }
    const layout = page.layout?.layout_json
    if (layout?.slots?.length) {
      set({ slots: layout.slots })
    } else {
      get().initSlots(page.template, page.canvas_width, page.canvas_height)
    }
  },

  setSlots: (slots) => set({ slots, isDirty: true }),

  assignPanel: (slotId, panelId, imageUrl) => {
    set(s => ({
      slots: s.slots.map(sl =>
        sl.slot_id === slotId ? { ...sl, panel_id: panelId, panel_image_url: imageUrl } : sl
      ),
      isDirty: true,
    }))
  },

  saveLayout: async () => {
    const { currentPage, slots } = get()
    if (!currentPage) return
    await pagesApi.updateLayout(currentPage.id, { slots })
    set({ isDirty: false })
  },

  removePage: async (id) => {
    await pagesApi.delete(id)
    set(s => ({
      pages: s.pages.filter(p => p.id !== id),
      currentPage: s.currentPage?.id === id ? null : s.currentPage,
    }))
  },

  initSlots: (template, canvasWidth, canvasHeight) => {
    if (template === 'custom') {
      set({ slots: [] })
      return
    }
    const defs = TEMPLATES[template] || TEMPLATES['4-grid']
    const GAP = 8
    const slots: SlotData[] = defs.map((d, i) => ({
      slot_id: `slot-${i}`,
      x: d.x * canvasWidth + GAP / 2,
      y: d.y * canvasHeight + GAP / 2,
      width: d.width * canvasWidth - GAP,
      height: d.height * canvasHeight - GAP,
      scale: 1,
      rotation: 0,
      z_index: i + 1,
    }))
    set({ slots })
  },

  setSelectedSlotId: (id) => set({ selectedSlotId: id }),

  addCustomSlot: (slot) => set(s => ({ slots: [...s.slots, slot], isDirty: true })),

  updateSlotTransform: (id, attrs) => set(s => ({
    slots: s.slots.map(sl => sl.slot_id === id ? { ...sl, ...attrs } : sl),
    isDirty: true
  })),

  updateSlotImageState: (id, attrs) => set(s => ({
    slots: s.slots.map(sl => sl.slot_id === id ? { ...sl, ...attrs } : sl),
    isDirty: true
  })),

  deleteSlot: (id, isCustomTemplate) => set(s => {
    if (isCustomTemplate) {
      // Completely remove the slot
      return { slots: s.slots.filter(sl => sl.slot_id !== id), isDirty: true, selectedSlotId: s.selectedSlotId === id ? null : s.selectedSlotId }
    } else {
      // Just empty it
      return {
        slots: s.slots.map(sl => sl.slot_id === id ? { ...sl, panel_id: undefined, panel_image_url: undefined } : sl),
        isDirty: true,
        selectedSlotId: s.selectedSlotId === id ? null : s.selectedSlotId
      }
    }
  }),
}))
