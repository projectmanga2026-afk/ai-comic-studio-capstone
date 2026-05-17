'use client'
import { cn } from '@/lib/utils'
import React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  selected?: boolean
  hoverable?: boolean
}

export default function Card({ selected, hoverable = true, className, children, ...props }: CardProps) {
  return (
    <div
      {...props}
      className={cn(
        'rounded-xl border bg-zinc-900 border-zinc-800 transition-all duration-200',
        hoverable && 'hover:border-zinc-600 hover:shadow-lg hover:shadow-black/30',
        selected && 'border-violet-500 ring-2 ring-violet-500/30 shadow-violet-500/20 shadow-lg',
        className,
      )}
    >
      {children}
    </div>
  )
}
