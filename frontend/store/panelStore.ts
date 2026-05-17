import { create } from 'zustand'
import axios from 'axios'
import { panelsApi, generationApi } from '@/lib/api'
import type { Panel, GenerationJob, PanelType, AspectRatio } from '@/types'

function extractError(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data
    if (typeof data === 'string') return data
    if (data?.detail) return typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
    if (data?.message) return data.message
    if (e.response) return `HTTP ${e.response.status}: ${e.response.statusText}`
    return `Network error — could not reach the API server (${e.message}). Check that the backend is running and NEXT_PUBLIC_API_URL is correct.`
  }
  return (e as Error).message ?? String(e)
}

interface PanelStore {
  panels: Panel[]
  isLoading: boolean
  isGenerating: boolean
  error: string | null
  lastJob: GenerationJob | null
  prompt: string
  panelType: PanelType
  aspectRatio: AspectRatio
  expandedPrompt: string | null

  setPrompt: (p: string) => void
  setPanelType: (t: PanelType) => void
  setAspectRatio: (r: AspectRatio) => void
  setExpandedPrompt: (p: string | null) => void
  fetch: () => Promise<void>
  generate: (onUpdate?: (j: GenerationJob) => void) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const usePanelStore = create<PanelStore>((set, get) => ({
  panels: [],
  isLoading: false,
  isGenerating: false,
  error: null,
  lastJob: null,
  prompt: '',
  panelType: 'character',
  aspectRatio: '2:3',
  expandedPrompt: null,

  setPrompt: (p) => set({ prompt: p }),
  setPanelType: (t) => set({ panelType: t }),
  setAspectRatio: (r) => set({ aspectRatio: r }),
  setExpandedPrompt: (p) => set({ expandedPrompt: p }),

  fetch: async () => {
    set({ isLoading: true })
    try {
      const panels = await panelsApi.list()
      set({ panels, isLoading: false })
    } catch (e: unknown) {
      set({ isLoading: false, error: extractError(e) })
    }
  },

  generate: async (onUpdate) => {
    const { prompt, panelType, aspectRatio } = get()
    if (!prompt.trim()) return
    set({ isGenerating: true, error: null, expandedPrompt: null })
    try {
      const job = await panelsApi.generate({ user_prompt: prompt, panel_type: panelType, aspect_ratio: aspectRatio })
      set({ lastJob: job })
      const finalJob = await generationApi.pollJob(job.id, (j) => {
        set({ lastJob: j })
        onUpdate?.(j)
      })
      if (finalJob.status === 'complete') {
        set({ expandedPrompt: finalJob.expanded_prompt })
        await get().fetch()
      } else {
        set({ error: finalJob.error || 'Generation failed' })
      }
    } catch (e: unknown) {
      set({ error: extractError(e) })
    } finally {
      set({ isGenerating: false })
    }
  },

  remove: async (id) => {
    await panelsApi.delete(id)
    set(s => ({ panels: s.panels.filter(p => p.id !== id) }))
  },
}))
