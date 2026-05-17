'use client'
import type { StudioTab } from '@/types'
import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import CharacterSidebar from '@/components/character/CharacterSidebar'
import PanelSidebar from '@/components/panel/PanelSidebar'
import AssemblySidebar from '@/components/assembly/AssemblySidebar'
import BubbleSidebar from '@/components/text/BubbleSidebar'

interface Props { activeTab: StudioTab }

export default function LeftSidebar({ activeTab }: Props) {
  const [isOpen, setIsOpen] = useState(true)

  if (!isOpen) {
    return (
      <aside className="w-12 flex-shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col items-center py-4 relative z-10 transition-all duration-300">
        <button 
          onClick={() => setIsOpen(true)} 
          className="absolute -right-3 top-4 w-6 h-6 bg-zinc-800 border border-zinc-700 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 z-50 shadow-lg cursor-pointer"
        >
          <ChevronRight size={14} />
        </button>
        <span className="text-xs tracking-widest text-zinc-600 mt-8" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
          {activeTab.toUpperCase()}
        </span>
      </aside>
    )
  }

  return (
    <aside className="w-64 flex-shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col overflow-visible relative z-10 transition-all duration-300">
      <button 
        onClick={() => setIsOpen(false)} 
        className="absolute -right-3 top-4 w-6 h-6 bg-zinc-800 border border-zinc-700 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 z-50 shadow-lg cursor-pointer"
      >
        <ChevronLeft size={14} />
      </button>
      
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'character' && <CharacterSidebar />}
        {activeTab === 'panel'     && <PanelSidebar />}
        {activeTab === 'assembly'  && <AssemblySidebar />}
        {activeTab === 'text'      && <BubbleSidebar />}
        {activeTab === 'library'   && <LibrarySidebar />}
      </div>
    </aside>
  )
}

function LibrarySidebar() {
  return (
    <div className="p-4 text-zinc-500 text-sm">
      <p className="font-semibold text-zinc-400 mb-2">Library</p>
      <p>All generated assets</p>
    </div>
  )
}
