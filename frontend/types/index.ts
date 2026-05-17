// ── Characters ─────────────────────────────────────────────────────────────────
export interface Character {
  id: string
  name: string
  description: string
  visual_traits_summary: string | null
  canonical_prompt: string | null
  face_embed_path: string | null
  front_sheet_image_path: string | null
  reference_images: string[] | null
  lora_path: string | null
  lora_trigger_word: string | null
  lora_weight: number
  gdrive_folder_id: string | null
  created_at: string
  updated_at: string
  variations: CharacterVariation[]
  sheet: CharacterSheet | null
}

export interface CharacterVariation {
  id: string
  character_id: string
  variation_index: number
  prompt: string | null
  image_path: string | null
  is_selected: boolean
  created_at: string
}

export interface CharacterSheet {
  id: string
  character_id: string
  front_image_path: string | null
  side_image_path: string | null
  back_image_path: string | null
  three_quarter_image_path: string | null
  face_closeup_image_path: string | null
  expression_images: string[] | null
  generation_prompt: string | null
  created_at: string
}

// ── Panels ─────────────────────────────────────────────────────────────────────
export interface Panel {
  id: string
  user_prompt: string
  expanded_prompt: string | null
  negative_prompt: string | null
  image_path: string | null
  thumbnail_path: string | null
  aspect_ratio: string
  panel_type: string
  characters_used: string[] | null
  generation_backend: string | null
  job_id: string | null
  width: number
  height: number
  created_at: string
}

export type PanelType = 'character' | 'scene' | 'closeup' | 'wide' | 'action'
export type AspectRatio = '1:1' | '4:3' | '16:9' | '2:3' | '3:2'

// ── Comic Pages ────────────────────────────────────────────────────────────────
export interface ComicPage {
  id: string
  title: string
  canvas_width: number
  canvas_height: number
  template: string
  thumbnail_path: string | null
  page_image_path: string | null    // high-res PNG saved to Drive storage/pages/
  gdrive_file_id: string | null
  created_at: string
  updated_at: string
  layout: PageLayout | null
}

export interface PageLayout {
  id: string
  page_id: string
  layout_json: LayoutJSON | null
  updated_at: string
}

export interface LayoutJSON {
  slots: SlotData[]
}

export interface SlotData {
  slot_id: string
  panel_id?: string
  panel_image_url?: string
  x: number
  y: number
  width: number
  height: number
  crop?: { x: number; y: number; width: number; height: number }
  scale?: number
  rotation?: number
  z_index?: number
  offsetX?: number
  offsetY?: number
  flipX?: boolean
  isPanMode?: boolean
  borderWidth?: number
  borderColor?: string
}

// ── Speech Bubbles ─────────────────────────────────────────────────────────────
export type BubbleType = string
export type BubbleStyle = 'modern' | 'manga'

export interface SpeechBubble {
  id: string
  page_id: string
  bubble_type: BubbleType
  style: BubbleStyle
  x: number
  y: number
  width: number
  height: number
  rotation: number
  flipped: boolean
  text: string
  font_size: number
  font_family: string
  text_color: string
  outline_color: string
  outline_width: number
  z_index: number
  created_at: string
}

// ── Generation Jobs ────────────────────────────────────────────────────────────
export interface GenerationJob {
  id: string
  job_type: string
  status: 'pending' | 'running' | 'complete' | 'failed'
  prompt: string | null
  expanded_prompt: string | null
  result_path: string | null
  result_paths: string[] | null
  backend_used: string | null
  error: string | null
  created_at: string
  updated_at: string
}

// ── Misc ───────────────────────────────────────────────────────────────────────
export type StudioTab = 'character' | 'panel' | 'assembly' | 'text' | 'library'
