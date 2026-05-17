'use client'
import { usePanelStore } from '@/store/panelStore'

export default function PanelSettings() {
  const { panelType, aspectRatio, expandedPrompt } = usePanelStore()
  return (
    <div className="p-4 space-y-4 text-xs">
      <p className="font-semibold text-zinc-400 uppercase tracking-wider text-xs">Generation</p>
      <div><p className="text-zinc-500 mb-1">Type</p><p className="text-zinc-200 capitalize">{panelType}</p></div>
      <div><p className="text-zinc-500 mb-1">Aspect Ratio</p><p className="text-zinc-200">{aspectRatio}</p></div>
      <div className="border-t border-zinc-800 pt-4">
        <p className="text-zinc-500 mb-2">Tip: Use @Name to inject characters into your prompt</p>
        <p className="text-zinc-600 leading-relaxed">Characters with a sheet will use IP-Adapter FaceID + InstantID for consistency when ComfyUI is active.</p>
      </div>
    </div>
  )
}
