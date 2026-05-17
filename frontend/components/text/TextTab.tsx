'use client'
import { useEffect, useState } from 'react'
import { useAssemblyStore } from '@/store/assemblyStore'
import { useBubbleStore } from '@/store/bubbleStore'
import EmptyState from '@/components/ui/EmptyState'
import ComicCanvas from '@/components/assembly/ComicCanvas'
import BubbleLayer from './BubbleLayer'
import type { SpeechBubble } from '@/types'
import { ArrowLeft, Save } from 'lucide-react'
import Button from '@/components/ui/Button'
import { saveThumbnail, savePageImage } from '@/lib/thumbnail'

export default function TextTab() {
  const { currentPage, pages, fetchPages, setCurrentPage } = useAssemblyStore()
  const { fetch, update, remove, selected, isEditingText, setIsEditingText, setSelected } = useBubbleStore()
  const [editText, setEditText] = useState('')

  // Also import saveLayout for the Save button (from assemblyStore)
  const { saveLayout } = useAssemblyStore()

  useEffect(() => { fetchPages() }, [])
  useEffect(() => {
    if (currentPage) fetch(currentPage.id)
  }, [currentPage?.id])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selected && !isEditingText) {
        remove(selected.id)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selected, isEditingText, remove])

  // When edit modal opens, prepopulate text
  useEffect(() => {
    if (isEditingText && selected) {
      setEditText(selected.text || '')
    }
  }, [isEditingText, selected])

  if (!currentPage) {
    return (
      <div className="h-full overflow-y-auto flex flex-col items-center justify-start gap-6 p-8 animate-fade-in relative">
        <EmptyState icon="💬" title="No page open"
          description="Select an existing page to start adding speech bubbles and text." />
        
        {pages.length > 0 && (
          <div className="w-72 flex flex-col items-center">
            <div className="w-full border-t border-zinc-800 pt-4 mt-2">
              <p className="text-xs text-zinc-500 mb-2">Open existing page:</p>
              <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                {pages.map(p => (
                  <button key={p.id} onClick={() => setCurrentPage(p)}
                    className="w-full text-left text-sm text-zinc-300 hover:text-white py-2 px-3 rounded-lg hover:bg-zinc-800 transition-colors truncate border border-transparent hover:border-zinc-700 shadow-sm bg-zinc-900/50">
                    {p.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-950/50">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setCurrentPage(null)}
            className="p-1.5 -ml-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Back to Pages"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="h-4 w-px bg-zinc-800 mx-1" />
          <h2 className="text-sm font-semibold text-zinc-200">Text & Bubbles — {currentPage.title}</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={async () => {
            await saveLayout()
            if (currentPage) {
              // Fire both in parallel: thumbnail (low-res base64) + full-res PNG to Drive
              await Promise.all([
                saveThumbnail(currentPage.id),
                savePageImage(currentPage.id),
              ])
            }
          }} icon={<Save size={14} />}>Save</Button>
          <Button variant="secondary" size="sm" icon={<Save size={14} />} id="export-btn">Export PNG</Button>
        </div>
      </div>
      
      <div
        className="flex-1 relative overflow-hidden bg-zinc-900/30 outline-none"
        tabIndex={0}
        onClick={(e) => { if (e.target === e.currentTarget) setSelected(null) }}
      >
        <ComicCanvas onBackgroundClick={() => setSelected(null)}>
          <BubbleLayer setEditingBubble={(b) => {
            setIsEditingText(true)
          }} />
        </ComicCanvas>

        {/* Text editing overlay */}
        {isEditingText && selected && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-80 space-y-3 shadow-2xl">
              <h3 className="text-sm font-semibold text-zinc-200">Edit Bubble Text</h3>
              <textarea 
                value={editText} 
                onChange={e => setEditText(e.target.value)}
                rows={4} 
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    update(selected.id, { text: editText })
                    setIsEditingText(false)
                  }
                  if (e.key === 'Escape') setIsEditingText(false)
                }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 resize-none focus:outline-none focus:border-violet-500 shadow-inner" 
              />
              <p className="text-[10px] text-zinc-500 text-right mt-1">Press Enter to save, Shift+Enter for new line</p>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => {
                  update(selected.id, { text: editText })
                  setIsEditingText(false)
                }} className="flex-1">
                  Save
                </Button>
                <Button onClick={() => setIsEditingText(false)}
                  variant="secondary" className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
