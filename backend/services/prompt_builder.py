import re
import os
from dataclasses import dataclass, field
from typing import Optional
from sqlalchemy.orm import Session
from backend import models

STYLE_TRIGGER = os.getenv("STYLE_LORA_TRIGGER", "")
STYLE_WEIGHT  = float(os.getenv("STYLE_LORA_WEIGHT", "1.0"))

# FLUX uses T5-XXL which understands language semantically — prompts can be
# verbose full sentences. Negative prompts are minimally effective on FLUX
# (no classifier-free guidance in the traditional sense) so we keep this short.
DEFAULT_NEGATIVE = ""   # FLUX doesn't benefit from long negative prompts

# Female guard — appended to description text for T5 when female character detected
_FEMALE_POSITIVE = "woman, female"
_FEMALE_KEYWORDS = {"woman", "girl", "female", "she", "her", "lady", "feminine"}

ASPECT_DIMS: dict[str, tuple[int, int]] = {
    "1:1":  (1024, 1024),
    "4:3":  (1152, 864),
    "16:9": (1344, 768),
    "2:3":  (832, 1216),
    "3:2":  (1216, 832),
}

PANEL_TYPE_HINTS: dict[str, str] = {
    "character": "medium shot, character in scene, dynamic composition, detailed background",
    "scene":     "wide establishing shot, cinematic composition, detailed environment, rich background, epic scale",
    "closeup":   "extreme close-up portrait, detailed face, sharp focus, expressive features, intimate framing",
    "wide":      "wide angle shot, cinematic panorama, full environment visible, epic scale, sweeping vista",
    "action":    "dynamic action pose, motion blur, dramatic angle, high energy composition, intense moment",
}

SPATIAL_KEYWORDS = {
    "left":       "positioned on the left side of the frame",
    "right":      "positioned on the right side of the frame",
    "center":     "positioned in the center of the frame",
    "foreground": "in the foreground, large and prominent",
    "background": "in the background, smaller and distant",
    "top":        "at the top of the frame",
    "bottom":     "at the bottom of the frame",
}


@dataclass
class CharacterToken:
    name: str
    canonical_prompt: str
    lora_trigger: Optional[str]
    lora_weight: float
    face_embed_path: Optional[str]
    front_image_path: Optional[str]
    position_hint: str = ""


@dataclass
class BuiltPrompt:
    original_prompt: str
    expanded_prompt: str
    negative_prompt: str
    characters_found: list[str]
    character_tokens: list[CharacterToken]
    workflow_type: str          # background_only | single_char | dual_char | multi_char
    width: int = 832
    height: int = 1216
    lora_stack: list[dict] = field(default_factory=list)


class PromptBuilder:
    def __init__(self, db: Session):
        self.db = db

    async def build(
        self,
        user_prompt: str,
        panel_type: str = "character",
        aspect_ratio: str = "2:3",
    ) -> dict:
        bp = self._build_sync(user_prompt, panel_type, aspect_ratio)
        return {
            "original_prompt": bp.original_prompt,
            "expanded_prompt": bp.expanded_prompt,
            "negative_prompt": bp.negative_prompt,
            "characters_found": bp.characters_found,
            "workflow_type": bp.workflow_type,
        }

    def build_sync(
        self,
        user_prompt: str,
        panel_type: str = "character",
        aspect_ratio: str = "2:3",
    ) -> BuiltPrompt:
        return self._build_sync(user_prompt, panel_type, aspect_ratio)

    # ── Internal ───────────────────────────────────────────────────────────────

    def _build_sync(self, user_prompt: str, panel_type: str, aspect_ratio: str) -> BuiltPrompt:
        width, height = ASPECT_DIMS.get(aspect_ratio, (832, 1216))
        mentions = self._parse_mentions(user_prompt)
        tokens = self._resolve_characters(mentions, user_prompt)

        # Style trigger (from LoRA, e.g. "comicstyle:1.0")
        style_part = f"({STYLE_TRIGGER}:{STYLE_WEIGHT})" if STYLE_TRIGGER else ""
        type_hint  = PANEL_TYPE_HINTS.get(panel_type, "")
        # Quality boosters — T5 understands these semantically
        quality    = "masterpiece, best quality, highly detailed, sharp lines, bold outlines, cel shaded, comic book art style"
        # Strip @mentions from scene description — T5 gets the clean scene text
        scene_part = self._strip_mentions(user_prompt)

        lora_stack: list[dict] = []
        n = len(tokens)

        if n == 0:
            # Pure scene — no characters
            parts = [p for p in [style_part, quality, type_hint, scene_part] if p]
            expanded = ", ".join(parts)

        elif n <= 2:
            # 1-2 characters: T5 gets scene + brief char identity notes
            # The actual face/body identity comes from PuLID + IP-Adapter at inference time
            char_notes = self._build_char_notes(tokens, lora_stack)
            parts = [p for p in [style_part, quality, type_hint, scene_part, char_notes] if p]
            expanded = ", ".join(parts)

        else:
            # 3+ characters: T5 must do all identity work via rich text descriptions
            char_descriptions = self._build_multichar_description(tokens, lora_stack)
            parts = [p for p in [style_part, quality, type_hint, scene_part, char_descriptions] if p]
            expanded = ", ".join(parts)

        # Workflow selection
        if n == 0:
            workflow = "background_only"
        elif n == 1:
            workflow = "single_char"
        elif n == 2:
            workflow = "dual_char"
        else:
            workflow = "multi_char"

        return BuiltPrompt(
            original_prompt=user_prompt,
            expanded_prompt=expanded,
            negative_prompt=DEFAULT_NEGATIVE,
            characters_found=[t.name for t in tokens],
            character_tokens=tokens,
            workflow_type=workflow,
            width=width,
            height=height,
            lora_stack=lora_stack,
        )

    def _build_char_notes(self, tokens: list[CharacterToken], lora_stack: list[dict]) -> str:
        """
        For 1-2 characters: inject LoRA triggers and a brief identity note.
        PuLID/IP-Adapter handles the heavy lifting — T5 just needs enough to
        confirm gender and basic appearance so it doesn't drift.
        """
        notes = []
        for tok in tokens:
            desc = tok.canonical_prompt
            # Reinforce female identity if detected — prevents gender drift
            if any(kw in desc.lower() for kw in _FEMALE_KEYWORDS):
                desc = f"female character, woman, {desc}"
            if tok.lora_trigger:
                desc = f"({tok.lora_trigger}:{tok.lora_weight}), {desc}"
                lora_stack.append({"trigger": tok.lora_trigger, "weight": tok.lora_weight})
            if tok.position_hint:
                desc += f", {tok.position_hint}"
            notes.append(desc)
        return ", ".join(notes)

    def _build_multichar_description(self, tokens: list[CharacterToken], lora_stack: list[dict]) -> str:
        """
        For 3+ characters: T5 is doing all identity work. Build a rich, structured
        multi-character description that T5 can parse as a scene with named entities.
        """
        parts = []
        for tok in tokens:
            desc = tok.canonical_prompt
            # Reinforce female identity
            if any(kw in desc.lower() for kw in _FEMALE_KEYWORDS):
                desc = f"a woman — {desc}"
            else:
                desc = f"a person — {desc}"
            if tok.lora_trigger:
                desc = f"({tok.lora_trigger}:{tok.lora_weight}), {desc}"
                lora_stack.append({"trigger": tok.lora_trigger, "weight": tok.lora_weight})
            if tok.position_hint:
                desc += f", {tok.position_hint}"
            parts.append(f"{tok.name}: {desc}")
        return ". ".join(parts)

    def _parse_mentions(self, text: str) -> list[str]:
        """Return unique character names mentioned as @Name."""
        return list(dict.fromkeys(re.findall(r"@(\w+)", text)))

    def _strip_mentions(self, text: str) -> str:
        return re.sub(r"@\w+", "", text).strip().strip(",").strip()

    def _resolve_characters(self, names: list[str], full_prompt: str) -> list[CharacterToken]:
        tokens: list[CharacterToken] = []
        for name in names:
            char = (
                self.db.query(models.Character)
                .filter(models.Character.name.ilike(name))
                .first()
            )
            if not char:
                continue
            canonical = char.canonical_prompt or char.description
            lora_trigger = None
            if char.lora_trigger_word and char.lora_path:
                lora_trigger = char.lora_trigger_word

            position = self._extract_position(name, full_prompt)

            tokens.append(CharacterToken(
                name=char.name,
                canonical_prompt=canonical,
                lora_trigger=lora_trigger,
                lora_weight=char.lora_weight,
                face_embed_path=char.face_embed_path,
                front_image_path=char.front_sheet_image_path,
                position_hint=position,
            ))
        return tokens

    def _extract_position(self, name: str, text: str) -> str:
        """Find spatial keywords near the @Name mention."""
        pattern = rf"@{re.escape(name)}.{{0,80}}"
        match = re.search(pattern, text, re.IGNORECASE)
        if not match:
            return ""
        snippet = match.group(0).lower()
        for kw, hint in SPATIAL_KEYWORDS.items():
            if kw in snippet:
                return hint
        return ""
