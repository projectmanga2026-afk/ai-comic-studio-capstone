import { create } from 'zustand'
import axios from 'axios'
import { charactersApi, generationApi } from '@/lib/api'
import type { Character, GenerationJob } from '@/types'

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

interface CharacterStore {
  characters: Character[]
  selected: Character | null
  isLoading: boolean
  isGeneratingVariations: boolean
  isGeneratingSheet: boolean
  error: string | null

  fetch: () => Promise<void>
  create: (name: string, description: string, traits?: string) => Promise<Character>
  generateVariations: (id: string, onUpdate?: (j: GenerationJob) => void) => Promise<void>
  selectVariation: (characterId: string, variationId: string) => Promise<void>
  generateSheet: (id: string, onUpdate?: (j: GenerationJob) => void) => Promise<void>
  remove: (id: string) => Promise<void>
  setSelected: (c: Character | null) => void
  refresh: (id: string) => Promise<void>
}

export const useCharacterStore = create<CharacterStore>((set, get) => ({
  characters: [],
  selected: null,
  isLoading: false,
  isGeneratingVariations: false,
  isGeneratingSheet: false,
  error: null,

  fetch: async () => {
    set({ isLoading: true, error: null })
    try {
      const characters = await charactersApi.list()
      set({ characters, isLoading: false })
      // Keep selected in sync with fresh data
      const sel = get().selected
      if (sel) {
        const fresh = characters.find(c => c.id === sel.id)
        if (fresh) set({ selected: fresh })
      }
    } catch (e: unknown) {
      set({ isLoading: false, error: extractError(e) })
    }
  },

  create: async (name, description, traits) => {
    const char = await charactersApi.create({ name, description, visual_traits_summary: traits })
    set(s => ({ characters: [char, ...s.characters], selected: char }))
    return char
  },

  generateVariations: async (id, onUpdate) => {
    set({ isGeneratingVariations: true, error: null })
    try {
      const job = await charactersApi.generateVariations(id)
      await generationApi.pollJob(job.id, onUpdate)
    } catch (e: unknown) {
      set({ error: extractError(e) })
    } finally {
      // ALWAYS refresh — even if polling timed out the server may have
      // finished generating and saved the variations to the DB
      try { await get().refresh(id) } catch (_) {}
      set({ isGeneratingVariations: false })
    }
  },

  selectVariation: async (characterId, variationId) => {
    const char = await charactersApi.selectVariation(characterId, variationId)
    set(s => ({
      characters: s.characters.map(c => c.id === characterId ? char : c),
      selected: char,
    }))
  },

  generateSheet: async (id, onUpdate) => {
    set({ isGeneratingSheet: true, error: null })
    try {
      const job = await charactersApi.generateSheet(id)
      await generationApi.pollJob(job.id, onUpdate)
    } catch (e: unknown) {
      set({ error: extractError(e) })
    } finally {
      // ALWAYS refresh
      try { await get().refresh(id) } catch (_) {}
      set({ isGeneratingSheet: false })
    }
  },

  remove: async (id) => {
    await charactersApi.delete(id)
    set(s => ({
      characters: s.characters.filter(c => c.id !== id),
      selected: s.selected?.id === id ? null : s.selected,
    }))
  },

  // Always re-fetch from server — never use stale store object
  setSelected: async (c) => {
    if (!c) { set({ selected: null }); return }
    set({ selected: c }) // optimistic — show immediately
    try {
      const fresh = await charactersApi.get(c.id)
      set(s => ({
        selected: s.selected?.id === c.id ? fresh : s.selected,
        characters: s.characters.map(ch => ch.id === c.id ? fresh : ch),
      }))
    } catch (_) {}
  },

  refresh: async (id) => {
    const char = await charactersApi.get(id)
    set(s => ({
      characters: s.characters.map(c => c.id === id ? char : c),
      selected: s.selected?.id === id ? char : s.selected,
    }))
  },
}))
