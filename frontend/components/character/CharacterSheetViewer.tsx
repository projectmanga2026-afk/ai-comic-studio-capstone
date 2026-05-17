'use client'
import { useState, useEffect } from 'react'
import { staticUrl } from '@/lib/api'
import { Maximize2, X, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import Button from '@/components/ui/Button'
import type { CharacterSheet } from '@/types'

const VIEWS = [
  { key: 'front_image_path' as const,         label: 'Front' },
  { key: 'side_image_path' as const,          label: 'Side' },
  { key: 'back_image_path' as const,          label: 'Back' },
  { key: 'three_quarter_image_path' as const, label: '3/4 View' },
  { key: 'face_closeup_image_path' as const,  label: 'Face' },
]

export default function CharacterSheetViewer({
  sheet, onRegenerate, isRegenerating, cacheKey,
}: {
  sheet: CharacterSheet
  onRegenerate?: () => void
  isRegenerating?: boolean
  cacheKey?: string
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // Bust browser cache after regeneration by appending ?v=cacheKey to image URLs
  const bust = (url: string | null) => url ? `${url}?v=${encodeURIComponent(cacheKey ?? '')}` : null

  // Build list of views that have an actual image
  const availableViews = VIEWS.filter(v => !!staticUrl(sheet[v.key]))

  // Keyboard navigation
  useEffect(() => {
    if (lightboxIndex === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')      setLightboxIndex(null)
      if (e.key === 'ArrowRight')  setLightboxIndex(i => i !== null ? Math.min(i + 1, availableViews.length - 1) : null)
      if (e.key === 'ArrowLeft')   setLightboxIndex(i => i !== null ? Math.max(i - 1, 0) : null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, availableViews.length])

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-300">Character Sheet</h3>
        {onRegenerate && (
          <Button
            onClick={onRegenerate}
            loading={isRegenerating}
            variant="secondary"
            icon={<RefreshCw size={13} />}
          >
            Regenerate Sheet
          </Button>
        )}
      </div>
      <div className="grid grid-cols-5 gap-3">
        {VIEWS.map((view, idx) => {
          const path = sheet[view.key]
          const url = bust(staticUrl(path))
          // Index within availableViews for lightbox
          const lightboxIdx = availableViews.findIndex(v => v.key === view.key)
          return (
            <div key={view.key} className="space-y-2">
              <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700 group">
                {url ? (
                  <>
                    <img
                      src={url}
                      alt={view.label}
                      className="w-full h-full object-contain bg-white"
                    />
                    {/* Expand icon on hover */}
                    <button
                      onClick={() => setLightboxIndex(lightboxIdx)}
                      className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-black/85 rounded-lg p-1 opacity-0 group-hover:opacity-100 transition-all duration-200 backdrop-blur-sm"
                      title="Enlarge"
                    >
                      <Maximize2 size={12} className="text-white" />
                    </button>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs text-center px-2">
                    {view.label}
                  </div>
                )}
              </div>
              <p className="text-xs text-center text-zinc-500">{view.label}</p>
            </div>
          )
        })}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && availableViews[lightboxIndex] && (
        <SheetLightbox
          views={availableViews}
          sheet={sheet}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          cacheKey={cacheKey}
        />
      )}
    </div>
  )
}

// ── Sheet Lightbox ───────────────────────────────────────────────────────────

function SheetLightbox({
  views, sheet, index, onClose, onNavigate, cacheKey,
}: {
  views: typeof VIEWS
  sheet: CharacterSheet
  index: number
  onClose: () => void
  onNavigate: (i: number) => void
  cacheKey?: string
}) {
  const view = views[index]
  const rawUrl = staticUrl(sheet[view.key])
  const url = rawUrl && cacheKey ? `${rawUrl}?v=${encodeURIComponent(cacheKey)}` : rawUrl
  const hasPrev = index > 0
  const hasNext = index < views.length - 1

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col items-center gap-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute -top-4 -right-4 z-10 bg-zinc-800 hover:bg-zinc-700 rounded-full p-1.5 transition-colors shadow-lg"
        >
          <X size={16} />
        </button>

        {/* Image + arrows */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => hasPrev && onNavigate(index - 1)}
            disabled={!hasPrev}
            className="p-2 rounded-full bg-zinc-800/80 hover:bg-zinc-700 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft size={22} />
          </button>

          <img
            src={url!}
            alt={view.label}
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

        {/* Footer — label + dots */}
        <div className="flex items-center gap-5">
          <span className="text-sm font-medium text-zinc-200">{view.label}</span>
          <div className="flex gap-2">
            {views.map((v, i) => (
              <button
                key={v.key}
                onClick={() => onNavigate(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === index ? 'bg-violet-400 scale-125' : 'bg-zinc-600 hover:bg-zinc-400'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
