'use client'
import { useEffect, useState } from 'react'
import { useCharacterStore } from '@/store/characterStore'
import { staticUrl } from '@/lib/api'
import { User, Plus, Trash2, ChevronDown } from 'lucide-react'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import type { Character } from '@/types'

export default function CharacterSidebar() {
  const { characters, selected, fetch, setSelected, isLoading } = useCharacterStore()

  useEffect(() => { fetch() }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Characters</span>
        <span className="text-xs text-zinc-600">{characters.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading && <div className="flex justify-center py-4"><Spinner size={20} /></div>}
        {!isLoading && characters.length === 0 && (
          <p className="text-xs text-zinc-600 text-center py-6">No characters yet</p>
        )}
        {characters.map(char => (
          <button
            key={char.id}
            onClick={() => setSelected(char)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
              selected?.id === char.id
                ? 'bg-violet-600/20 border border-violet-500/40'
                : 'hover:bg-zinc-800 border border-transparent'
            }`}
          >
            {char.front_sheet_image_path ? (
              <img src={staticUrl(char.front_sheet_image_path)!} alt={char.name}
                className="w-8 h-8 rounded-full object-cover border border-zinc-700" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                <User size={14} className="text-zinc-500" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-200 truncate">{char.name}</p>
              <p className="text-xs text-zinc-600 truncate">{char.description.slice(0, 30)}…</p>
            </div>
            {char.sheet && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" title="Sheet ready" />}
          </button>
        ))}
      </div>
    </div>
  )
}
