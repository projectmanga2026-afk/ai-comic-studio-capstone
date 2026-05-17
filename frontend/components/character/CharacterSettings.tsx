'use client'
import { useCharacterStore } from '@/store/characterStore'
import { staticUrl } from '@/lib/api'
import { Trash2, Edit3, Wand2 } from 'lucide-react'
import Button from '@/components/ui/Button'

export default function CharacterSettings() {
  const { selected, remove, isGeneratingSheet, generateSheet } = useCharacterStore()

  if (!selected) {
    return (
      <div className="p-4 text-zinc-600 text-xs">
        <p>Select a character to see settings</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Character Info</p>

      <div className="space-y-2">
        <Label>Name</Label>
        <p className="text-sm text-zinc-200">{selected.name}</p>
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <p className="text-xs text-zinc-400 leading-relaxed">{selected.description}</p>
      </div>
      {selected.canonical_prompt && (
        <div className="space-y-2">
          <Label>Canonical Prompt</Label>
          <p className="text-xs text-zinc-500 leading-relaxed bg-zinc-900 p-2 rounded-lg">{selected.canonical_prompt}</p>
        </div>
      )}
      {selected.lora_trigger_word && (
        <div className="space-y-2">
          <Label>LoRA Trigger</Label>
          <code className="text-xs text-violet-400 bg-violet-500/10 px-2 py-1 rounded">{selected.lora_trigger_word}</code>
        </div>
      )}

      <div className="border-t border-zinc-800 pt-4 space-y-2">
        {!selected.sheet && (
          <Button
            variant="secondary" size="sm" className="w-full"
            loading={isGeneratingSheet}
            onClick={() => generateSheet(selected.id)}
            icon={<Wand2 size={14} />}
          >
            Generate Sheet
          </Button>
        )}
        <Button
          variant="danger" size="sm" className="w-full"
          onClick={() => remove(selected.id)}
          icon={<Trash2 size={14} />}
        >
          Delete Character
        </Button>
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium text-zinc-500">{children}</p>
}
