'use client'
interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: React.ReactNode
}
export default function EmptyState({ icon = '✨', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      <div className="text-5xl mb-4 opacity-60">{icon}</div>
      <h3 className="text-lg font-semibold text-zinc-300 mb-1">{title}</h3>
      {description && <p className="text-sm text-zinc-500 max-w-xs mb-4">{description}</p>}
      {action}
    </div>
  )
}
