import React, { useState } from 'react'
import { useBubbleStore } from '@/store/bubbleStore'
import { useAssemblyStore } from '@/store/assemblyStore'
import type { BubbleType, BubbleStyle } from '@/types'
import { BUBBLE_SHAPES } from './BubbleLayer'
import { Type } from 'lucide-react'

const TEXT_PRESETS = [
  { label: 'Heading',  fontSize: 32, width: 220, height: 60,  hint: 'Large title text' },
  { label: 'Caption',  fontSize: 18, width: 200, height: 50,  hint: 'Smaller caption' },
  { label: 'Label',    fontSize: 14, width: 160, height: 40,  hint: 'Small label or credit' },
]

const BUBBLE_TYPES: { type: BubbleType; label: string; emoji: string }[] = [
  { type: 'speech1',    label: 'Speech 1',    emoji: '💬' },
  { type: 'speech2',    label: 'Speech 2',    emoji: '💬' },
  { type: 'speech3',    label: 'Speech 3',    emoji: '💬' },
  { type: 'thought',    label: 'Thought',     emoji: '💭' },
  { type: 'shout1',     label: 'Shout 1',     emoji: '📢' },
  { type: 'shout2',     label: 'Shout 2',     emoji: '📢' },
  { type: 'whisper1',   label: 'Whisper 1',   emoji: '🤫' },
  { type: 'whisper2',   label: 'Whisper 2',   emoji: '🤫' },
  { type: 'narration1', label: 'Narration 1', emoji: '📝' },
  { type: 'narration2', label: 'Narration 2', emoji: '📝' },
]

export default function BubbleSidebar() {
  const { add, selected, update } = useBubbleStore()
  const { currentPage } = useAssemblyStore()
  const style = 'modern'
  const [hoveredType, setHoveredType] = useState<BubbleType | null>(null)

  const handleAdd = (type: BubbleType) => {
    if (!currentPage) return
    add(type, style, 100 + Math.random() * 200, 100 + Math.random() * 200)
  }

  const handleAddText = (preset: typeof TEXT_PRESETS[0]) => {
    if (!currentPage) return
    // Use add() with plaintext type — extra props (font_size, width, height)
    // will be stored as the bubble's defaults via the store's add call
    add('plaintext', style,
      80 + Math.random() * 150,
      80 + Math.random() * 150,
      { font_size: preset.fontSize, width: preset.width, height: preset.height }
    )
  }

  // Scale down the 150x100 path to fit in a small box
  const renderPreview = () => {
    if (!hoveredType) return <div className="h-[100px] flex items-center justify-center"><p className="text-zinc-600 text-[10px]">Hover a bubble type to preview</p></div>
    
    const key = `${style}-${hoveredType}`
    const path = BUBBLE_SHAPES[key] || BUBBLE_SHAPES['modern-speech1']
    const scale = 0.8
    
    return (
      <div className="h-[100px] flex flex-col items-center justify-center animate-fade-in">
        <svg width={150 * scale} height={100 * scale} viewBox={`0 0 ${150} ${100}`} className="drop-shadow-lg">
          <path 
            d={path} 
            fill="white" 
            stroke="#18181b" 
            strokeWidth={3} 
            strokeDasharray={hoveredType?.startsWith('whisper') ? "8,6" : "none"} 
          />
        </svg>
        <p className="text-[10px] text-zinc-500 text-center mt-1 capitalize font-medium">{hoveredType}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full relative overflow-y-auto">

      {/* ── Plain Text section ── */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
          <Type size={11} /> Plain Text
        </p>
      </div>
      <div className="p-3 space-y-2 border-b border-zinc-800">
        {TEXT_PRESETS.map(preset => (
          <button
            key={preset.label}
            onClick={() => handleAddText(preset)}
            disabled={!currentPage}
            title={preset.hint}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900 hover:border-violet-500/50 hover:bg-zinc-800 transition-all text-sm text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="text-violet-400 font-bold" style={{ fontSize: preset.fontSize * 0.45 }}>A</span>
            <span className="flex-1 text-left">{preset.label}</span>
            <span className="text-[10px] text-zinc-600">{preset.fontSize}px</span>
          </button>
        ))}
      </div>

      {/* ── Speech Bubbles section ── */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Bubbles</p>
      </div>

      {/* Preview Area */}
      <div className="px-3 py-4 border-b border-zinc-800 bg-zinc-900/30 flex justify-center">
        {renderPreview()}
      </div>

      {/* Bubble type buttons */}
      <div className="p-3 space-y-2">
        {BUBBLE_TYPES.map(bt => (
          <button key={bt.type} onClick={() => handleAdd(bt.type)}
            disabled={!currentPage}
            onMouseEnter={() => setHoveredType(bt.type)}
            onMouseLeave={() => setHoveredType(null)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900 hover:border-violet-500/50 hover:bg-zinc-800 transition-all text-sm text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed">
            <span className="text-xl">{bt.emoji}</span>
            <span>{bt.label}</span>
          </button>
        ))}
      </div>
      <div className="px-4 pb-4 text-xs text-zinc-600 leading-relaxed">
        Click a bubble type to add it to the canvas. Drag to reposition. Click the <span className="text-violet-400">T</span> icon to edit text. Press Delete to remove.
      </div>
    </div>
  )
}


