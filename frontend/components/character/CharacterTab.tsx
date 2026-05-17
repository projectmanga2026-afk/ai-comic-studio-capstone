'use client'
import { useState, useEffect } from 'react'
import { useCharacterStore } from '@/store/characterStore'
import { staticUrl } from '@/lib/api'
import { Wand2, Check, Plus, RefreshCw, Maximize2, X, ChevronLeft, ChevronRight } from 'lucide-react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import CharacterSheetViewer from './CharacterSheetViewer'
import type { Character, CharacterVariation, GenerationJob } from '@/types'

export default function CharacterTab() {
  const { characters, selected, fetch, create, generateVariations, selectVariation,
    generateSheet, refresh, isGeneratingVariations, isGeneratingSheet } = useCharacterStore()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [traits, setTraits] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [jobStatus, setJobStatus] = useState<string>('')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [sheetVersion, setSheetVersion] = useState(0)  // bumped after every sheet regeneration

  useEffect(() => { fetch() }, [])

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (lightboxIndex === null || !selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIndex(null)
      if (e.key === 'ArrowRight') setLightboxIndex(i => i !== null ? Math.min(i + 1, selected.variations.length - 1) : null)
      if (e.key === 'ArrowLeft')  setLightboxIndex(i => i !== null ? Math.max(i - 1, 0) : null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, selected])

  const handleCreate = async () => {
    if (!name.trim() || !description.trim()) return
    setIsCreating(true)
    try {
      const char = await create(name.trim(), description.trim(), traits.trim() || undefined)
      setName(''); setDescription(''); setTraits('')
      await generateVariations(char.id, (j: GenerationJob) => setJobStatus(j.status))
    } finally {
      setIsCreating(false); setJobStatus('')
    }
  }

  const handleSelectVariation = async (charId: string, varId: string) => {
    await selectVariation(charId, varId)
  }

  const handleGenerateSheet = async () => {
    if (!selected) return
    await generateSheet(selected.id, (j: GenerationJob) => setJobStatus(j.status))
    setSheetVersion(v => v + 1)  // force image cache bust
  }

  const handleRefresh = async () => {
    if (selected) await refresh(selected.id)
    else await fetch()
  }

  const handleRegenerateVariations = async () => {
    if (!selected) return
    await generateVariations(selected.id, (j: GenerationJob) => setJobStatus(j.status))
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-8 animate-fade-in">
      {/* Create new character form */}
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Plus size={18} className="text-violet-400" /> Create Character
        </h2>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 max-w-2xl">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Character Name *</label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Clara" maxLength={60}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Visual Traits (optional)</label>
              <input value={traits} onChange={e => setTraits(e.target.value)}
                placeholder="short hair, red coat…"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Description *</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Describe how this character looks — age, hair color, clothing, personality…"
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors resize-none" />
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleCreate}
              loading={isCreating || isGeneratingVariations}
              disabled={!name.trim() || !description.trim()}
              icon={<Wand2 size={15} />}
            >
              Generate Variations
            </Button>
            {jobStatus === 'running' && <span className="text-xs text-zinc-500">Generating…</span>}
          </div>
        </div>
      </section>

      {/* Selected character detail */}
      {selected && (
        <section className="animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{selected.name}</h2>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded-lg hover:bg-zinc-800"
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          {/* Variation grid */}
          {selected.variations.length > 0 ? (
            <div className="mb-6">
              <p className="text-sm text-zinc-400 mb-3">
                Select a design variation to use as the character reference:
              </p>
              <div className="grid grid-cols-4 gap-3">
                {selected.variations.map((v, idx) => (
                  <VariationCard
                    key={v.id} variation={v}
                    isSelected={v.is_selected}
                    onClick={() => handleSelectVariation(selected.id, v.id)}
                    onExpand={() => setLightboxIndex(idx)}
                  />
                ))}
              </div>
              {/* Regenerate button below the grid */}
              <div className="mt-4 flex items-center gap-3">
                <Button
                  onClick={handleRegenerateVariations}
                  loading={isGeneratingVariations}
                  variant="secondary"
                  icon={<RefreshCw size={14} />}
                >
                  Regenerate Variations
                </Button>
                {isGeneratingVariations && (
                  <span className="text-xs text-zinc-500 animate-pulse">
                    Generating new variations… ~30–60s
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="mb-6 p-4 rounded-xl border border-dashed border-zinc-700 text-center">
              <p className="text-sm text-zinc-500 mb-1">No variations yet.</p>
              <p className="text-xs text-zinc-600">
                {isGeneratingVariations
                  ? 'Generating… this can take 30–60 seconds on first run.'
                  : 'Fill in the form above and click Generate Variations, or click Refresh if you already generated them.'}
              </p>
            </div>
          )}

          {/* Sheet generation */}
          {selected.variations.some(v => v.is_selected) && !selected.sheet && (
            <div className="flex items-center gap-3 mb-6">
              <Button
                onClick={handleGenerateSheet}
                loading={isGeneratingSheet}
                variant="secondary"
                icon={<Wand2 size={15} />}
              >
                Generate Character Sheet
              </Button>
              <p className="text-xs text-zinc-500">Creates 5 views: front, side, back, 3/4, face</p>
            </div>
          )}

          {/* Sheet viewer */}
          {selected.sheet && <CharacterSheetViewer sheet={selected.sheet} onRegenerate={handleGenerateSheet} isRegenerating={isGeneratingSheet} cacheKey={String(sheetVersion)} />}
        </section>
      )}

      {/* All characters overview */}
      {characters.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-zinc-400 mb-3">All Characters ({characters.length})</h2>
          <div className="grid grid-cols-3 gap-4">
            {characters.map(c => <CharacterMiniCard key={c.id} character={c} />)}
          </div>
        </section>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && selected && selected.variations[lightboxIndex] && (
        <Lightbox
          variations={selected.variations}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onSelect={(v) => { handleSelectVariation(selected.id, v.id); setLightboxIndex(null) }}
        />
      )}
    </div>
  )
}

// ── Lightbox ────────────────────────────────────────────────────────────────

function Lightbox({
  variations, index, onClose, onNavigate, onSelect,
}: {
  variations: CharacterVariation[]
  index: number
  onClose: () => void
  onNavigate: (i: number) => void
  onSelect: (v: CharacterVariation) => void
}) {
  const v = variations[index]
  const url = staticUrl(v.image_path)
  const hasPrev = index > 0
  const hasNext = index < variations.length - 1

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col items-center gap-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-4 -right-4 z-10 bg-zinc-800 hover:bg-zinc-700 rounded-full p-1.5 transition-colors shadow-lg"
        >
          <X size={16} />
        </button>

        {/* Image row with arrows */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => hasPrev && onNavigate(index - 1)}
            disabled={!hasPrev}
            className="p-2 rounded-full bg-zinc-800/80 hover:bg-zinc-700 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft size={22} />
          </button>

          <img
            src={url}
            alt={`Variation ${v.variation_index + 1}`}
            className="max-h-[75vh] max-w-[65vw] object-contain rounded-2xl shadow-2xl bg-white"
          />

          <button
            onClick={() => hasNext && onNavigate(index + 1)}
            disabled={!hasNext}
            className="p-2 rounded-full bg-zinc-800/80 hover:bg-zinc-700 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight size={22} />
          </button>
        </div>

        {/* Footer — dots + select */}
        <div className="flex items-center gap-5">
          <span className="text-sm text-zinc-400">
            Var {v.variation_index + 1} of {variations.length}
          </span>
          <div className="flex gap-2">
            {variations.map((_, i) => (
              <button
                key={i}
                onClick={() => onNavigate(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === index ? 'bg-violet-400 scale-125' : 'bg-zinc-600 hover:bg-zinc-400'
                }`}
              />
            ))}
          </div>
          <Button onClick={() => onSelect(v)} icon={<Check size={14} />}>
            {v.is_selected ? 'Selected ✓' : 'Select this'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── VariationImage — shows a skeleton while loading, fades in when done ──────

function VariationImage({ url, index }: { url: string; index: number }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="relative w-full h-full bg-zinc-800">
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 animate-pulse">
          <div className="w-8 h-8 rounded-full border-2 border-zinc-600 border-t-violet-500 animate-spin" />
          <span className="text-xs text-zinc-600">Var {index + 1}</span>
        </div>
      )}
      <img
        src={url}
        alt={`Variation ${index + 1}`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-contain transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  )
}

// ── VariationCard ────────────────────────────────────────────────────────────

function VariationCard({ variation, isSelected, onClick, onExpand }: {
  variation: CharacterVariation
  isSelected: boolean
  onClick: () => void
  onExpand: () => void
}) {
  const url = staticUrl(variation.image_path)
  return (
    <div className={`relative rounded-xl overflow-hidden border-2 transition-all aspect-[3/4] group ${
      isSelected ? 'border-violet-500 shadow-lg shadow-violet-500/30' : 'border-zinc-700 hover:border-zinc-500'
    }`}>
      {/* Thumbnail — click selects */}
      <button onClick={onClick} className="w-full h-full">
        {url
          ? <VariationImage url={url} index={variation.variation_index} />
          : <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-500">
              Variation {variation.variation_index + 1}
            </div>
        }
      </button>

      {/* Expand icon — appears on hover */}
      <button
        onClick={e => { e.stopPropagation(); onExpand() }}
        className="absolute top-2 right-2 bg-black/60 hover:bg-black/85 rounded-lg p-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 backdrop-blur-sm"
        title="Enlarge"
      >
        <Maximize2 size={13} className="text-white" />
      </button>

      {isSelected && (
        <div className="absolute top-2 left-2 bg-violet-500 rounded-full p-0.5">
          <Check size={12} className="text-white" />
        </div>
      )}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 px-2 py-1.5">
        <p className="text-xs text-white font-medium">Var {variation.variation_index + 1}</p>
      </div>
    </div>
  )
}

function CharacterMiniCard({ character }: { character: Character }) {
  const { setSelected, selected } = useCharacterStore()
  const url = staticUrl(character.front_sheet_image_path)
  return (
    <Card
      hoverable selected={selected?.id === character.id}
      className="p-3 cursor-pointer"
      onClick={() => setSelected(character)}
    >
      <div className="flex items-center gap-3">
        {url
          ? <img src={url} alt={character.name} className="w-10 h-10 rounded-lg object-cover" />
          : <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-600">?</div>
        }
        <div>
          <p className="text-sm font-medium">{character.name}</p>
          <p className="text-xs text-zinc-500">{character.sheet ? '✓ Sheet ready' : 'No sheet'}</p>
        </div>
      </div>
    </Card>
  )
}
