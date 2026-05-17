'use client'
import { useState } from 'react'
import { usePanelStore } from '@/store/panelStore'
import { staticUrl } from '@/lib/api'
import PanelLightbox from './PanelLightbox'

export default function PanelSidebar() {
  const { panels } = usePanelStore()
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-800">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Saved Panels</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
        {panels.map((p, idx) => {
          const url = staticUrl(p.image_path)
          return (
            <div key={p.id} className="shrink-0 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 w-full cursor-pointer hover:border-zinc-600 transition-colors"
              onClick={() => setLightboxIndex(idx)}
              draggable onDragStart={e => e.dataTransfer.setData('panel_id', p.id)}>
              {url
                ? <img src={url} alt={p.user_prompt} className="w-full h-auto object-contain" />
                : <div className="w-full h-32 flex items-center justify-center text-zinc-600 text-xs">…</div>
              }
            </div>
          )
        })}
      </div>

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
