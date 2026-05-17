'use client'
import React, { useState } from 'react'
import { Layer, Group, Path, Text, Rect, Circle, Transformer } from 'react-konva'
import { useBubbleStore } from '@/store/bubbleStore'
import type { SpeechBubble } from '@/types'

export const BUBBLE_SHAPES: Record<string, string> = {
  'modern-speech1':   'M 75 5 C 130 5, 145 35, 145 45 C 145 55, 130 85, 75 85 C 55 85, 40 85, 20 100 Q 30 85, 25 70 C 15 65, 5 55, 5 45 C 5 35, 20 5, 75 5 Z',
  'modern-speech2':   'M 20 10 Q 10 10 10 20 L 10 70 Q 10 80 20 80 L 110 80 L 130 100 L 120 80 L 140 80 Q 150 80 150 70 L 150 20 Q 150 10 140 10 Z',
  'modern-speech3':   'M 5 5 L 145 5 L 145 75 L 85 75 L 75 105 L 65 75 L 5 75 Z',
  'modern-thought':   'M 40 5 C 30 -15, 70 -20, 75 -5 C 85 -30, 130 -20, 125 10 C 155 10, 150 50, 125 55 C 130 85, 80 80, 75 60 C 60 85, 20 70, 30 50 C -5 45, 10 5, 40 5 Z M 105 80 A 5 5 0 1 0 95 80 A 5 5 0 1 0 105 80 M 118 90 A 3 3 0 1 0 112 90 A 3 3 0 1 0 118 90 M 127 98 A 2 2 0 1 0 123 98 A 2 2 0 1 0 127 98',
  'modern-shout1':    'M 75 5 L 95 20 L 130 5 L 120 35 L 150 45 L 125 65 L 145 90 L 110 80 L 100 100 L 75 85 L 45 105 L 45 80 L 10 90 L 25 60 L 0 45 L 30 30 L 15 5 L 50 20 Z',
  'modern-shout2':    'M 50 10 L 100 15 L 145 0 L 125 35 L 150 65 L 115 80 L 130 110 L 80 90 L 60 125 L 45 85 L 0 95 L 25 60 L 5 25 L 40 40 Z',
  'modern-whisper1':  'M 75 5 C 130 5, 145 35, 145 45 C 145 55, 130 85, 75 85 C 55 85, 40 85, 20 100 Q 30 85, 25 70 C 15 65, 5 55, 5 45 C 5 35, 20 5, 75 5 Z',
  'modern-whisper2':  'M 20 10 Q 10 10 10 20 L 10 70 Q 10 80 20 80 L 110 80 L 130 100 L 120 80 L 140 80 Q 150 80 150 70 L 150 20 Q 150 10 140 10 Z',
  'modern-narration1':'M 5 5 L 145 5 L 145 80 L 5 80 Z',
  'modern-narration2':'M 20 5 L 130 5 Q 145 5 145 20 L 145 65 Q 145 80 130 80 L 20 80 Q 5 80 5 65 L 5 20 Q 5 5 20 5 Z',
}

// ── Plain-text node (no bubble shape, just floating text) ─────────────────────

const PlainTextNode = ({ b, isSelected, update, setSelected, setEditingBubble }: any) => {
  const groupRef = React.useRef<any>(null)
  const trRef    = React.useRef<any>(null)

  React.useEffect(() => {
    if (isSelected && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current])
      trRef.current.getLayer().batchDraw()
    }
  }, [isSelected])

  return (
    <React.Fragment>
      <Group
        ref={groupRef}
        x={b.x}
        y={b.y}
        width={b.width}
        height={b.height}
        rotation={b.rotation}
        draggable
        onClick={(e) => { e.cancelBubble = true; setSelected(b) }}
        onTap={(e)  => { e.cancelBubble = true; setSelected(b) }}
        onDragEnd={(e) => { e.cancelBubble = true; update(b.id, { x: e.target.x(), y: e.target.y() }) }}
        onTransformEnd={(e) => {
          const node = groupRef.current
          if (!node) return
          const scaleX = node.scaleX(), scaleY = node.scaleY()
          node.scaleX(1); node.scaleY(1)
          update(b.id, {
            x: node.x(), y: node.y(), rotation: node.rotation(),
            width:  Math.max(40, b.width  * Math.abs(scaleX)),
            height: Math.max(20, b.height * scaleY),
          })
        }}
      >
        {/* Transparent hit area so the whole text box is clickable */}
        <Rect width={b.width} height={b.height} fill="transparent" />

        {/* Dashed selection border */}
        {isSelected && (
          <Rect
            width={b.width} height={b.height}
            stroke="#7c3aed" strokeWidth={1.5}
            dash={[6, 4]} fill="transparent"
          />
        )}

        {/* The actual text */}
        <Text
          text={b.text || 'Double-click to edit'}
          fill={b.text_color || '#ffffff'}
          fontSize={b.font_size || 20}
          fontFamily={b.font_family || 'Bangers'}
          fontStyle={b.font_style || 'normal'}
          width={b.width}
          height={b.height}
          align={b.text_align || 'center'}
          verticalAlign="middle"
          wrap="word"
          shadowColor="rgba(0,0,0,0.8)"
          shadowBlur={4}
          shadowOffsetX={1}
          shadowOffsetY={1}
          opacity={b.text && b.text.length > 0 ? 1 : 0.35}
        />

        {/* Edit (T) button when selected */}
        {isSelected && (
          <Group
            x={b.width - 14} y={14}
            onClick={(e) => { e.cancelBubble = true; setEditingBubble(b) }}
            onTap={(e)  => { e.cancelBubble = true; setEditingBubble(b) }}
            onMouseEnter={(e) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = 'pointer' }}
            onMouseLeave={(e) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = 'default' }}
          >
            <Circle radius={10} fill="#7c3aed" />
            <Text text="T" fill="white" fontSize={11} fontStyle="bold" align="center" verticalAlign="middle" x={-10} y={-10} width={20} height={20} />
          </Group>
        )}
      </Group>

      {isSelected && (
        <Transformer
          ref={trRef}
          flipEnabled={false}
          boundBoxFunc={(oldBox, newBox) => (newBox.width < 40 || newBox.height < 20) ? oldBox : newBox}
        />
      )}
    </React.Fragment>
  )
}

// ── Speech-bubble node ────────────────────────────────────────────────────────

const BubbleNode = ({ b, isSelected, update, setSelected, setEditingBubble }: any) => {
  const shapeRef = React.useRef<any>(null)
  const trRef = React.useRef<any>(null)

  React.useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current])
      trRef.current.getLayer().batchDraw()
    }
  }, [isSelected])

  const key = `${b.style}-${b.bubble_type}`
  const pathData = BUBBLE_SHAPES[key] || BUBBLE_SHAPES['modern-speech1']

  return (
    <React.Fragment>
      <Group
        ref={shapeRef}
        x={b.x}
        y={b.y}
        width={b.width}
        height={b.height}
        rotation={b.rotation}
        scaleX={b.flipped ? -1 : 1}
        draggable
        onClick={(e) => {
          e.cancelBubble = true
          setSelected(b)
        }}
        onTap={(e) => {
          e.cancelBubble = true
          setSelected(b)
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true
          update(b.id, { x: e.target.x(), y: e.target.y() })
        }}
        onTransformEnd={(e) => {
          const node = shapeRef.current
          if (!node) return
          const scaleX = node.scaleX()
          const scaleY = node.scaleY()
          node.scaleX(b.flipped ? -1 : 1) // Reset scale to just handle flipping
          node.scaleY(1)
          update(b.id, {
            x: node.x(),
            y: node.y(),
            rotation: node.rotation(),
            width: Math.max(50, b.width * Math.abs(scaleX)),
            height: Math.max(30, b.height * scaleY)
          })
        }}
      >
        {/* Bubble Shape */}
        <Path
          data={pathData}
          scaleX={b.width / 150}
          scaleY={b.height / 100}
          fill="white"
          stroke={isSelected ? "#7c3aed" : (b.outline_color || "#18181b")}
          strokeWidth={isSelected ? 3 : (b.outline_width ?? 2.5)}
          strokeScaleEnabled={false}
          dash={b.bubble_type.startsWith('whisper') ? [8, 6] : undefined}
        />

        {/* Text inside a proportional inner bounding box to prevent corner overflow */}
        <Group 
          x={b.width * 0.15} 
          y={b.height * 0.1} 
          clipX={0} 
          clipY={0} 
          clipWidth={b.width * 0.7} 
          clipHeight={b.height * 0.75}
        >
          {b.text && (
            <Text
              text={b.text}
              fill={b.text_color || '#000'}
              fontSize={b.font_size}
              fontFamily={b.font_family || 'Bangers'}
              width={b.width * 0.7}
              height={b.height * 0.75}
              align="center"
              verticalAlign="middle"
              scaleX={b.flipped ? -1 : 1} // Un-flip the text so it's readable
              offsetX={b.flipped ? (b.width * 0.7) : 0} // Shift it back into place
              wrap="word"
            />
          )}
        </Group>

        {/* T icon for editing */}
        {isSelected && (
          <Group
            x={b.width - 14}
            y={14}
            scaleX={b.flipped ? -1 : 1} // Unflip the icon
            offsetX={b.flipped ? -b.width + 28 : 0}
            onClick={(e) => {
              e.cancelBubble = true
              setEditingBubble(b)
            }}
            onTap={(e) => {
              e.cancelBubble = true
              setEditingBubble(b)
            }}
            onMouseEnter={(e) => {
              const container = e.target.getStage()?.container()
              if (container) container.style.cursor = 'pointer'
            }}
            onMouseLeave={(e) => {
              const container = e.target.getStage()?.container()
              if (container) container.style.cursor = 'default'
            }}
          >
            <Circle radius={10} fill="#7c3aed" />
            <Text text="T" fill="white" fontSize={11} fontStyle="bold" align="center" verticalAlign="middle" x={-10} y={-10} width={20} height={20} />
          </Group>
        )}
      </Group>

      {/* Transformer for resizing/rotating */}
      {isSelected && (
        <Transformer
          ref={trRef}
          flipEnabled={false}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 50 || newBox.height < 30) return oldBox
            return newBox
          }}
        />
      )}
    </React.Fragment>
  )
}

export default function BubbleLayer({ setEditingBubble }: { setEditingBubble: (b: SpeechBubble | null) => void }) {
  const { bubbles, update, selected, setSelected } = useBubbleStore()

  return (
    <>
      {bubbles.map(b =>
        b.bubble_type === 'plaintext'
          ? <PlainTextNode key={b.id} b={b} isSelected={selected?.id === b.id} update={update} setSelected={setSelected} setEditingBubble={setEditingBubble} />
          : <BubbleNode    key={b.id} b={b} isSelected={selected?.id === b.id} update={update} setSelected={setSelected} setEditingBubble={setEditingBubble} />
      )}
    </>
  )
}

