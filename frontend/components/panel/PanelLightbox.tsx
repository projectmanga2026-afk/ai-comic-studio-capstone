import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect } from 'react'
import { staticUrl } from '@/lib/api'
import type { Panel } from '@/types'

export default function PanelLightbox({
  panels, index, onClose, onNavigate,
}: {
  panels: Panel[]
  index: number
  onClose: () => void
  onNavigate: (i: number) => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     onClose()
      if (e.key === 'ArrowRight') onNavigate(Math.min(index + 1, panels.length - 1))
      if (e.key === 'ArrowLeft')  onNavigate(Math.max(index - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, panels.length, onClose, onNavigate])

  const panel = panels[index]
  const url = staticUrl(panel.image_path)
  const hasPrev = index > 0
  const hasNext = index < panels.length - 1

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col items-center gap-4 max-w-[95vw]"
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

          {url && (
            <img
              src={url}
              alt={panel.user_prompt}
              className="max-h-[80vh] max-w-[75vw] object-contain rounded-2xl shadow-2xl"
            />
          )}

          <button
            onClick={() => hasNext && onNavigate(index + 1)}
            disabled={!hasNext}
            className="p-2 rounded-full bg-zinc-800/80 hover:bg-zinc-700 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight size={22} />
          </button>
        </div>

        {/* Footer */}
        <div className="flex flex-col items-center gap-2 max-w-xl text-center">
          <p className="text-sm text-zinc-300 line-clamp-2">{panel.user_prompt}</p>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-violet-600/30 text-violet-300 px-2 py-0.5 rounded-full">{panel.panel_type}</span>
            <span className="text-xs bg-zinc-700/60 text-zinc-400 px-2 py-0.5 rounded-full">{panel.aspect_ratio}</span>
            <span className="text-xs text-zinc-600">{index + 1} / {panels.length}</span>
          </div>
          {/* Dot indicators */}
          {panels.length > 1 && (
            <div className="flex gap-1.5 mt-1">
              {panels.map((_, i) => (
                <button
                  key={i}
                  onClick={() => onNavigate(i)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === index ? 'bg-violet-400 scale-125' : 'bg-zinc-600 hover:bg-zinc-400'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
