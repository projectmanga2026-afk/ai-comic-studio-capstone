"""
Central generation dispatcher. Reads GENERATION_BACKEND env var and routes to:
  mock | comfyui

FLUX migration: all ComfyUI paths now use FLUX workflows (flux_background,
flux_single_char, flux_dual_char). SDXL workflows are kept on disk for rollback.
"""
import io
import os
import random
import uuid
from datetime import datetime, timezone
from typing import Optional

from PIL import Image, ImageDraw, ImageFont
from sqlalchemy.orm import Session

from backend import models, schemas
from backend.services.prompt_builder import PromptBuilder
from backend.services.storage_service import StorageService

from pathlib import Path
from dotenv import load_dotenv

# Explicitly reload .env — guards against the case where this module is imported
# before database.py's load_dotenv() runs, or before A5 writes the .env file.
load_dotenv(dotenv_path=Path(__file__).parent.parent / '.env', override=True)

# Read at module level for logging, but _get_backend() is used at call time
# so a server restart is not required if the env changes.
def _get_backend() -> str:
    return os.getenv("GENERATION_BACKEND", "mock")

BACKEND    = _get_backend()
STORAGE_PATH = os.getenv("STORAGE_PATH", "./storage")
# Optional: set to "true" to run rembg background removal on sheets/variations.
# Default false for FLUX — FLUX follows "pure white background" reliably without it.
REMOVE_BG = os.getenv("REMOVE_BACKGROUND_ENABLED", "false").lower() == "true"

print(f"[generation_service] BACKEND={BACKEND}  STORAGE_PATH={STORAGE_PATH}")
MOCK_PALETTE = [
    "#1a1a2e", "#16213e", "#0f3460", "#533483",
    "#2d6a4f", "#1b4332", "#6d3b47", "#3d0c11",
]


class GenerationService:

    def __init__(self, db: Session):
        self.db = db
        self.builder = PromptBuilder(db)

    async def _panel_work(self, body: schemas.PanelGenerateIn, job: models.GenerationJob) -> None:
        """Inner work — called by the background task in the router."""
        import traceback
        print(f"\n{'='*60}")
        print(f"[panel] job={job.id}")
        print(f"[panel] prompt='{body.user_prompt}'")
        print(f"[panel] type={body.panel_type}  ratio={body.aspect_ratio}")
        print(f"[panel] GENERATION_BACKEND env='{BACKEND}'")
        try:
            job.status = "running"
            self.db.commit()

            bp = self.builder.build_sync(body.user_prompt, body.panel_type, body.aspect_ratio)
            backend = job.backend_used if job.backend_used not in ("queued", None) else BACKEND
            job.expanded_prompt = bp.expanded_prompt
            job.backend_used = backend
            self.db.commit()

            print(f"[panel] backend selected='{backend}'")
            print(f"[panel] characters_found={bp.characters_found}")
            print(f"[panel] workflow_type={bp.workflow_type}")
            print(f"[panel] expanded_prompt='{bp.expanded_prompt[:200]}...'")

            filename = f"{job.id}.png"
            out_path = StorageService.path("panels", filename)
            print(f"[panel] output path='{out_path}'")

            if backend == "mock":
                print("[panel] using mock generator")
                self._mock_image(out_path, bp.expanded_prompt, bp.width, bp.height, body.panel_type)
            elif backend == "comfyui":
                print("[panel] calling _comfyui_panel...")
                await self._comfyui_panel(bp, out_path, body.seed)
                print("[panel] _comfyui_panel complete")
            else:
                print(f"[panel] unknown backend '{backend}', using mock")
                self._mock_image(out_path, f"[{backend}] " + bp.expanded_prompt, bp.width, bp.height, body.panel_type)

            panel = models.Panel(
                user_prompt=body.user_prompt,
                expanded_prompt=bp.expanded_prompt,
                negative_prompt=bp.negative_prompt,
                image_path=StorageService.url("panels", filename),
                aspect_ratio=body.aspect_ratio,
                panel_type=body.panel_type,
                characters_used=bp.characters_found,
                generation_backend=backend,
                job_id=job.id,
                width=bp.width,
                height=bp.height,
            )
            self.db.add(panel)
            job.status = "complete"
            job.result_path = panel.image_path
            self.db.commit()
            print(f"[panel] ✅ done — {panel.image_path}")

            # Background Drive upload (fire and forget)
            if os.getenv("GDRIVE_SYNC_ENABLED", "false").lower() == "true":
                import asyncio
                from backend.services.gdrive_service import GDriveService
                asyncio.create_task(GDriveService.upload(out_path, "panels"))

        except Exception as exc:
            print(f"[panel] ❌ FAILED: {exc}")
            print(traceback.format_exc())
            job.status = "failed"
            job.error = str(exc)
            self.db.commit()
            raise

    async def generate_panel(
        self,
        body: schemas.PanelGenerateIn,
        force_mock: bool = False,
        force_backend: Optional[str] = None,
    ) -> models.GenerationJob:
        bp = self.builder.build_sync(body.user_prompt, body.panel_type, body.aspect_ratio)
        backend = force_backend or ("mock" if force_mock else BACKEND)

        job = models.GenerationJob(
            job_type="panel",
            status="pending",
            prompt=body.user_prompt,
            expanded_prompt=bp.expanded_prompt,
            backend_used=backend,
        )
        self.db.add(job)
        self.db.commit()
        await self._panel_work(body, job)
        return job

    async def _variations_work(self, character: models.Character, job: models.GenerationJob) -> None:
        """Inner work — called by the background task in the router."""
        try:
            job.status = "running"
            self.db.commit()

            paths: list[str] = []
            # Clear old variations
            for v in character.variations:
                self.db.delete(v)
            self.db.flush()

            for i in range(4):
                filename = f"{character.id}_var{i}_{uuid.uuid4().hex[:6]}.png"
                out_path = StorageService.path("variations", filename)
                prompt = (
                    f"{character.description}, "
                    f"full body character reference sheet, front view, standing upright, "
                    f"pure white background, solid white background, no shadows, no gradients, "
                    f"character isolated on white, sharp lines, bold outlines, cel shaded, "
                    f"comic book art style, masterpiece, best quality"
                )
                if BACKEND == "comfyui":
                    try:
                        await self._comfyui_flux_background(prompt, out_path, 768, 1024)
                        if REMOVE_BG:
                            self._remove_background(out_path)
                    except Exception as e:
                        print(f"[warn] ComfyUI variation {i} failed ({e}), using mock")
                        self._mock_variation(out_path, character.name, i)
                else:
                    self._mock_variation(out_path, character.name, i)

                url = StorageService.url("variations", filename)
                variation = models.CharacterVariation(
                    character_id=character.id,
                    variation_index=i,
                    prompt=prompt,
                    image_path=url,
                )
                self.db.add(variation)
                paths.append(url)

            job.status = "complete"
            job.result_paths = paths
            self.db.commit()
        except Exception as exc:
            job.status = "failed"
            job.error = str(exc)
            self.db.commit()
            raise

    async def generate_character_variations(self, character: models.Character) -> models.GenerationJob:
        job = models.GenerationJob(job_type="variation", status="pending", prompt=character.description)
        self.db.add(job)
        self.db.commit()
        await self._variations_work(character, job)
        return job

    async def _sheet_work(self, character: models.Character, job: models.GenerationJob) -> None:
        """Inner work — called by the background task in the router.

        Two-phase generation:
          Phase 1: Find the selected variation and upload it to ComfyUI as a face
                   reference (it was chosen by the user as the canonical look).
          Phase 2: Generate each view.
                   • Back view  → flux_background (face not visible, PuLID irrelevant)
                   • All others → flux_single_char (PuLID locked to the selected variation)
                   A single shared seed is used across all views for extra consistency.
        """
        paths: dict[str, str] = {}

        try:
            job.status = "running"
            self.db.commit()

            base_prompt = character.canonical_prompt or character.description

            # ── Phase 1: resolve face reference ───────────────────────────────
            # Find the variation the user explicitly selected as their canonical look.
            # front_sheet_image_path is set by select_variation to the chosen variation.
            selected_var = next((v for v in character.variations if v.is_selected), None)
            reference_url = (
                selected_var.image_path if selected_var
                else character.front_sheet_image_path   # fallback: previous front view
            )

            face_ref_name: str | None = None   # ComfyUI filename after upload
            if BACKEND == "comfyui" and reference_url:
                local_ref = self._url_to_local(reference_url)
                try:
                    from backend.services.comfyui_client import ComfyUIClient as _C
                    _cli = _C()
                    face_ref_name = await _cli.upload_image(local_ref)
                    print(f"[sheet] ✅ face reference uploaded: {face_ref_name}")
                except Exception as _e:
                    print(f"[sheet] ⚠️  could not upload face reference ({_e}), falling back to text-only")
            elif BACKEND == "comfyui" and not reference_url:
                print("[sheet] ⚠️  no variation selected — generating text-only (select a variation first for best results)")

            # Single shared seed — all views anchored to the same starting noise
            shared_seed = random.randint(0, 2 ** 32)

            # ── Phase 2: view specs ──────────────────────────────────────────
            view_specs = [
                (
                    "front",
                    "character facing directly forward, strict front view, full body standing straight, "
                    "character looking directly at the viewer, front-facing pose, head-on perspective",
                    768, 1024,
                ),
                (
                    "side",
                    "strict 90-degree side profile view, character facing left, only the side of the face "
                    "visible, lateral profile, full body standing, no front-facing view",
                    768, 1024,
                ),
                (
                    "back",
                    "character viewed from directly behind, back of head visible, no face visible at all, "
                    "rear view, posterior view, full body, camera positioned exactly behind the character",
                    768, 1024,
                ),
                (
                    "three_quarter",
                    "three-quarter view at 45 degrees, character facing slightly to the right, "
                    "diagonal angle showing both face and side, full body, dynamic pose",
                    768, 1024,
                ),
                (
                    "face_closeup",
                    "portrait, head and shoulders only, close-up shot, "
                    "looking directly at camera, detailed facial features, expressive face",
                    768, 768,
                ),
            ]

            for view, pos_add, w, h in view_specs:
                filename = f"{character.id}_sheet_{view}.png"
                out_path = StorageService.path("sheets", filename)
                prompt = (
                    f"{base_prompt}, {pos_add}, "
                    f"pure white background, solid white, no shadows, no gradients, "
                    f"character isolated on white, character sheet, "
                    f"sharp lines, bold outlines, cel shaded, comic book art style, "
                    f"masterpiece, best quality, highly detailed"
                )

                if BACKEND == "comfyui":
                    try:
                        # Back view: face is hidden — PuLID has nothing to lock to
                        # All other views: use PuLID to lock identity to the selected variation
                        if view == "back" or face_ref_name is None:
                            print(f"[sheet] {view}: text-only (flux_background)")
                            await self._comfyui_flux_background(prompt, out_path, w, h)
                        else:
                            print(f"[sheet] {view}: PuLID (flux_single_char, ref={face_ref_name})")
                            await self._comfyui_flux_char_from_ref(
                                prompt, face_ref_name, out_path, w, h, shared_seed,
                            )
                        if REMOVE_BG:
                            self._remove_background(out_path)
                    except Exception as e:
                        print(f"[warn] ComfyUI sheet {view} failed ({e}), using mock")
                        self._mock_sheet_view(out_path, character.name, view)
                else:
                    self._mock_sheet_view(out_path, character.name, view)

                paths[view] = StorageService.url("sheets", filename)

            # ── Upsert character sheet record ───────────────────────────────────
            sheet = character.sheet
            if not sheet:
                sheet = models.CharacterSheet(character_id=character.id)
                self.db.add(sheet)

            sheet.front_image_path = paths.get("front")
            sheet.side_image_path = paths.get("side")
            sheet.back_image_path = paths.get("back")
            sheet.three_quarter_image_path = paths.get("three_quarter")
            sheet.face_closeup_image_path = paths.get("face_closeup")
            sheet.generation_prompt = base_prompt

            # Upgrade reference images to the sheet-quality versions:
            #   front_sheet_image_path → front view (higher-res, clean pose)
            #   face_embed_path        → face closeup (best for PuLID in panels)
            character.front_sheet_image_path = paths.get("front")
            character.face_embed_path = paths.get("face_closeup")

            job.status = "complete"
            job.result_paths = list(paths.values())
            self.db.commit()

        except Exception as exc:
            job.status = "failed"
            job.error = str(exc)
            self.db.commit()
            raise

    async def generate_character_sheet(self, character: models.Character) -> models.GenerationJob:
        job = models.GenerationJob(job_type="sheet", status="pending", prompt=character.canonical_prompt or character.description)
        self.db.add(job)
        self.db.commit()
        await self._sheet_work(character, job)
        return job

    # ── ComfyUI — FLUX wrappers ────────────────────────────────────────────────

    async def _comfyui_panel(self, bp, out_path: str, seed):
        """Route panel generation to the correct FLUX workflow based on character count."""
        import traceback
        from backend.services.comfyui_client import ComfyUIClient
        client = ComfyUIClient()
        s = seed or random.randint(0, 2**32)
        n = len(bp.character_tokens)

        print(f"[comfyui_panel] {n} character(s) detected → ", end="")

        if n == 0:
            # ── No characters: pure FLUX background, painterly style ───────────────────────
            print("flux_background")
            patches = client.build_flux_patches(
                positive_prompt=bp.expanded_prompt,
                width=bp.width, height=bp.height, seed=s,
                guidance=3.5,  # softer guidance for painterly scene quality
            )
            await client.generate("flux_background", patches, out_path)

        elif n == 1:
            # ── Single character: PuLID + IP-Adapter ──────────────────────────
            print("flux_single_char")
            char = bp.character_tokens[0]
            face_comfy_name = await self._upload_ref(client, char.face_embed_path, "face")
            body_comfy_name = await self._upload_ref(client, char.front_image_path, "body")

            if face_comfy_name:
                patches = client.build_flux_char_patches(
                    positive_prompt=bp.expanded_prompt,
                    face_image_path=face_comfy_name,
                    body_image_path=body_comfy_name,
                    width=bp.width, height=bp.height, seed=s,
                )
                try:
                    await client.generate("flux_single_char", patches, out_path)
                except Exception as e:
                    if self._is_pulid_missing(e):
                        print("[comfyui_panel] ⚠️  PuLID not installed — run B2 in notebook. Falling back to text-only.")
                        patches = client.build_flux_patches(
                            positive_prompt=bp.expanded_prompt,
                            width=bp.width, height=bp.height, seed=s,
                        )
                        await client.generate("flux_background", patches, out_path)
                    else:
                        raise
            else:
                # No face ref yet — fall back to background with text description
                print(f"[comfyui_panel] ⚠️  no face ref for {char.name}, using text-only fallback")
                patches = client.build_flux_patches(
                    positive_prompt=bp.expanded_prompt,
                    width=bp.width, height=bp.height, seed=s,
                )
                await client.generate("flux_background", patches, out_path)

        elif n == 2:
            # ── Dual character: chained PuLID ─────────────────────────────────
            print("flux_dual_char")
            char1, char2 = bp.character_tokens[0], bp.character_tokens[1]
            face1 = await self._upload_ref(client, char1.face_embed_path, f"face_{char1.name}")
            face2 = await self._upload_ref(client, char2.face_embed_path, f"face_{char2.name}")
            body1 = await self._upload_ref(client, char1.front_image_path, f"body_{char1.name}")

            if face1 and face2:
                patches = client.build_flux_dual_char_patches(
                    positive_prompt=bp.expanded_prompt,
                    face1_image_path=face1,
                    body1_image_path=body1,
                    face2_image_path=face2,
                    width=bp.width, height=bp.height, seed=s,
                )
                try:
                    await client.generate("flux_dual_char", patches, out_path)
                except Exception as e:
                    if self._is_pulid_missing(e):
                        print("[comfyui_panel] ⚠️  PuLID not installed — run B2 in notebook. Falling back to text-only.")
                        patches = client.build_flux_patches(
                            positive_prompt=bp.expanded_prompt,
                            width=bp.width, height=bp.height, seed=s,
                            guidance=3.5,
                        )
                        await client.generate("flux_background", patches, out_path)
                    else:
                        raise
            else:
                # Missing one or both face refs — text only
                missing = [c.name for c, f in [(char1, face1), (char2, face2)] if not f]
                print(f"[comfyui_panel] ⚠️  missing face refs for: {missing}, using text-only")
                patches = client.build_flux_patches(
                    positive_prompt=bp.expanded_prompt,
                    width=bp.width, height=bp.height, seed=s,
                )
                await client.generate("flux_background", patches, out_path)

        else:
            # ── 3+ characters: T5 text descriptions only ───────────────────────────
            print(f"flux_background (text-only, {n} chars)")
            patches = client.build_flux_patches(
                positive_prompt=bp.expanded_prompt,
                width=bp.width, height=bp.height, seed=s,
                guidance=3.5,  # scene-level guidance, identity from text only
            )
            await client.generate("flux_background", patches, out_path)


    @staticmethod
    def _is_pulid_missing(exc: Exception) -> bool:
        """Return True if the exception is caused by PuLID custom nodes not being installed."""
        msg = str(exc).lower()
        MISSING_NODES = ("pulidfluxmodelloader", "applypulidflux", "ipadapterinsightfaceloader")
        return "missing_node_type" in msg or any(n in msg for n in MISSING_NODES)

    async def _upload_ref(self, client, url_path: Optional[str], label: str) -> Optional[str]:
        """Upload a reference image to ComfyUI. Returns ComfyUI filename or None."""
        if not url_path:
            print(f"[comfyui_panel] no {label} ref path")
            return None
        local = self._url_to_local(url_path)
        print(f"[comfyui_panel] uploading {label}: {local}")
        try:
            name = await client.upload_image(local)
            print(f"[comfyui_panel] {label} uploaded as: {name}")
            return name
        except Exception as e:
            print(f"[comfyui_panel] ⚠️  {label} upload failed: {e}")
            return None

    async def _comfyui_flux_background(self, prompt: str, out_path: str, w: int, h: int,
                                        guidance: float = 4.5):
        """Pure FLUX background generation — used by sheets and variations.
        guidance=4.5 (default) for character images = sharp, defined lines.
        Pass guidance=3.5 for painterly scene panels.
        """
        from backend.services.comfyui_client import ComfyUIClient
        client = ComfyUIClient()
        patches = client.build_flux_patches(
            positive_prompt=prompt,
            width=w, height=h,
            seed=random.randint(0, 2**32),
            guidance=guidance,
        )
        await client.generate("flux_background", patches, out_path)

    async def _comfyui_flux_char_from_ref(
        self,
        prompt: str,
        face_ref_name: str,     # ComfyUI filename (already uploaded via upload_image)
        out_path: str,
        w: int,
        h: int,
        seed: int,
        guidance: float = 3.5,
        pulid_weight: float = 0.85,
        ipadapter_weight: float = 0.5,
    ):
        """Generate a character sheet view using PuLID + IP-Adapter locked to
        the selected variation.

        pulid_weight=0.85 → strong identity lock (good for character sheets;
            lower to 0.6–0.7 for panels where scene context matters more).
        ipadapter_weight=0.5 → carries clothing/style from the reference image.
        Both images point to the same uploaded variation file: face for PuLID,
        body for IP-Adapter style transfer.

        Falls back to text-only flux_background if PuLID nodes are missing.
        """
        from backend.services.comfyui_client import ComfyUIClient
        client = ComfyUIClient()
        patches = client.build_flux_char_patches(
            positive_prompt=prompt,
            face_image_path=face_ref_name,
            body_image_path=face_ref_name,   # variation image = both face & style ref
            width=w, height=h, seed=seed,
            guidance=guidance,
            pulid_weight=pulid_weight,
            ipadapter_weight=ipadapter_weight,
        )
        try:
            await client.generate("flux_single_char", patches, out_path)
        except Exception as e:
            if self._is_pulid_missing(e):
                print(
                    "[sheet] ⚠️  PuLID not installed — run B2 in Colab notebook. "
                    "Falling back to text-only for this view."
                )
                # Graceful degradation: text-only is still consistent in style
                fb_patches = client.build_flux_patches(
                    positive_prompt=prompt,
                    width=w, height=h, seed=seed, guidance=4.5,
                )
                await client.generate("flux_background", fb_patches, out_path)
            else:
                raise

    @staticmethod
    def _url_to_local(url_path: str) -> str:
        """Convert /static/sheets/xxx.png → absolute filesystem path."""
        if url_path.startswith("/static/"):
            relative = url_path[len("/static/"):]
        else:
            relative = url_path.lstrip("/")
        # Always resolve to absolute path — avoids cwd-dependent bugs
        # when uvicorn is launched from a different working directory.
        abs_storage = os.path.abspath(STORAGE_PATH)
        result = os.path.join(abs_storage, relative)
        if not os.path.exists(result):
            print(f"[_url_to_local] ⚠️  file not found: {result}  (STORAGE_PATH={STORAGE_PATH})")
        return result

    # ── Background removal (optional, default OFF for FLUX) ───────────────────

    @staticmethod
    def _remove_background(image_path: str) -> None:
        """
        Strip the background from image_path and replace it with pure white.
        Only runs when REMOVE_BACKGROUND_ENABLED=true. Default is false for
        FLUX because FLUX follows 'pure white background' reliably without it.
        """
        try:
            from rembg import remove
            from PIL import Image
            img = Image.open(image_path).convert("RGBA")
            no_bg = remove(img)
            white = Image.new("RGBA", no_bg.size, (255, 255, 255, 255))
            white.paste(no_bg, mask=no_bg.split()[3])
            white.convert("RGB").save(image_path)
        except Exception as e:
            print(f"[info] rembg background removal skipped ({e})")

    # ── Mock generators ────────────────────────────────────────────────────────

    def _mock_image(self, path: str, label: str, w: int, h: int, panel_type: str):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        import random as _r
        color = _r.choice(MOCK_PALETTE)
        img = Image.new("RGB", (w, h), color)
        draw = ImageDraw.Draw(img)
        draw.rectangle([4, 4, w - 5, h - 5], outline="white", width=3)
        try:
            font = ImageFont.truetype("arial.ttf", 20)
        except Exception:
            font = ImageFont.load_default()
        wrapped = self._wrap(label, 40)
        draw.multiline_text((20, 20), f"[{panel_type.upper()}]\n\n{wrapped}", fill="white", font=font, spacing=6)
        draw.text((20, h - 40), "Comic Studio — MOCK", fill="#aaaaaa", font=font)
        img.save(path, "PNG")

    def _mock_variation(self, path: str, name: str, idx: int):
        colors = ["#1a1a2e", "#2d6a4f", "#6d3b47", "#533483"]
        os.makedirs(os.path.dirname(path), exist_ok=True)
        img = Image.new("RGB", (512, 512), colors[idx % 4])
        draw = ImageDraw.Draw(img)
        draw.rectangle([8, 8, 503, 503], outline="white", width=4)
        try:
            font = ImageFont.truetype("arial.ttf", 28)
        except Exception:
            font = ImageFont.load_default()
        draw.text((30, 200), f"{name}\nVariation {idx + 1}", fill="white", font=font)
        draw.text((30, 460), "MOCK", fill="#aaaaaa", font=font)
        img.save(path, "PNG")

    def _mock_sheet_view(self, path: str, name: str, label: str):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        img = Image.new("RGB", (512, 768), "#f0f0f0")
        draw = ImageDraw.Draw(img)
        draw.rectangle([8, 8, 503, 759], outline="#333333", width=3)
        try:
            font = ImageFont.truetype("arial.ttf", 22)
        except Exception:
            font = ImageFont.load_default()
        draw.text((30, 340), f"{name}\n{label}", fill="#333333", font=font)
        draw.text((30, 730), "MOCK SHEET", fill="#999999", font=font)
        img.save(path, "PNG")

    @staticmethod
    def _wrap(text: str, width: int) -> str:
        words = text.split()
        lines, line = [], []
        for w in words:
            if sum(len(x) + 1 for x in line) + len(w) > width:
                lines.append(" ".join(line))
                line = [w]
            else:
                line.append(w)
        if line:
            lines.append(" ".join(line))
        return "\n".join(lines[:8])
