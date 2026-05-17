'use client'
import { useAssemblyStore } from '@/store/assemblyStore'
import { usePanelStore } from '@/store/panelStore'
import { staticUrl } from '@/lib/api'

export default function AssemblySidebar() {
  const { panels } = usePanelStore()
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-800">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Panel Library</p>
        <p className="text-xs text-zinc-600 mt-0.5">Drag panels onto the canvas</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
        {panels.map(p => {
          const url = staticUrl(p.image_path)
          return (
            <div key={p.id}
              draggable
              onDragStart={e => {
                e.dataTransfer.setData('panel_id', p.id)
                e.dataTransfer.setData('panel_url', url || '')
              }}
              className="shrink-0 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 cursor-grab active:cursor-grabbing hover:border-violet-500/50 transition-colors w-full">
              {url
                ? <img src={url} alt={p.user_prompt} className="w-full h-auto object-contain" />
                : <div className="w-full h-32 flex items-center justify-center text-zinc-600 text-xs">…</div>
              }
            </div>
          )
        })}
      </div>
    </div>
  )
}
