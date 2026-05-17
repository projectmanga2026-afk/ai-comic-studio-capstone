'use client'
import { useEffect, useState } from 'react'
import { useAssemblyStore } from '@/store/assemblyStore'
import { usePanelStore } from '@/store/panelStore'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import ComicCanvas from './ComicCanvas'
import { Plus, Save, Download, Trash2, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react'
import { TEMPLATES as STORE_TEMPLATES } from '@/store/assemblyStore'
import { saveThumbnail } from '@/lib/thumbnail'

const TEMPLATE_LIST = [
  { id: '2-vertical',    label: '2 Panel — Vertical' },
  { id: '3-horizontal',  label: '3 Panel — Horizontal' },
  { id: '4-grid',        label: '4 Panel — Grid' },
  { id: 'manga-mixed',   label: 'Manga Mixed' },
  { id: 'custom',        label: 'Custom (Freeform)' },
]

export default function AssemblyTab() {
  const { currentPage, pages, createPage, fetchPages, setCurrentPage, saveLayout, isDirty, renamePage } = useAssemblyStore()
  const { fetch: fetchPanels } = usePanelStore()
  const [isCreating, setIsCreating] = useState(false)
  const [templateIndex, setTemplateIndex] = useState(2) // Default to 4-grid
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [warningModal, setWarningModal] = useState<{ action: () => void } | null>(null)

  useEffect(() => { fetchPages(); fetchPanels() }, [])

  const selectedTemplate = TEMPLATE_LIST[templateIndex]

  const handleCreate = async () => {
    setIsCreating(true)
    try { await createPage('Untitled Page', selectedTemplate.id) }
    finally { setIsCreating(false) }
  }

  const handleNavigateAway = (action: () => void) => {
    if (isDirty) {
      setWarningModal({ action })
    } else {
      action()
    }
  }

  if (!currentPage) {
    return (
      <div className="h-full overflow-y-auto flex flex-col items-center justify-start gap-6 p-8 animate-fade-in relative">
        <EmptyState icon="📐" title="No page open" description="Create a new comic page to start assembling panels" />
        <div className="space-y-4 w-72 flex flex-col items-center">
          <p className="text-sm text-zinc-400">Choose a template:</p>
          
          {/* Visual Carousel */}
          <div className="flex items-center gap-4 w-full justify-between">
            <button 
              onClick={() => setTemplateIndex(i => i > 0 ? i - 1 : TEMPLATE_LIST.length - 1)}
              className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 transition-colors"
            >
              <ChevronLeft size={20} />
            </button>

            <div className="flex flex-col items-center gap-3">
              <div className="w-32 h-44 bg-zinc-900 border-2 border-violet-500/50 rounded-xl relative overflow-hidden shadow-lg shadow-violet-500/10">
                {selectedTemplate.id === 'custom' ? (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-600 font-mono">
                    BLANK
                  </div>
                ) : (
                  STORE_TEMPLATES[selectedTemplate.id]?.map((slot, i) => (
                    <div 
                      key={i} 
                      className="absolute bg-zinc-800 border-[1px] border-zinc-900"
                      style={{
                        left: `${slot.x * 100}%`,
                        top: `${slot.y * 100}%`,
                        width: `${slot.width * 100}%`,
                        height: `${slot.height * 100}%`,
                      }}
                    />
                  ))
                )}
              </div>
              <p className="text-xs font-medium text-violet-300 bg-violet-500/10 px-3 py-1 rounded-full">
                {selectedTemplate.label}
              </p>
            </div>

            <button 
              onClick={() => setTemplateIndex(i => i < TEMPLATE_LIST.length - 1 ? i + 1 : 0)}
              className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <Button onClick={handleCreate} loading={isCreating} className="w-full mt-4" icon={<Plus size={15} />}>
            Create Page
          </Button>

          {pages.length > 0 && (
            <div className="w-full border-t border-zinc-800 pt-4 mt-2">
              <p className="text-xs text-zinc-500 mb-2">Or open existing:</p>
              <div className="max-h-52 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                {pages.map(p => (
                  <button key={p.id} onClick={() => setCurrentPage(p)}
                    className="w-full text-left text-sm text-zinc-300 hover:text-white py-1.5 px-3 rounded-lg hover:bg-zinc-800 transition-colors truncate border border-transparent hover:border-zinc-700">
                    {p.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col relative">
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-950/50">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => handleNavigateAway(() => setCurrentPage(null))}
            className="p-1.5 -ml-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Back to Pages"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="h-4 w-px bg-zinc-800 mx-1" />
          {isEditingTitle ? (
            <input
              type="text"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              autoFocus
              onBlur={() => {
                setIsEditingTitle(false)
                if (editTitle.trim() && editTitle !== currentPage.title) {
                  renamePage(currentPage.id, editTitle.trim())
                }
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setIsEditingTitle(false)
              }}
              className="text-sm font-semibold bg-zinc-900 border border-violet-500/50 rounded px-2 py-0.5 outline-none text-white w-48"
            />
          ) : (
            <h2 
              className="text-sm font-semibold cursor-text hover:text-violet-300 transition-colors px-2 py-0.5 -ml-2 rounded hover:bg-zinc-800"
              onClick={() => {
                setEditTitle(currentPage.title)
                setIsEditingTitle(true)
              }}
              title="Click to rename"
            >
              {currentPage.title}
            </h2>
          )}
          {isDirty && <span className="text-xs text-amber-400">● Unsaved</span>}
          <button onClick={() => useAssemblyStore.getState().removePage(currentPage.id)} className="p-1 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors" title="Delete Page">
            <Trash2 size={14} />
          </button>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => handleNavigateAway(() => setCurrentPage(null))} icon={<Plus size={14} />}>New Page</Button>
          <Button variant="secondary" size="sm" onClick={async () => { await saveLayout(); if (currentPage) await saveThumbnail(currentPage.id) }} icon={<Save size={14} />}>Save</Button>
          <Button variant="secondary" size="sm" icon={<Download size={14} />} id="export-btn">Export PNG</Button>
        </div>
      </div>
      <div className="flex-1 relative overflow-hidden bg-zinc-900/30">
        <ComicCanvas />
      </div>

      {/* Unsaved Changes Modal */}
      {warningModal && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Unsaved Changes</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                You have unsaved layout changes on this page. Leaving will discard them. What would you like to do?
              </p>
            </div>
            <div className="flex flex-col gap-2 mt-2">
              <Button onClick={async () => {
                await saveLayout()
                setWarningModal(null)
                warningModal.action()
              }} className="w-full">
                Save & Leave
              </Button>
              <Button onClick={() => {
                setWarningModal(null)
                warningModal.action()
              }} variant="secondary" className="w-full !text-red-400 hover:!bg-red-400/10 hover:!border-red-400/50">
                Discard Changes
              </Button>
              <Button onClick={() => setWarningModal(null)} variant="secondary" className="w-full">
                Stay on Page
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
