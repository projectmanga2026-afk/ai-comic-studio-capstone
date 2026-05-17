// KonvaCanvas.tsx — loaded only on client via dynamic() from ComicCanvas.tsx
// All react-konva components live here so they share one import context.
// Never import this directly — always go through ComicCanvas.tsx dynamic().
import React, { useState, useEffect, useRef } from 'react'
import { Stage, Layer, Rect, Image as KImage, Text, Group, Transformer } from 'react-konva'
import { useAssemblyStore } from '@/store/assemblyStore'
import type { SlotData } from '@/types'

interface Props {
  stageRef: React.MutableRefObject<any>
  slots: SlotData[]
  canvasW: number
  canvasH: number
  scale: number
  isCustom: boolean
  children?: React.ReactNode
  onBackgroundClick?: () => void
}

export default function KonvaCanvas({ stageRef, slots, canvasW, canvasH, scale, isCustom, children, onBackgroundClick }: Props) {
  const { selectedSlotId } = useAssemblyStore()

  return (
    <Stage
      ref={stageRef}
      width={canvasW * scale}
      height={canvasH * scale}
      scaleX={scale}
      scaleY={scale}
      style={{ background: '#fff', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}
    >
      <Layer>
        {/* White background — clicking here deselects everything */}
        <Rect x={0} y={0} width={canvasW} height={canvasH} fill="white"
          onClick={onBackgroundClick}
          onTap={onBackgroundClick}
        />
        {/* Slots */}
        {slots.map(slot => (
          <SlotRenderer 
            key={slot.slot_id} 
            slot={slot} 
            isCustom={isCustom} 
            isSelected={selectedSlotId === slot.slot_id} 
          />
        ))}
        {children}
      </Layer>
    </Stage>
  )
}

function SlotRenderer({ slot, isCustom, isSelected }: { slot: SlotData, isCustom: boolean, isSelected: boolean }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const groupRef = useRef<any>(null)
  const trRef = useRef<any>(null)
  const { setSelectedSlotId, updateSlotTransform, updateSlotImageState } = useAssemblyStore()

  useEffect(() => {
    if (isSelected && trRef.current && groupRef.current && isCustom) {
      trRef.current.nodes([groupRef.current])
      trRef.current.getLayer().batchDraw()
    }
  }, [isSelected, isCustom])

  useEffect(() => {
    if (!slot.panel_image_url) { setImg(null); return }
    const image = new window.Image()
    image.crossOrigin = 'anonymous'
    image.src = slot.panel_image_url
    image.onload = () => setImg(image)
  }, [slot.panel_image_url])

  return (
    <React.Fragment>
      <Group
        ref={groupRef}
        x={slot.x} y={slot.y}
        width={slot.width} height={slot.height}
        draggable={isCustom && !slot.isPanMode}
        onClick={() => setSelectedSlotId(slot.slot_id)}
        onTap={() => setSelectedSlotId(slot.slot_id)}
        onDragEnd={(e) => {
          if (isCustom && e.target === groupRef.current) {
            updateSlotTransform(slot.slot_id, { x: e.target.x(), y: e.target.y() })
          }
        }}
        onTransformEnd={(e) => {
          if (isCustom && groupRef.current) {
            const node = groupRef.current
            const scaleX = node.scaleX()
            const scaleY = node.scaleY()
            
            // We reset scale to 1 and apply transform to width/height directly
            node.scaleX(1)
            node.scaleY(1)
            
            updateSlotTransform(slot.slot_id, {
              x: node.x(),
              y: node.y(),
              width: Math.max(50, node.width() * scaleX),
              height: Math.max(50, node.height() * scaleY),
              rotation: node.rotation()
            })
          }
        }}
      >
        {/* Slot border */}
        <Rect
          x={0} y={0} width={slot.width} height={slot.height}
          fill={slot.panel_image_url ? 'transparent' : '#f4f4f5'}
          stroke={isSelected ? "#a855f7" : (slot.borderColor || "#27272a")}
          strokeWidth={isSelected ? Math.max(slot.borderWidth ?? 2, 4) : (slot.borderWidth ?? 2)}
        />
        {/* Panel image clipped to slot */}
        {img && (() => {
          const baseScale = Math.max(slot.width / img.width, slot.height / img.height)
          const imgScale = baseScale * (slot.scale || 1)
          
          const w = img.width * imgScale
          const h = img.height * imgScale
          
          const defCx = (slot.width - w) / 2
          const defCy = h > slot.height ? 0 : (slot.height - h) / 2
          
          const cx = defCx + (slot.offsetX || 0)
          const cy = defCy + (slot.offsetY || 0)
          
          return (
            <Group clipX={0} clipY={0} clipWidth={slot.width} clipHeight={slot.height}>
              <KImage
                image={img}
                x={slot.flipX ? cx + w : cx}
                y={cy}
                width={w}
                height={h}
                scaleX={slot.flipX ? -1 : 1}
                draggable={!isCustom || slot.isPanMode}
                onDragEnd={(e) => {
                  e.cancelBubble = true // Prevent triggering slot drag
                  const newX = slot.flipX ? e.target.x() - w : e.target.x()
                  const newY = e.target.y()
                  updateSlotImageState(slot.slot_id, {
                    offsetX: newX - defCx,
                    offsetY: newY - defCy
                  })
                }}
              />
            </Group>
          );
        })()}
        {/* Empty slot label */}
        {!slot.panel_image_url && (
          <Text
            x={slot.width / 2 - 60}
            y={slot.height / 2 - 10}
            text="Drop panel here"
            fontSize={13} fill="#a1a1aa" width={120} align="center"
          />
        )}
      </Group>
      {isSelected && isCustom && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 50 || newBox.height < 50) return oldBox
            return newBox
          }}
        />
      )}
    </React.Fragment>
  )
}
