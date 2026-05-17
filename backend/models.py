import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import (
    String, Text, Float, Integer, Boolean, DateTime, ForeignKey, JSON
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Character ──────────────────────────────────────────────────────────────────

class Character(Base):
    __tablename__ = "characters"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    visual_traits_summary: Mapped[Optional[str]] = mapped_column(Text)
    canonical_prompt: Mapped[Optional[str]] = mapped_column(Text)

    # InstantID / IP-Adapter reference images
    face_embed_path: Mapped[Optional[str]] = mapped_column(String(500))
    front_sheet_image_path: Mapped[Optional[str]] = mapped_column(String(500))
    reference_images: Mapped[Optional[list]] = mapped_column(JSON, default=list)

    # LoRA (optional, Tier-3 upgrade)
    lora_path: Mapped[Optional[str]] = mapped_column(String(500))
    lora_trigger_word: Mapped[Optional[str]] = mapped_column(String(120))
    lora_weight: Mapped[float] = mapped_column(Float, default=0.85)

    # Google Drive
    gdrive_folder_id: Mapped[Optional[str]] = mapped_column(String(200))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    variations: Mapped[list["CharacterVariation"]] = relationship(
        back_populates="character", cascade="all, delete-orphan"
    )
    sheet: Mapped[Optional["CharacterSheet"]] = relationship(
        back_populates="character", cascade="all, delete-orphan", uselist=False
    )


class CharacterVariation(Base):
    __tablename__ = "character_variations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    character_id: Mapped[str] = mapped_column(ForeignKey("characters.id"), nullable=False)
    variation_index: Mapped[int] = mapped_column(Integer, default=0)
    prompt: Mapped[Optional[str]] = mapped_column(Text)
    image_path: Mapped[Optional[str]] = mapped_column(String(500))
    is_selected: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    character: Mapped["Character"] = relationship(back_populates="variations")


class CharacterSheet(Base):
    __tablename__ = "character_sheets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    character_id: Mapped[str] = mapped_column(
        ForeignKey("characters.id"), nullable=False, unique=True
    )
    front_image_path: Mapped[Optional[str]] = mapped_column(String(500))
    side_image_path: Mapped[Optional[str]] = mapped_column(String(500))
    back_image_path: Mapped[Optional[str]] = mapped_column(String(500))
    three_quarter_image_path: Mapped[Optional[str]] = mapped_column(String(500))
    face_closeup_image_path: Mapped[Optional[str]] = mapped_column(String(500))
    expression_images: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    generation_prompt: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    character: Mapped["Character"] = relationship(back_populates="sheet")


# ── Panel ──────────────────────────────────────────────────────────────────────

class Panel(Base):
    __tablename__ = "panels"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    expanded_prompt: Mapped[Optional[str]] = mapped_column(Text)
    negative_prompt: Mapped[Optional[str]] = mapped_column(Text)
    image_path: Mapped[Optional[str]] = mapped_column(String(500))
    thumbnail_path: Mapped[Optional[str]] = mapped_column(String(500))
    aspect_ratio: Mapped[str] = mapped_column(String(20), default="2:3")
    panel_type: Mapped[str] = mapped_column(String(40), default="character")  # character|scene|closeup|wide|action
    characters_used: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    generation_backend: Mapped[Optional[str]] = mapped_column(String(40))
    job_id: Mapped[Optional[str]] = mapped_column(String(36))
    width: Mapped[int] = mapped_column(Integer, default=832)
    height: Mapped[int] = mapped_column(Integer, default=1216)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


# ── Comic Page ─────────────────────────────────────────────────────────────────

class ComicPage(Base):
    __tablename__ = "comic_pages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String(200), default="Untitled Page")
    canvas_width: Mapped[int] = mapped_column(Integer, default=1240)
    canvas_height: Mapped[int] = mapped_column(Integer, default=1754)  # A4 at 150dpi
    template: Mapped[str] = mapped_column(String(40), default="4-grid")
    thumbnail_path: Mapped[Optional[str]] = mapped_column(String(500))   # low-res base64 preview
    page_image_path: Mapped[Optional[str]] = mapped_column(String(500))  # high-res Drive PNG path
    gdrive_file_id: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    layout: Mapped[Optional["PageLayout"]] = relationship(
        back_populates="page", cascade="all, delete-orphan", uselist=False
    )
    bubbles: Mapped[list["SpeechBubble"]] = relationship(
        back_populates="page", cascade="all, delete-orphan"
    )


class PageLayout(Base):
    __tablename__ = "page_layouts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    page_id: Mapped[str] = mapped_column(
        ForeignKey("comic_pages.id"), nullable=False, unique=True
    )
    # JSON schema: {"slots": [{"slot_id","panel_id","x","y","width","height","crop","scale","rotation","z_index"}]}
    layout_json: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    page: Mapped["ComicPage"] = relationship(back_populates="layout")


# ── Speech Bubble ──────────────────────────────────────────────────────────────

class SpeechBubble(Base):
    __tablename__ = "speech_bubbles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    page_id: Mapped[str] = mapped_column(ForeignKey("comic_pages.id"), nullable=False)
    bubble_type: Mapped[str] = mapped_column(String(30), default="speech")  # speech|thought|shout|whisper|narration
    style: Mapped[str] = mapped_column(String(20), default="modern")  # modern|manga
    x: Mapped[float] = mapped_column(Float, default=100.0)
    y: Mapped[float] = mapped_column(Float, default=100.0)
    width: Mapped[float] = mapped_column(Float, default=200.0)
    height: Mapped[float] = mapped_column(Float, default=120.0)
    rotation: Mapped[float] = mapped_column(Float, default=0.0)
    flipped: Mapped[bool] = mapped_column(Boolean, default=False)
    text: Mapped[str] = mapped_column(Text, default="")
    font_size: Mapped[int] = mapped_column(Integer, default=16)
    font_family: Mapped[str] = mapped_column(String(80), default="Bangers")
    text_color: Mapped[str] = mapped_column(String(20), default="#000000")
    outline_color: Mapped[str] = mapped_column(String(20), default="#18181b")
    outline_width: Mapped[float] = mapped_column(Float, default=2.5)
    z_index: Mapped[int] = mapped_column(Integer, default=10)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    page: Mapped["ComicPage"] = relationship(back_populates="bubbles")


# ── Generation Job ─────────────────────────────────────────────────────────────

class GenerationJob(Base):
    __tablename__ = "generation_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    job_type: Mapped[str] = mapped_column(String(40))  # variation|sheet|panel
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|running|complete|failed
    prompt: Mapped[Optional[str]] = mapped_column(Text)
    expanded_prompt: Mapped[Optional[str]] = mapped_column(Text)
    result_path: Mapped[Optional[str]] = mapped_column(String(500))
    result_paths: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    backend_used: Mapped[Optional[str]] = mapped_column(String(40))
    backend_job_id: Mapped[Optional[str]] = mapped_column(String(200))
    error: Mapped[Optional[str]] = mapped_column(Text)
    extra_metadata: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
