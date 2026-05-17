from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict


# ── Shared ─────────────────────────────────────────────────────────────────────

class OrmBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── Character Variation ────────────────────────────────────────────────────────

class CharacterVariationOut(OrmBase):
    id: str
    character_id: str
    variation_index: int
    prompt: Optional[str]
    image_path: Optional[str]
    is_selected: bool
    created_at: datetime


# ── Character Sheet ────────────────────────────────────────────────────────────

class CharacterSheetOut(OrmBase):
    id: str
    character_id: str
    front_image_path: Optional[str]
    side_image_path: Optional[str]
    back_image_path: Optional[str]
    three_quarter_image_path: Optional[str]
    face_closeup_image_path: Optional[str]
    expression_images: Optional[list]
    generation_prompt: Optional[str]
    created_at: datetime


# ── Character ──────────────────────────────────────────────────────────────────

class CharacterCreate(BaseModel):
    name: str
    description: str
    visual_traits_summary: Optional[str] = None


class CharacterUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    visual_traits_summary: Optional[str] = None
    canonical_prompt: Optional[str] = None
    lora_path: Optional[str] = None
    lora_trigger_word: Optional[str] = None
    lora_weight: Optional[float] = None


class CharacterOut(OrmBase):
    id: str
    name: str
    description: str
    visual_traits_summary: Optional[str]
    canonical_prompt: Optional[str]
    face_embed_path: Optional[str]
    front_sheet_image_path: Optional[str]
    reference_images: Optional[list]
    lora_path: Optional[str]
    lora_trigger_word: Optional[str]
    lora_weight: float
    gdrive_folder_id: Optional[str]
    created_at: datetime
    updated_at: datetime
    variations: list[CharacterVariationOut] = []
    sheet: Optional[CharacterSheetOut] = None


class SelectVariationIn(BaseModel):
    variation_id: str


# ── Panel ──────────────────────────────────────────────────────────────────────

class PanelGenerateIn(BaseModel):
    user_prompt: str
    panel_type: str = "character"          # character|scene|closeup|wide|action
    aspect_ratio: str = "2:3"              # 1:1 | 4:3 | 16:9 | 2:3 | 3:2
    negative_prompt: Optional[str] = None
    seed: Optional[int] = None


class PanelOut(OrmBase):
    id: str
    user_prompt: str
    expanded_prompt: Optional[str]
    negative_prompt: Optional[str]
    image_path: Optional[str]
    thumbnail_path: Optional[str]
    aspect_ratio: str
    panel_type: str
    characters_used: Optional[list]
    generation_backend: Optional[str]
    job_id: Optional[str]
    width: int
    height: int
    created_at: datetime


# ── Comic Page ─────────────────────────────────────────────────────────────────

class ComicPageCreate(BaseModel):
    title: str = "Untitled Page"
    canvas_width: int = 1240
    canvas_height: int = 1754
    template: str = "4-grid"


class PageLayoutUpdate(BaseModel):
    layout_json: dict[str, Any]


class ThumbnailUpdate(BaseModel):
    thumbnail_data_url: str   # base64 data URL, e.g. "data:image/png;base64,..."


class PageImageUpdate(BaseModel):
    image_data_url: str   # full-res base64 PNG from Konva (pixelRatio 2)


class PageLayoutOut(OrmBase):
    id: str
    page_id: str
    layout_json: Optional[dict]
    updated_at: datetime


class ComicPageOut(OrmBase):
    id: str
    title: str
    canvas_width: int
    canvas_height: int
    template: str
    thumbnail_path: Optional[str]
    page_image_path: Optional[str]
    gdrive_file_id: Optional[str]
    created_at: datetime
    updated_at: datetime
    layout: Optional[PageLayoutOut] = None


# ── Speech Bubble ──────────────────────────────────────────────────────────────

class BubbleCreate(BaseModel):
    bubble_type: str = "speech"
    style: str = "modern"
    x: float = 100.0
    y: float = 100.0
    width: float = 200.0
    height: float = 120.0
    rotation: float = 0.0
    flipped: bool = False
    text: str = ""
    font_size: int = 16
    font_family: str = "Bangers"
    text_color: str = "#000000"
    outline_color: str = "#18181b"
    outline_width: float = 2.5
    z_index: int = 10


class BubbleUpdate(BaseModel):
    bubble_type: Optional[str] = None
    style: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    rotation: Optional[float] = None
    flipped: Optional[bool] = None
    text: Optional[str] = None
    font_size: Optional[int] = None
    font_family: Optional[str] = None
    text_color: Optional[str] = None
    outline_color: Optional[str] = None
    outline_width: Optional[float] = None
    z_index: Optional[int] = None


class BubbleOut(OrmBase):
    id: str
    page_id: str
    bubble_type: str
    style: str
    x: float
    y: float
    width: float
    height: float
    rotation: float
    flipped: bool
    text: str
    font_size: int
    font_family: str
    text_color: str
    outline_color: str
    outline_width: float
    z_index: int
    created_at: datetime


# ── Generation ─────────────────────────────────────────────────────────────────

class ExpandPromptIn(BaseModel):
    user_prompt: str
    panel_type: str = "character"
    aspect_ratio: str = "2:3"


class ExpandPromptOut(BaseModel):
    original_prompt: str
    expanded_prompt: str
    negative_prompt: str
    characters_found: list[str]
    workflow_type: str


class GenerationJobOut(OrmBase):
    id: str
    job_type: str
    status: str
    prompt: Optional[str]
    expanded_prompt: Optional[str]
    result_path: Optional[str]
    result_paths: Optional[list]
    backend_used: Optional[str]
    error: Optional[str]
    created_at: datetime
    updated_at: datetime
