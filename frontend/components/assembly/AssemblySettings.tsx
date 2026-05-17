'use client'
import { useAssemblyStore } from '@/store/assemblyStore'

export default function AssemblySettings() {
  const { currentPage, slots } = useAssemblyStore()
  if (!currentPage) return <div className="p-4 text-xs text-zinc-600">No page open</div>
  return (
    <div className="p-4 space-y-4 text-xs">
      <p className="font-semibold text-zinc-400 uppercase tracking-wider text-xs">Page Settings</p>
      <div><p className="text-zinc-500 mb-1">Title</p><p className="text-zinc-200">{currentPage.title}</p></div>
      <div><p className="text-zinc-500 mb-1">Template</p><p className="text-zinc-200 capitalize">{currentPage.template}</p></div>
      <div><p className="text-zinc-500 mb-1">Canvas</p><p className="text-zinc-200">{currentPage.canvas_width}×{currentPage.canvas_height}</p></div>
      <div><p className="text-zinc-500 mb-1">Slots filled</p><p className="text-zinc-200">{slots.filter(s => s.panel_id).length} / {slots.length}</p></div>
      <div className="border-t border-zinc-800 pt-3 text-zinc-600 leading-relaxed">
        Drag panels from the left sidebar into the canvas slots.
      </div>
    </div>
  )
}
