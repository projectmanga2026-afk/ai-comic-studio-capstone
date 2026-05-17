'use client'
import type { StudioTab } from '@/types'
import CharacterSettings from '@/components/character/CharacterSettings'
import PanelSettings from '@/components/panel/PanelSettings'
import AssemblySettings from '@/components/assembly/AssemblySettings'
import BubbleSettings from '@/components/text/BubbleSettings'

interface Props { activeTab: StudioTab }

export default function RightSidebar({ activeTab }: Props) {
  return (
    <aside className="w-60 flex-shrink-0 border-l border-zinc-800 bg-zinc-950 flex flex-col overflow-y-auto">
      {activeTab === 'character' && <CharacterSettings />}
      {activeTab === 'panel'     && <PanelSettings />}
      {activeTab === 'assembly'  && <AssemblySettings />}
      {activeTab === 'text'      && <BubbleSettings />}
      {activeTab === 'library'   && <div className="p-4 text-zinc-500 text-sm">Export options</div>}
    </aside>
  )
}
