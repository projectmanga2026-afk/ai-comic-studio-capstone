'use client'
import { useRef, useEffect, useCallback, useState } from 'react'
import dynamic from 'next/dynamic'
import { useAssemblyStore } from '@/store/assemblyStore'
import { usePanelStore } from '@/store/panelStore'
import { staticUrl } from '@/lib/api'
import { Trash2, FlipHorizontal, ZoomIn, ZoomOut, Move, Hand, Minus, Plus } from 'lucide-react'
import type { SlotData } from '@/types'

const CANVAS_W = 800
const CANVAS_H = 1100

// ── Konva canvas — SSR-safe ────────────────────────────────────────────────────
// All Konva components must come from the same import and be used inside one Stage.
// Individual dynamic() per component breaks the React-Konva context (causes
// "Element type is invalid — received a Promise that resolves to: Layer").
const KonvaCanvas = dynamic(() => import('./KonvaCanvas'), {
  ssr: false,
  loading: () => (
    <div
      style={{ width: '100%', height: '100%', minHeight: 400, background: '#fff' }}
      className="flex items-center justify-center text-zinc-400 text-sm"
    >
      Loading canvas…
    </div>
  ),
})

export default function ComicCanvas({ children, onBackgroundClick }: { children?: React.ReactNode, onBackgroundClick?: () => void }) {
  const { currentPage, slots, assignPanel, addCustomSlot, selectedSlotId, deleteSlot, updateSlotImageState, setSelectedSlotId } = useAssemblyStore()
  const { panels } = usePanelStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<any>(null)
  const [scale, setScale] = useState(1)

  const canvasW = currentPage?.canvas_width || CANVAS_W
  const canvasH = currentPage?.canvas_height || CANVAS_H

  // Initial fit scaling
  useEffect(() => {
    if (!containerRef.current) return
    const { clientWidth, clientHeight } = containerRef.current
    const scaleX = (clientWidth - 48) / canvasW
    const scaleY = (clientHeight - 48) / canvasH
    setScale(Math.min(scaleX, scaleY, 1))
  }, [canvasW, canvasH, currentPage])

  // Handle drop from panel sidebar
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const panelId = e.dataTransfer.getData('panel_id')
    if (!panelId) return
    const panel = panels.find(p => p.id === panelId)
    if (!panel) return
    if (!wrapperRef.current) return
    
    const box = wrapperRef.current.getBoundingClientRect()
    
    const dropX = (e.clientX - box.left) / scale
    const dropY = (e.clientY - box.top) / scale
    
    const url = staticUrl(panel.image_path)
    if (!url) return

    if (currentPage?.template === 'custom') {
      let aspect = 1
      if (panel.aspect_ratio) {
        const [wStr, hStr] = panel.aspect_ratio.split(':')
        aspect = Number(wStr) / Number(hStr) || 1
      }
      
      const width = 300
      const height = width / aspect
      
      const newSlot: SlotData = {
        slot_id: `custom-${Date.now()}`,
        x: dropX - width / 2,
        y: dropY - height / 2,
        width,
        height,
        panel_id: panel.id,
        panel_image_url: url,
        z_index: slots.length + 1,
        scale: 1,
        rotation: 0
      }
      addCustomSlot(newSlot)
      setSelectedSlotId(newSlot.slot_id)
    } else {
      const targetSlot = slots.find(s =>
        dropX >= s.x && dropX <= s.x + s.width &&
        dropY >= s.y && dropY <= s.y + s.height
      )
      if (targetSlot) {
        assignPanel(targetSlot.slot_id, panelId, url)
        setSelectedSlotId(targetSlot.slot_id)
      }
    }
  }, [slots, panels, assignPanel, addCustomSlot, setSelectedSlotId, scale, currentPage])

  // Export handler
  useEffect(() => {
    const btn = document.getElementById('export-btn')
    if (!btn) return
    const handler = () => {
      if (stageRef.current) {
        const url = stageRef.current.toDataURL({ pixelRatio: 2 })
        const a = document.createElement('a')
        a.href = url
        a.download = `${currentPage?.title || 'comic-page'}.png`
        a.click()
      }
    }
    btn.addEventListener('click', handler)
    return () => btn.removeEventListener('click', handler)
  }, [currentPage])

  // Thumbnail/image capture — dispatched by saveThumbnail() and savePageImage() in lib/thumbnail.ts
  useEffect(() => {
    const handler = (e: Event) => {
      const { resolve, pixelRatio = 0.4, mimeType = 'jpeg', quality = 0.7 } = (e as CustomEvent).detail || {}
      if (stageRef.current) {
        const dataUrl = stageRef.current.toDataURL({
          pixelRatio,
          mimeType: `image/${mimeType}`,
          quality,
        })
        resolve?.(dataUrl)
      } else {
        resolve?.(null)
      }
    }
    window.addEventListener('comic-capture-thumbnail', handler)
    return () => window.removeEventListener('comic-capture-thumbnail', handler)
  }, [])

  const selectedSlot = selectedSlotId ? slots.find(s => s.slot_id === selectedSlotId) : null
  const isCustom = currentPage?.template === 'custom'

  return (
    <>
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-auto flex p-6"
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={(e) => { setSelectedSlotId(null); onBackgroundClick?.() }}
      >
        <div ref={wrapperRef} className="relative m-auto shrink-0" onClick={e => e.stopPropagation()}>
          <KonvaCanvas 
          stageRef={stageRef}
          slots={slots}
          canvasW={canvasW}
          canvasH={canvasH}
          scale={scale}
          isCustom={isCustom}
          onBackgroundClick={onBackgroundClick}
        >
          {children}
        </KonvaCanvas>  {/* Floating Toolbar */}
          {selectedSlot && (
            <div
              className="absolute flex flex-col gap-1 bg-zinc-900 border border-zinc-700 p-1.5 rounded-lg shadow-xl z-50 animate-fade-in"
              style={{
                top: selectedSlot.y * scale,
                left: (selectedSlot.x + selectedSlot.width) * scale + 12
              }}
            >
              {/* Delete */}
              <button title="Delete" onClick={() => deleteSlot(selectedSlot.slot_id, isCustom)} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-red-400 transition-colors">
                <Trash2 size={16} />
              </button>
              <div className="h-px bg-zinc-800 my-0.5" />

              {/* Pan / Move toggle (custom layout only) */}
              {isCustom && (
                <>
                  <button
                    title={selectedSlot.isPanMode ? "Switch to Move Panel Mode" : "Switch to Pan Image Mode"}
                    onClick={() => updateSlotImageState(selectedSlot.slot_id, { isPanMode: !selectedSlot.isPanMode })}
                    className={`p-1.5 rounded-md transition-colors ${selectedSlot.isPanMode ? 'bg-violet-500/20 text-violet-400' : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'}`}
                  >
                    {selectedSlot.isPanMode ? <Hand size={16} /> : <Move size={16} />}
                  </button>
                  <div className="h-px bg-zinc-800 my-0.5" />
                </>
              )}

              {/* Flip + Zoom (only when image is assigned) */}
              {selectedSlot.panel_image_url && (
                <>
                  <button title="Flip Horizontal" onClick={() => updateSlotImageState(selectedSlot.slot_id, { flipX: !selectedSlot.flipX })} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors">
                    <FlipHorizontal size={16} />
                  </button>
                  <div className="h-px bg-zinc-800 my-0.5" />
                  <button title="Zoom In" onClick={() => updateSlotImageState(selectedSlot.slot_id, { scale: Math.min((selectedSlot.scale || 1) + 0.1, 3) })} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors">
                    <ZoomIn size={16} />
                  </button>
                  <button title="Zoom Out" onClick={() => updateSlotImageState(selectedSlot.slot_id, { scale: Math.max((selectedSlot.scale || 1) - 0.1, 0.5) })} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors">
                    <ZoomOut size={16} />
                  </button>
                  <div className="h-px bg-zinc-800 my-0.5" />
                </>
              )}

              {/* ── Outline thickness ── */}
              <div className="flex flex-col items-center gap-0.5 px-0.5">
                <span className="text-[9px] text-zinc-500 uppercase tracking-wide leading-none mb-0.5">Border</span>
                <button title="Thicker" onClick={() => updateSlotImageState(selectedSlot.slot_id, { borderWidth: Math.min((selectedSlot.borderWidth ?? 2) + 1, 16) })} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors">
                  <Plus size={14} />
                </button>
                <span className="text-[11px] font-mono text-zinc-300 tabular-nums w-5 text-center">{selectedSlot.borderWidth ?? 2}</span>
                <button title="Thinner" onClick={() => updateSlotImageState(selectedSlot.slot_id, { borderWidth: Math.max((selectedSlot.borderWidth ?? 2) - 1, 0) })} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors">
                  <Minus size={14} />
                </button>
              </div>

              {/* ── Border color ── */}
              <div className="h-px bg-zinc-800 my-0.5" />
              <div className="flex flex-col items-center gap-1 px-0.5 pb-0.5">
                <span className="text-[9px] text-zinc-500 uppercase tracking-wide leading-none">Color</span>
                <input
                  type="color"
                  title="Border color"
                  value={selectedSlot.borderColor || '#27272a'}
                  onChange={e => updateSlotImageState(selectedSlot.slot_id, { borderColor: e.target.value })}
                  className="w-7 h-7 rounded cursor-pointer border border-zinc-700 bg-transparent p-0.5"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Global Canvas Zoom Controls */}
      <div className="absolute bottom-6 right-6 flex items-center gap-2 bg-zinc-900 border border-zinc-700 p-1.5 rounded-lg shadow-xl z-40">
        <button onClick={() => setScale(s => Math.max(0.1, s - 0.1))} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors">
          <ZoomOut size={16} />
        </button>
        <span className="text-xs font-mono w-12 text-center text-zinc-400">{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => Math.min(3, s + 0.1))} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors">
          <ZoomIn size={16} />
        </button>
      </div>
    </>
  )
}
