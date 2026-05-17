'use client'
export default function Spinner({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`animate-spin ${className}`}>
      <circle cx="12" cy="12" r="10" stroke="#7c3aed" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round" />
    </svg>
  )
}
