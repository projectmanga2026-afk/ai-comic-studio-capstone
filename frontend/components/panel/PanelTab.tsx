'use client'
import { useEffect, useRef, useState } from 'react'
import { usePanelStore } from '@/store/panelStore'
import { useCharacterStore } from '@/store/characterStore'
import { Wand2, Eye, Maximize2, X, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import Spinner from '@/components/ui/Spinner'
import { staticUrl, generationApi } from '@/lib/api'
import type { PanelType, AspectRatio, Panel } from '@/types'
import PanelLightbox from './PanelLightbox'

const PANEL_TYPES: { id: PanelType; label: string }[] = [
  { id: 'character', label: 'Character' },
  { id: 'scene', label: 'Scene' },
  { id: 'closeup', label: 'Close-up' },
  { id: 'wide', label: 'Wide Shot' },
  { id: 'action', label: 'Action' },
]
const RATIOS: { id: AspectRatio; label: string }[] = [
  { id: '1:1', label: '1:1 Square' },
  { id: '4:3', label: '4:3 Landscape' },
  { id: '16:9', label: '16:9 Wide' },
  { id: '2:3', label: '2:3 Portrait' },
  { id: '3:2', label: '3:2 Landscape' },
]

export default function PanelTab() {
  const { panels, isGenerating, prompt, panelType, aspectRatio, expandedPrompt,
    error, setPrompt, setPanelType, setAspectRatio, fetch, generate } = usePanelStore()
  const { characters } = useCharacterStore()
  const [showExpanded, setShowExpanded] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  useEffect(() => { fetch() }, [])

  return (
    <div className="h-full flex flex-col">
      {/* Prompt area */}
      <div className="p-5 border-b border-zinc-800 space-y-4 bg-zinc-950/50">
        <PanelPromptInput
          value={prompt}
          onChange={setPrompt}
          characters={characters.map(c => c.name)}
        />
        <div className="flex items-center gap-3 flex-wrap">
          {/* Panel type */}
          <select value={panelType} onChange={e => setPanelType(e.target.value as PanelType)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-violet-500">
            {PANEL_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          {/* Ratio */}
          <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value as AspectRatio)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-violet-500">
            {RATIOS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <Button onClick={() => generate()} loading={isGenerating} disabled={!prompt.trim()} icon={<Wand2 size={15} />}>
            Generate Panel
          </Button>
          {expandedPrompt && (
            <button onClick={() => setShowExpanded(!showExpanded)}
              className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors">
              <Eye size={13} /> {showExpanded ? 'Hide' : 'View'} Expanded Prompt
            </button>
          )}
        </div>
        {showExpanded && expandedPrompt && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-400 font-mono leading-relaxed animate-fade-in">
            {expandedPrompt}
          </div>
        )}
        {error && (
          <div className="relative bg-red-950/60 border border-red-800 rounded-xl p-3 text-xs text-red-300 font-mono animate-fade-in max-h-48 overflow-y-auto">
            <button
              onClick={() => usePanelStore.setState({ error: null })}
              className="sticky top-0 float-right ml-2 text-red-400 hover:text-red-200 transition-colors"
              title="Dismiss error"
            >✕</button>
            <span className="font-bold text-red-400">Generation error: </span>{error}
          </div>
        )}
      </div>

      {/* Panel gallery */}
      <div className="flex-1 overflow-y-auto p-5">
        {isGenerating && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 animate-fade-in">
            <Spinner size={36} />
            <p className="text-sm text-zinc-500">Generating panel…</p>
            {prompt.includes('@') && (
              <p className="text-xs text-zinc-600 max-w-xs text-center">
                Character injection detected — first run loads InstantID models into VRAM (~3–5 min). Subsequent generations are fast.
              </p>
            )}
          </div>
        )}
        {!isGenerating && panels.length === 0 && (
          <EmptyState icon="🎨" title="No panels yet" description="Write a prompt above and generate your first panel" />
        )}
        {panels.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {panels.map((p, idx) => (
              <PanelCard
                key={p.id}
                panel={p}
                onExpand={() => setLightboxIndex(idx)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && panels[lightboxIndex] && (
        <PanelLightbox
          panels={panels}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  )
}

// ── PanelCard ────────────────────────────────────────────────────────────────

function PanelCard({ panel, onExpand }: { panel: Panel; onExpand: () => void }) {
  const { remove } = usePanelStore()
  const url = staticUrl(panel.image_path)
  return (
    <div className="group relative rounded-xl overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-all bg-zinc-900">
      {url
        ? <img src={url} alt={panel.user_prompt} className="w-full object-cover" style={{ aspectRatio: panel.aspect_ratio.replace(':', '/') }} />
        : <div className="aspect-[2/3] bg-zinc-800 flex items-center justify-center text-zinc-600 text-xs">Loading…</div>
      }

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
        <p className="text-xs text-zinc-300 line-clamp-2">{panel.user_prompt}</p>
        <div className="flex items-center justify-between mt-2">
          <div className="flex gap-2">
            <span className="text-xs bg-violet-600/30 text-violet-300 px-2 py-0.5 rounded-full">{panel.panel_type}</span>
            <span className="text-xs bg-zinc-700/60 text-zinc-400 px-2 py-0.5 rounded-full">{panel.aspect_ratio}</span>
          </div>
          <button
            onClick={() => remove(panel.id)}
            className="p-1 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
            title="Delete panel"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Expand button */}
      <button
        onClick={e => { e.stopPropagation(); onExpand() }}
        className="absolute top-2 right-2 bg-black/60 hover:bg-black/85 rounded-lg p-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 backdrop-blur-sm"
        title="Enlarge"
      >
        <Maximize2 size={13} className="text-white" />
      </button>
    </div>
  )
}

function PanelPromptInput({ value, onChange, characters }: { value: string; onChange: (v: string) => void; characters: string[] }) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const taRef = useRef<HTMLTextAreaElement>(null)

  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget
    const text = ta.value.slice(0, ta.selectionStart ?? 0)
    const match = text.match(/@(\w*)$/)
    if (match) {
      const q = match[1].toLowerCase()
      setSuggestions(characters.filter(c => c.toLowerCase().startsWith(q)))
    } else {
      setSuggestions([])
    }
  }

  const insertMention = (name: string) => {
    if (!taRef.current) return
    const ta = taRef.current
    const before = value.slice(0, ta.selectionStart ?? 0).replace(/@\w*$/, '')
    const after = value.slice(ta.selectionStart ?? 0)
    onChange(before + `@${name} ` + after)
    setSuggestions([])
    ta.focus()
  }

  return (
    <div className="relative">
      <textarea ref={taRef} value={value} onChange={e => onChange(e.target.value)} onKeyUp={handleKeyUp}
        placeholder={'Describe your scene… use @CharacterName to include characters\ne.g. "@Clara stands on the left of a rainy street, @Leo runs toward her"'}
        rows={3}
        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors resize-none" />
      {suggestions.length > 0 && (
        <div className="absolute z-20 bottom-full mb-1 left-0 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden animate-fade-in">
          {suggestions.map(s => (
            <button key={s} onClick={() => insertMention(s)}
              className="w-full px-4 py-2.5 text-sm text-left hover:bg-zinc-700 text-zinc-200 flex items-center gap-2">
              <span className="text-violet-400">@</span>{s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
