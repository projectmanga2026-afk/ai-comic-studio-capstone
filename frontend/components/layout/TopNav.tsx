'use client'
import { User, ImageIcon, Layers, MessageSquare, BookOpen, Zap } from 'lucide-react'
import type { StudioTab } from '@/types'

const TABS: { id: StudioTab; label: string; icon: React.ReactNode }[] = [
  { id: 'character', label: 'Characters', icon: <User size={16} /> },
  { id: 'panel',     label: 'Panels',     icon: <ImageIcon size={16} /> },
  { id: 'assembly',  label: 'Assembly',   icon: <Layers size={16} /> },
  { id: 'text',      label: 'Text',       icon: <MessageSquare size={16} /> },
  { id: 'library',   label: 'Library',    icon: <BookOpen size={16} /> },
]

interface TopNavProps {
  activeTab: StudioTab
  onTabChange: (tab: StudioTab) => void
}

export default function TopNav({ activeTab, onTabChange }: TopNavProps) {
  return (
    <header className="flex items-center h-14 px-4 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm flex-shrink-0 z-10">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-8">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
          <Zap size={16} className="text-white" />
        </div>
        <span className="font-bold text-sm tracking-wide gradient-text">Comic Studio</span>
      </div>

      {/* Tabs */}
      <nav className="flex items-center gap-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150
              ${activeTab === tab.id
                ? 'bg-violet-600/20 text-violet-400 border border-violet-500/40'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }
            `}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Right side status */}
      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          API Connected
        </div>
      </div>
    </header>
  )
}
