'use client'
import { useBubbleStore } from '@/store/bubbleStore'
import { Trash2, FlipHorizontal } from 'lucide-react'

export default function BubbleSettings() {
  const { selected, update, remove, setIsEditingText } = useBubbleStore()
  if (!selected) return <div className="p-4 text-xs text-zinc-600">Select a bubble to edit</div>
  return (
    <div className="p-4 space-y-4 text-xs overflow-y-auto">
      <p className="font-semibold text-zinc-400 uppercase tracking-wider text-xs">Bubble Properties</p>
      <Row label="Type"><span className="capitalize text-zinc-200">{selected.bubble_type}</span></Row>
      <Row label="Style"><span className="capitalize text-zinc-200">{selected.style}</span></Row>

      <Row label="Font Family">
        <select value={selected.font_family || 'Bangers'} 
          onChange={e => update(selected.id, { font_family: e.target.value })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-xs">
          <option value="Bangers">Bangers</option>
          <option value="Comic Sans MS">Comic Sans</option>
          <option value="Arial">Arial</option>
          <option value="Impact">Impact</option>
          <option value="Courier New">Courier</option>
        </select>
      </Row>
      <Row label="Font Size">
        <input type="number" value={selected.font_size} min={10} max={120}
          onChange={e => update(selected.id, { font_size: parseInt(e.target.value) })}
          className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200" />
      </Row>
      <Row label="Text Color">
        <input type="color" value={selected.text_color}
          onChange={e => update(selected.id, { text_color: e.target.value })}
          className="w-8 h-8 rounded cursor-pointer bg-transparent border-0" />
      </Row>
      <Row label="Outline Color">
        <input type="color" value={selected.outline_color || '#18181b'}
          onChange={e => update(selected.id, { outline_color: e.target.value })}
          className="w-8 h-8 rounded cursor-pointer bg-transparent border-0" />
      </Row>
      <Row label="Outline Width">
        <input type="range" min={0} max={10} step={0.5} value={selected.outline_width ?? 2.5}
          onChange={e => update(selected.id, { outline_width: parseFloat(e.target.value) })}
          className="w-full" />
        <span className="text-zinc-500">{selected.outline_width ?? 2.5}</span>
      </Row>
      <Row label="Rotation">
        <input type="range" min={-45} max={45} value={selected.rotation}
          onChange={e => update(selected.id, { rotation: parseInt(e.target.value) })}
          className="w-full" />
        <span className="text-zinc-500">{selected.rotation}°</span>
      </Row>

      <div className="border-t border-zinc-800 pt-4 mt-4 space-y-2">
        <p className="text-zinc-500 text-xs">Text Content</p>
        <button 
          onClick={() => setIsEditingText(true)}
          className="w-full p-3 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:border-violet-500/50 text-left transition-colors group relative"
        >
          {selected.text ? (
            <p className="text-zinc-300 whitespace-pre-wrap leading-relaxed">{selected.text}</p>
          ) : (
            <p className="text-zinc-600 italic">No text yet...</p>
          )}
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-violet-600 text-white text-[10px] px-2 py-0.5 rounded uppercase font-bold">
            Edit
          </div>
        </button>
      </div>

      <div className="border-t border-zinc-800 pt-4 mt-4 space-y-2">
        <button onClick={() => update(selected.id, { flipped: !selected.flipped })}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors">
          <FlipHorizontal size={14} /> Flip Horizontal
        </button>
        <button onClick={() => remove(selected.id)}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-red-900/30 hover:bg-red-900/50 text-red-400 transition-colors">
          <Trash2 size={14} /> Delete Bubble
        </button>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-zinc-500">{label}</p>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

import React from 'react'
