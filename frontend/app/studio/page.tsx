'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import TopNav from '@/components/layout/TopNav'
import LeftSidebar from '@/components/layout/LeftSidebar'
import RightSidebar from '@/components/layout/RightSidebar'
import CharacterTab from '@/components/character/CharacterTab'
import PanelTab from '@/components/panel/PanelTab'
import AssemblyTab from '@/components/assembly/AssemblyTab'
import TextTab from '@/components/text/TextTab'
import LibraryTab from '@/components/library/LibraryTab'
import type { StudioTab } from '@/types'

function StudioContent() {
  const params = useSearchParams()
  const [tab, setTab] = useState<StudioTab>((params.get('tab') || 'character') as StudioTab)

  return (
    <div className="flex flex-col h-screen bg-[#09090b] overflow-hidden">
      <TopNav activeTab={tab} onTabChange={setTab} />
      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar activeTab={tab} />
        <main className="flex-1 overflow-hidden relative">
          {tab === 'character' && <CharacterTab />}
          {tab === 'panel'     && <PanelTab />}
          {tab === 'assembly'  && <AssemblyTab />}
          {tab === 'text'      && <TextTab />}
          {tab === 'library'   && <LibraryTab />}
        </main>
        <RightSidebar activeTab={tab} />
      </div>
    </div>
  )
}


export default function StudioPage() {
  return (
    <Suspense>
      <StudioContent />
    </Suspense>
  )
}
