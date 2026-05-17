'use client'
import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAssemblyStore } from '@/store/assemblyStore'
import { staticUrl } from '@/lib/api'
import type { ComicPage } from '@/types'

// ── Helpers ────────────────────────────────────────────────────────────────────
async function loadImageAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}

// ── PDF Export ─────────────────────────────────────────────────────────────────
async function exportToPDF(pages: ComicPage[], filename: string) {
  const { jsPDF } = await import('jspdf')

  const firstPage = pages[0]
  const canvasW = firstPage?.canvas_width || 800
  const canvasH = firstPage?.canvas_height || 1100
  const orientation = canvasW > canvasH ? 'landscape' : 'portrait'

  const pdf = new jsPDF({ orientation, unit: 'px', format: [canvasW, canvasH], hotfixes: ['px_scaling'] })

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    if (i > 0) pdf.addPage([canvasW, canvasH], orientation)

    // Priority: high-res Drive PNG > thumbnail base64 > blank placeholder
    const driveUrl = staticUrl(page.page_image_path)
    let imgDataUrl: string | null = null

    if (driveUrl) {
      try { imgDataUrl = await loadImageAsDataUrl(driveUrl) } catch { /* fall through */ }
    }
    if (!imgDataUrl && page.thumbnail_path) {
      imgDataUrl = page.thumbnail_path // base64 already
    }

    if (imgDataUrl) {
      const format = imgDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
      pdf.addImage(imgDataUrl, format, 0, 0, canvasW, canvasH)
    } else {
      pdf.setFillColor(20, 20, 24)
      pdf.rect(0, 0, canvasW, canvasH, 'F')
      pdf.setTextColor(120, 120, 140)
      pdf.setFontSize(32)
      pdf.text(page.title, canvasW / 2, canvasH / 2, { align: 'center' })
      pdf.setFontSize(18)
      pdf.text('Open in Text tab and press Save to generate page image.', canvasW / 2, canvasH / 2 + 60, { align: 'center' })
    }
  }

  pdf.save(filename)
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function LibraryTab() {
  const { pages, fetchPages, removePage, setCurrentPage } = useAssemblyStore()
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setLoading(true)
    fetchPages().finally(() => setLoading(false))
  }, [fetchPages])

  // Clear selection if pages change (e.g. after delete)
  useEffect(() => {
    setSelected(prev => {
      const pageIds = new Set(pages.map(p => p.id))
      const next = new Set([...prev].filter(id => pageIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [pages])

  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const selectAll = () => setSelected(new Set(pages.map(p => p.id)))
  const clearAll = () => setSelected(new Set())

  const handleExportPDF = async () => {
    const selectedPages = pages.filter(p => selected.has(p.id))
    if (selectedPages.length === 0) return
    setExporting(true)
    try {
      const filename = selectedPages.length === 1
        ? `${selectedPages[0].title}.pdf`
        : `comic-${selectedPages.length}-pages.pdf`
      await exportToPDF(selectedPages, filename)
    } finally {
      setExporting(false)
    }
  }

  const openInAssembly = (page: ComicPage) => {
    setCurrentPage(page)
    router.push('/studio?tab=assembly')
  }
  const openInText = (page: ComicPage) => {
    setCurrentPage(page)
    router.push('/studio?tab=text')
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    try { await removePage(id) }
    finally { setDeleting(null); setConfirmDelete(null) }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-500 text-sm">Loading pages…</p>
        </div>
      </div>
    )
  }

  // ── Empty ───────────────────────────────────────────────────────────────────
  if (pages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <div className="text-6xl mb-4">📖</div>
          <p className="text-zinc-300 text-lg font-semibold">No pages yet</p>
          <p className="text-zinc-500 text-sm max-w-xs">
            Head to the <span className="text-violet-400 font-medium">Assembly</span> tab to create your first comic page.
          </p>
          <button
            onClick={() => router.push('/studio?tab=assembly')}
            className="mt-4 px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Go to Assembly
          </button>
        </div>
      </div>
    )
  }

  const isAnySelected = selected.size > 0
  const allSelected = selected.size === pages.length

  // ── Main ────────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Sticky header ──────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-[#09090b]/95 backdrop-blur border-b border-zinc-800 px-8 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Left: title + count */}
          <div className="min-w-0">
            <h1 className="text-white font-semibold text-lg">Library</h1>
            <p className="text-zinc-500 text-xs mt-0.5">
              {pages.length} page{pages.length !== 1 ? 's' : ''} saved
              {isAnySelected && (
                <span className="text-violet-400 font-medium ml-1.5">
                  · {selected.size} selected
                </span>
              )}
            </p>
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Select-all / Clear */}
            <button
              onClick={allSelected ? clearAll : selectAll}
              className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition-all"
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>

            {/* Export PDF — only when something is selected */}
            {isAnySelected && (
              <button
                onClick={handleExportPDF}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-violet-900/40 animate-fade-in"
              >
                {exporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Generating PDF…
                  </>
                ) : (
                  <>
                    {/* PDF icon */}
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    </svg>
                    Export {selected.size} page{selected.size !== 1 ? 's' : ''} as PDF
                  </>
                )}
              </button>
            )}

            {/* New page */}
            {!isAnySelected && (
              <button
                onClick={() => router.push('/studio?tab=assembly')}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-xl transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Page
              </button>
            )}
          </div>
        </div>

        {/* Selection tip — shown when nothing is selected yet & more than 1 page */}
        {!isAnySelected && pages.length > 1 && (
          <p className="mt-2 text-[11px] text-zinc-600 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Tick the checkbox on any card to select pages for PDF export
          </p>
        )}
      </div>

      {/* ── Grid ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-8 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
          {pages.map(page => {
            const isSelected = selected.has(page.id)
            const isDeleting = deleting === page.id
            const isConfirming = confirmDelete === page.id

            return (
              <div
                key={page.id}
                className={`group relative bg-zinc-900 rounded-2xl overflow-hidden border-2 transition-all duration-200 flex flex-col
                  ${isSelected
                    ? 'border-violet-500 shadow-lg shadow-violet-900/40 scale-[1.02]'
                    : 'border-zinc-800 hover:border-zinc-700 hover:shadow-md hover:shadow-zinc-900/50'
                  }`}
              >
                {/* Thumbnail area — click to open OR if in selection mode to select */}
                <div
                  className="relative aspect-[3/4] bg-zinc-950 overflow-hidden cursor-pointer"
                  onClick={() => {
                    if (isAnySelected) {
                      // In selection mode, clicking thumbnail toggles selection
                      setSelected(prev => {
                        const next = new Set(prev)
                        next.has(page.id) ? next.delete(page.id) : next.add(page.id)
                        return next
                      })
                    }
                    // else: hover overlay handles open actions
                  }}
                >
                  {page.thumbnail_path ? (
                    <img
                      src={page.thumbnail_path}
                      alt={page.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <PagePlaceholder template={page.template} />
                  )}

                  {/* Selected overlay */}
                  {isSelected && (
                    <div className="absolute inset-0 bg-violet-600/20 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center shadow-lg">
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>
                  )}

                  {/* Hover actions (only shown when NOT in selection mode) */}
                  {!isAnySelected && (
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-4">
                      <button
                        onClick={e => { e.stopPropagation(); openInAssembly(page) }}
                        className="w-full py-1.5 bg-white/90 hover:bg-white text-zinc-900 text-xs font-semibold rounded-lg transition-colors"
                      >
                        Open in Assembly
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); openInText(page) }}
                        className="w-full py-1.5 bg-violet-600/90 hover:bg-violet-500 text-white text-xs font-semibold rounded-lg transition-colors"
                      >
                        Edit Bubbles
                      </button>
                    </div>
                  )}
                </div>

                {/* Card footer */}
                <div className="px-3 py-2.5 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-zinc-200 text-sm font-medium truncate">{page.title}</p>
                    <p className="text-zinc-600 text-xs mt-0.5">{formatDate(page.created_at)}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 bg-zinc-800 rounded-md text-zinc-400 text-[10px] font-mono capitalize">
                      {page.template}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
                    {/* Delete */}
                    {isConfirming ? (
                      <div className="flex gap-1">
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(page.id) }}
                          disabled={isDeleting}
                          className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-[10px] font-semibold rounded-md transition-colors disabled:opacity-50"
                        >
                          {isDeleting ? '…' : 'Yes'}
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setConfirmDelete(null) }}
                          className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-[10px] font-semibold rounded-md transition-colors"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmDelete(page.id) }}
                        className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors rounded-lg hover:bg-zinc-800"
                        title="Delete page"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}

                    {/* Checkbox — always visible in bottom-right */}
                    <button
                      onClick={e => toggleSelect(page.id, e)}
                      title={isSelected ? 'Deselect' : 'Select for PDF export'}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0
                        ${isSelected
                          ? 'bg-violet-600 border-violet-600'
                          : 'border-zinc-600 bg-zinc-800 hover:border-violet-400'
                        }`}
                    >
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Page layout placeholder ────────────────────────────────────────────────────
function PagePlaceholder({ template }: { template: string }) {
  const colors: Record<string, string[]> = {
    '2-vertical':   ['bg-violet-900/40', 'bg-indigo-900/40'],
    '3-horizontal': ['bg-violet-900/40', 'bg-indigo-900/40', 'bg-purple-900/40'],
    '4-grid':       ['bg-violet-900/40', 'bg-indigo-900/40', 'bg-purple-900/40', 'bg-fuchsia-900/40'],
    'manga-mixed':  ['bg-violet-900/40', 'bg-indigo-900/40', 'bg-purple-900/40', 'bg-fuchsia-900/40', 'bg-pink-900/40'],
    'custom':       ['bg-zinc-800/60'],
  }
  const blocks = colors[template] || colors['custom']

  return (
    <div className="w-full h-full flex flex-col p-3 gap-1.5">
      {template === '2-vertical' && (
        <> <div className={`flex-1 rounded-lg ${blocks[0]}`} /> <div className={`flex-1 rounded-lg ${blocks[1]}`} /> </>
      )}
      {template === '3-horizontal' && (
        <div className="flex gap-1.5 h-full">
          {blocks.map((c, i) => <div key={i} className={`flex-1 rounded-lg ${c}`} />)}
        </div>
      )}
      {template === '4-grid' && (
        <div className="grid grid-cols-2 gap-1.5 h-full">
          {blocks.map((c, i) => <div key={i} className={`rounded-lg ${c}`} />)}
        </div>
      )}
      {template === 'manga-mixed' && (
        <>
          <div className="flex gap-1.5 flex-1">
            <div className={`flex-[3] rounded-lg ${blocks[0]}`} />
            <div className="flex flex-col gap-1.5 flex-[2]">
              <div className={`flex-[2] rounded-lg ${blocks[1]}`} /> <div className={`flex-1 rounded-lg ${blocks[2]}`} />
            </div>
          </div>
          <div className="flex gap-1.5 flex-1">
            <div className={`flex-[2] rounded-lg ${blocks[3]}`} /> <div className={`flex-[3] rounded-lg ${blocks[4]}`} />
          </div>
        </>
      )}
      {!['2-vertical','3-horizontal','4-grid','manga-mixed'].includes(template) && (
        <div className={`flex-1 rounded-lg ${blocks[0]} flex items-center justify-center`}>
          <span className="text-zinc-600 text-xs">Custom</span>
        </div>
      )}
    </div>
  )
}
