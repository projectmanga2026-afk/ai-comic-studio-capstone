# Appendix A: Source Code

## 1. Backend API & Inference (Python)

### File: backend\main.py
```python
import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from backend.database import init_db
from backend.routers import characters, panels, pages, bubbles, generation

load_dotenv(dotenv_path=Path(__file__).parent / '.env')

STORAGE_PATH = os.getenv("STORAGE_PATH", "./storage")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create storage directories
    for sub in ["characters", "variations", "sheets", "panels", "exports", "temp", "pages"]:
        os.makedirs(os.path.join(STORAGE_PATH, sub), exist_ok=True)
    # Init DB tables
    init_db()
    yield


app = FastAPI(
    title="Comic Studio API",
    description="AI-assisted comic creation backend",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ───────────────────────────────────────────────────────────────────────
# allow_origins=["*"] is intentional — this backend is accessed via ngrok from
# a local Next.js dev server whose origin changes each session.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Static file serving ────────────────────────────────────────────────────────
os.makedirs(STORAGE_PATH, exist_ok=True)
app.mount("/static", StaticFiles(directory=STORAGE_PATH), name="static")

# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(characters.router, prefix="/characters", tags=["Characters"])
app.include_router(panels.router, prefix="/panels", tags=["Panels"])
app.include_router(pages.router, prefix="/pages", tags=["Pages"])
app.include_router(bubbles.router, prefix="/pages", tags=["Bubbles"])
app.include_router(generation.router, prefix="/generation", tags=["Generation"])


@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/debug")
def debug():
    """Shows exactly what the running server thinks its config is."""
    import os, httpx
    backend = os.getenv("GENERATION_BACKEND", "mock")
    comfyui_url = os.getenv("COMFYUI_URL", "http://127.0.0.1:8188")
    db_url = os.getenv("DATABASE_URL", "sqlite:///./comic_studio.db")
    storage = os.getenv("STORAGE_PATH", "./storage")

    # Test ComfyUI connectivity
    comfyui_status = "unreachable"
    try:
        r = httpx.get(f"{comfyui_url}/system_stats", timeout=3)
        comfyui_status = "ok" if r.status_code == 200 else f"http {r.status_code}"
    except Exception as e:
        comfyui_status = f"error: {e}"

    return {
        "GENERATION_BACKEND": backend,
        "DATABASE_URL": db_url,
        "STORAGE_PATH": storage,
        "COMFYUI_URL": comfyui_url,
        "comfyui_reachable": comfyui_status,
    }


@app.get("/test-comfyui")
async def test_comfyui():
    """
    Runs a minimal real ComfyUI generation and returns the exact error if it fails.
    Visit this URL in a browser tab right after clicking Generate.
    """
    import traceback
    from backend.services.comfyui_client import ComfyUIClient

    checkpoint = os.getenv("SDXL_CHECKPOINT", "sd_xl_base_1.0.safetensors")
    storage_path = os.getenv("STORAGE_PATH", "./storage")
    out_path = os.path.join(storage_path, "temp", "comfyui_test.png")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    try:
        client = ComfyUIClient()
        patches = client.build_background_patches(
            positive_prompt="a simple blue sky, test image",
            negative_prompt="blurry",
            width=512, height=512,
            seed=42,
            checkpoint=checkpoint,
        )
        await client.generate("background_only", patches, out_path)
        return {
            "result": "success",
            "file_written": os.path.exists(out_path),
            "output_path": out_path,
            "checkpoint": checkpoint,
        }
    except Exception as e:
        return {
            "result": "failed",
            "error": str(e),
            "traceback": traceback.format_exc(),
            "checkpoint": checkpoint,
        }
@app.get("/debug-nodes")
async def debug_nodes():
    """
    Query ComfyUI for the exact input schema of every InstantID/IPAdapter node.
    Open {ngrok_url}/debug-nodes in a browser — no need to kill A6.
    """
    import httpx
    comfyui_url = os.getenv("COMFYUI_URL", "http://127.0.0.1:8188")
    nodes = [
        "InstantIDFaceAnalysis", "InstantIDModelLoader", "ApplyInstantID",
        "IPAdapterModelLoader", "IPAdapterAdvanced", "ControlNetLoader",
    ]
    result = {}
    async with httpx.AsyncClient(timeout=10) as client:
        for node_class in nodes:
            try:
                r = await client.get(f"{comfyui_url}/object_info/{node_class}")
                if r.status_code == 200:
                    info = r.json().get(node_class, {})
                    inp = info.get("input", {})
                    required = {k: v for k, v in inp.get("required", {}).items()}
                    optional = list(inp.get("optional", {}).keys())
                    # Simplify list choices for readability
                    simplified = {}
                    for k, v in required.items():
                        if isinstance(v, list) and len(v) > 0 and isinstance(v[0], list):
                            simplified[k] = {"choices": v[0][:8]}
                        else:
                            simplified[k] = v[1] if isinstance(v, list) and len(v) > 1 else "connected"
                    result[node_class] = {
                        "status": "registered",
                        "required_inputs": simplified,
                        "optional_inputs": optional,
                    }
                else:
                    result[node_class] = {"status": "NOT_FOUND", "http": r.status_code}
            except Exception as e:
                result[node_class] = {"status": "error", "detail": str(e)}
    return result



```

### File: backend\database.py
```python
import os
from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from dotenv import load_dotenv

# Explicitly load from backend/.env relative to this file — uvicorn may run
# from a parent directory where load_dotenv() with no args won't find the file
load_dotenv(dotenv_path=Path(__file__).parent / '.env')

DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./comic_studio.db")

connect_args: dict = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    echo=False,
)

# Enable WAL mode for SQLite (better concurrent read performance)
if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency — yields a DB session and closes it when done."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables. Called on app startup."""
    import backend.models  # noqa: F401 — side-effect: registers models with Base
    Base.metadata.create_all(bind=engine)



```

### File: backend\services\comfyui_client.py
```python
"""
ComfyUI API client.

Connects to a running ComfyUI instance at COMFYUI_URL and submits
workflow JSON via the /prompt endpoint. Polls /history/{prompt_id}
until the job completes, then downloads the output image.

Workflow templates are in backend/workflows/.
The client patches placeholder values (prompts, model names, dimensions,
face-embed image paths for PuLID/InstantID) before submitting.
"""

import asyncio
import copy
import json
import os
import uuid
from pathlib import Path
from typing import Optional

import httpx

COMFYUI_URL = os.getenv("COMFYUI_URL", "http://127.0.0.1:8188")
COMFYUI_OUTPUT_DIR = os.getenv("COMFYUI_OUTPUT_DIR", "/content/ComfyUI/output")
WORKFLOWS_DIR = Path(__file__).parent.parent / "workflows"
POLL_INTERVAL = 2.0   # seconds between status checks
POLL_TIMEOUT  = 900   # 15 min — covers FLUX+PuLID cold start (loading all models into VRAM)
                      # After first generation, everything is cached in VRAM (~90s per panel)

# ── FLUX model names (set in .env via notebook A5) ────────────────────────────
FLUX_UNET      = os.getenv("FLUX_UNET",      "flux1-dev.safetensors")
FLUX_VAE       = os.getenv("FLUX_VAE",       "ae.safetensors")
FLUX_T5        = os.getenv("FLUX_T5",        "t5xxl_fp8_e4m3fn.safetensors")
FLUX_CLIP_L    = os.getenv("FLUX_CLIP_L",    "clip_l.safetensors")
PULID_MODEL    = os.getenv("PULID_MODEL",    "pulid_flux_v0.9.1.safetensors")
FLUX_IPADAPTER = os.getenv("FLUX_IPADAPTER", "ip-adapter.bin")

# ── Style LoRA (optional) ─────────────────────────────────────────────────────
# STYLE_LORA_NAME  = just the filename, e.g. "comicstyle_flux_v1.safetensors"
# STYLE_LORA_TRIGGER = the activation keyword, e.g. "comicstyle"
# Set both in A5; leave blank if you have no style LoRA yet.
STYLE_LORA_NAME    = os.getenv("STYLE_LORA_NAME",    "")  # filename inside ComfyUI/models/loras/
STYLE_LORA_TRIGGER = os.getenv("STYLE_LORA_TRIGGER", "")  # text trigger word
STYLE_LORA_WEIGHT  = float(os.getenv("STYLE_LORA_WEIGHT", "1.0"))


class ComfyUIError(Exception):
    pass


class ComfyUIClient:

    def __init__(self):
        self.base = COMFYUI_URL.rstrip("/")
        self.client_id = str(uuid.uuid4())

    # ── Public API ─────────────────────────────────────────────────────────────

    async def generate(
        self,
        workflow_name: str,
        patches: dict,
        output_path: str,
    ) -> str:
        """
        Load a workflow template, apply `patches`, submit to ComfyUI,
        wait for completion, download output image to `output_path`.
        Returns output_path on success.
        """
        workflow = self._load_workflow(workflow_name)
        # Unique prefix so we can find the output file by name (avoids JSON-parsing the history)
        file_prefix = f"cs_{self.client_id[:12]}"
        if "12" in workflow:
            workflow["12"]["inputs"]["filename_prefix"] = file_prefix
        workflow = self._apply_patches(workflow, patches)
        prompt_id = await self._submit(workflow)
        output_filename = await self._poll(prompt_id, file_prefix)
        await self._download(output_filename, output_path)
        return output_path

    # ── Helpers ────────────────────────────────────────────────────────────────

    def _load_workflow(self, name: str) -> dict:
        path = WORKFLOWS_DIR / f"{name}.json"
        if not path.exists():
            raise ComfyUIError(f"Workflow not found: {path}")
        with open(path) as f:
            return json.load(f)

    def _apply_patches(self, workflow: dict, patches: dict) -> dict:
        wf = copy.deepcopy(workflow)
        patches = copy.deepcopy(patches)  # don't mutate the caller's dict
        for node_id, inputs in patches.items():
            if node_id in wf:
                # Existing node — merge inputs
                wf[node_id]["inputs"].update(inputs)
            else:
                # New node injection (e.g. LoraLoader added dynamically)
                # Requires a "_class_type" key in the patch dict.
                class_type = inputs.pop("_class_type", None)
                if class_type:
                    wf[node_id] = {"inputs": inputs, "class_type": class_type}
                else:
                    print(f"[patch] ⚠️  node '{node_id}' not in workflow and no _class_type — skipped")
        return wf

    async def _submit(self, workflow: dict) -> str:
        payload = {"prompt": workflow, "client_id": self.client_id}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{self.base}/prompt", json=payload)
            if resp.status_code != 200:
                # Include the full ComfyUI error body so we can see which node failed
                try:
                    detail = resp.json()
                    node_errors = detail.get("node_errors", {})
                    err_summary = "; ".join(
                        f"node {nid} ({info.get('class_type','?')}): "
                        + ", ".join(e.get("message","?") for e in info.get("errors", []))
                        for nid, info in node_errors.items()
                    ) or str(detail)
                except Exception:
                    err_summary = resp.text[:500]
                raise ComfyUIError(
                    f"ComfyUI /prompt rejected workflow (HTTP {resp.status_code}): {err_summary}"
                )
            data = resp.json()
            prompt_id = data.get("prompt_id")
            if not prompt_id:
                raise ComfyUIError(f"ComfyUI did not return a prompt_id: {data}")
            return prompt_id

    async def _poll(self, prompt_id: str, file_prefix: str = "") -> str:
        """
        Two-pronged polling strategy:
        1. Scan ComfyUI's output dir directly by filename prefix (fast, no JSON)
        2. Fall back to /history API (may fail if response contains tensor reprs)
        """
        elapsed = 0.0
        while elapsed < POLL_TIMEOUT:
            await asyncio.sleep(POLL_INTERVAL)
            elapsed += POLL_INTERVAL

            # ── Strategy 1: scan output directory ──────────────────────────────
            if file_prefix and os.path.isdir(COMFYUI_OUTPUT_DIR):
                matches = [
                    f for f in os.listdir(COMFYUI_OUTPUT_DIR)
                    if f.startswith(file_prefix) and f.endswith(".png")
                ]
                if matches:
                    fname = sorted(matches)[-1]  # latest if multiple
                    print(f"[poll] ✅ found output file after {elapsed:.0f}s: {fname}")
                    return fname

            # ── Strategy 2: history API (may have huge JSON, so short timeout) ─
            try:
                async with httpx.AsyncClient(timeout=5) as client:
                    resp = await client.get(f"{self.base}/history/{prompt_id}")
                if resp.status_code == 200:
                    try:
                        history = resp.json()
                        if prompt_id in history:
                            entry = history[prompt_id]
                            status_info = entry.get("status", {})
                            if status_info.get("status_str") == "error":
                                # Extract the real execution_error message
                                messages = status_info.get("messages", [])
                                real_error = next(
                                    (m[1] for m in messages if isinstance(m, list) and m[0] == "execution_error"),
                                    messages
                                )
                                raise ComfyUIError(f"ComfyUI node execution failed: {real_error}")
                            outputs = entry.get("outputs", {})
                            for node_output in outputs.values():
                                images = node_output.get("images", [])
                                if images:
                                    fname = images[0]["filename"]
                                    print(f"[poll] ✅ history hit after {elapsed:.0f}s: {fname}")
                                    return fname
                    except ComfyUIError:
                        raise  # let it propagate — don't swallow it
                    except (json.JSONDecodeError, UnicodeDecodeError) as je:
                        print(f"[poll] {elapsed:.0f}s — history JSON unparseable ({je!s:.60}), using dir scan")
            except ComfyUIError:
                raise  # propagate execution errors immediately
            except Exception as e:
                print(f"[poll] {elapsed:.0f}s — history request error: {e!s:.80}")

            if int(elapsed) % 10 == 0:
                print(f"[poll] {elapsed:.0f}s — waiting for ComfyUI…")

        raise ComfyUIError(f"ComfyUI job timed out after {POLL_TIMEOUT}s")

    async def _download(self, filename: str, dest_path: str) -> None:
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(
                f"{self.base}/view",
                params={"filename": filename, "type": "output"},
            )
            resp.raise_for_status()
            with open(dest_path, "wb") as f:
                f.write(resp.content)

    async def upload_image(self, local_path: str) -> str:
        """
        Upload a local image file to ComfyUI's input directory.
        Returns the filename ComfyUI assigned to it (use this in LoadImage nodes).
        """
        if not os.path.exists(local_path):
            raise ComfyUIError(f"Reference image not found on disk: {local_path}")
        filename = os.path.basename(local_path)
        async with httpx.AsyncClient(timeout=60) as client:
            with open(local_path, "rb") as f:
                resp = await client.post(
                    f"{self.base}/upload/image",
                    files={"image": (filename, f, "image/png")},
                )
            resp.raise_for_status()
            data = resp.json()
            return data["name"]

    # ── FLUX workflow patch builders ───────────────────────────────────────────

    def _maybe_inject_lora(self, patches: dict) -> dict:
        """
        If a style LoRA is configured (STYLE_LORA_NAME set), dynamically insert
        a LoraLoader node (id=70) between the UNET loader and the KSampler.

        Before: UNETLoader(1) → KSampler(10)[model: ["1",0]]
        After:  UNETLoader(1) → LoraLoader(70) → KSampler(10)[model: ["70",0]]

        This must be called AFTER _flux_base_patches() so node "10" already exists.
        """
        if not STYLE_LORA_NAME:
            return patches  # no LoRA configured — nothing to do

        # Insert LoraLoader node wired between UNET and KSampler
        patches["70"] = {
            "_class_type": "LoraLoader",
            "lora_name": STYLE_LORA_NAME,
            "strength_model": STYLE_LORA_WEIGHT,
            "strength_clip":  STYLE_LORA_WEIGHT,
            "model": ["1", 0],   # takes UNET output
            "clip":  ["6", 0],   # takes CLIP output
        }
        # Rewire KSampler to use LoRA-patched model instead of raw UNET
        if "10" in patches:
            patches["10"]["model"] = ["70", 0]
        print(f"[lora] ✅ Style LoRA injected: {STYLE_LORA_NAME} (weight={STYLE_LORA_WEIGHT})")
        return patches

    def _flux_base_patches(self, width: int, height: int, seed: int, guidance: float = 4.5) -> dict:
        """Common patches for all FLUX workflows.
        Quality params (steps/sampler) live here — they override the JSON defaults
        so always keep them in sync with what you want.
        Guidance 4.5 = sharp character lines. Drop to 3.5 for painterly/soft scenes.
        """
        return {
            "1":  {"unet_name": FLUX_UNET},
            "6":  {"clip_name1": FLUX_T5, "clip_name2": FLUX_CLIP_L},
            "5":  {"vae_name": FLUX_VAE},
            "35": {"guidance": guidance},
            "9":  {"width": width, "height": height, "batch_size": 1},
            "10": {
                "seed": seed,
                "steps": 30,          # 30 steps: converges cleanly on all seeds
                "cfg": 1.0,           # FLUX ignores cfg, guidance node does the work
                "sampler_name": "euler",
                "scheduler": "simple", # simple = proven stable for FLUX
            },
        }

    def build_flux_patches(
        self,
        positive_prompt: str,
        width: int,
        height: int,
        seed: int,
        guidance: float = 4.5,
    ) -> dict:
        """Patches for flux_background.json — no face guidance."""
        patches = self._flux_base_patches(width, height, seed, guidance)
        patches["2"] = {"text": positive_prompt}
        return self._maybe_inject_lora(patches)

    def build_flux_char_patches(
        self,
        positive_prompt: str,
        face_image_path: str,
        body_image_path: Optional[str],
        width: int,
        height: int,
        seed: int,
        guidance: float = 3.5,
        pulid_weight: float = 0.9,
        ipadapter_weight: float = 0.4,
    ) -> dict:
        """Patches for flux_single_char.json — PuLID + IP-Adapter."""
        patches = self._flux_base_patches(width, height, seed, guidance)
        patches["2"]  = {"text": positive_prompt}
        patches["40"] = {"pulid_file": PULID_MODEL}
        patches["22"] = {"ipadapter_file": FLUX_IPADAPTER}
        patches["30"] = {"clip_name": FLUX_CLIP_L}
        patches["50"] = {"weight": pulid_weight, "start_at": 0.0, "end_at": 0.7}
        patches["60"] = {"weight": ipadapter_weight, "start_at": 0.0, "end_at": 0.8}
        patches["20"] = {"image": face_image_path}
        if body_image_path:
            patches["21"] = {"image": body_image_path}
        return self._maybe_inject_lora(patches)

    def build_flux_dual_char_patches(
        self,
        positive_prompt: str,
        face1_image_path: str,
        body1_image_path: Optional[str],
        face2_image_path: str,
        width: int,
        height: int,
        seed: int,
        guidance: float = 3.5,
        pulid_weight: float = 0.7,
        ipadapter_weight: float = 0.35,
    ) -> dict:
        """Patches for flux_dual_char.json — two chained PuLID nodes."""
        patches = self._flux_base_patches(width, height, seed, guidance)
        patches["2"]  = {"text": positive_prompt}
        patches["40"] = {"pulid_file": PULID_MODEL}
        patches["22"] = {"ipadapter_file": FLUX_IPADAPTER}
        patches["30"] = {"clip_name": FLUX_CLIP_L}
        patches["50"] = {"weight": pulid_weight, "start_at": 0.0, "end_at": 0.7}
        patches["51"] = {"weight": pulid_weight, "start_at": 0.0, "end_at": 0.7}
        patches["60"] = {"weight": ipadapter_weight, "start_at": 0.0, "end_at": 0.75}
        patches["20"] = {"image": face1_image_path}
        patches["23"] = {"image": face2_image_path}
        if body1_image_path:
            patches["21"] = {"image": body1_image_path}
        return self._maybe_inject_lora(patches)

    # ── Legacy SDXL patch builders (kept for rollback) ─────────────────────────

    def build_instantid_patches(
        self,
        positive_prompt: str,
        negative_prompt: str,
        face_image_path: Optional[str],
        front_image_path: Optional[str],
        width: int,
        height: int,
        seed: int,
        checkpoint: str,
    ) -> dict:
        """SDXL InstantID patches — kept for rollback to instantid_single_char workflow."""
        patches = {
            "2":  {"text": positive_prompt},
            "3":  {"text": negative_prompt},
            "4":  {"ckpt_name": checkpoint},
            "9":  {"width": width, "height": height, "batch_size": 1},
            "10": {"seed": seed, "steps": 30, "cfg": 7.5,
                   "sampler_name": "dpmpp_2m_sde", "scheduler": "karras"},
            "18": {"weight": 0.35, "start_at": 0.0, "end_at": 0.65},
            "19": {"weight": 0.25, "weight_type": "ease in-out",
                   "start_at": 0.0, "end_at": 0.6},
        }
        if face_image_path:
            patches["20"] = {"image": face_image_path}
        if front_image_path:
            patches["21"] = {"image": front_image_path}
        return patches

    def build_background_patches(
        self,
        positive_prompt: str,
        negative_prompt: str,
        width: int,
        height: int,
        seed: int,
        checkpoint: str,
    ) -> dict:
        """SDXL background patches — kept for rollback to background_only workflow."""
        return {
            "2":  {"text": positive_prompt},
            "3":  {"text": negative_prompt},
            "4":  {"ckpt_name": checkpoint},
            "9":  {"width": width, "height": height, "batch_size": 1},
            "10": {"seed": seed, "steps": 30, "cfg": 7.0},
        }



```


### File: backend\workflows\flux_single_char.json
```json
{
  "1":  {"inputs": {"unet_name": "FLUX_UNET", "weight_dtype": "default"}, "class_type": "UNETLoader"},
  "6":  {"inputs": {"clip_name1": "FLUX_T5", "clip_name2": "FLUX_CLIP_L", "type": "flux"}, "class_type": "DualCLIPLoader"},
  "5":  {"inputs": {"vae_name": "FLUX_VAE"}, "class_type": "VAELoader"},
  "2":  {"inputs": {"text": "POSITIVE_PROMPT", "clip": ["6", 0]}, "class_type": "CLIPTextEncode"},
  "3":  {"inputs": {"text": "", "clip": ["6", 0]}, "class_type": "CLIPTextEncode"},
  "35": {"inputs": {"guidance": 3.5, "conditioning": ["2", 0]}, "class_type": "FluxGuidance"},
  "9":  {"inputs": {"width": 832, "height": 1216, "batch_size": 1}, "class_type": "EmptySD3LatentImage"},
  "15": {"inputs": {"provider": "CUDA"}, "class_type": "IPAdapterInsightFaceLoader"},
  "40": {"inputs": {"pulid_file": "PULID_MODEL"}, "class_type": "PulidFluxModelLoader"},
  "20": {"inputs": {"image": "face_reference.png", "upload": "image"}, "class_type": "LoadImage"},
  "21": {"inputs": {"image": "body_reference.png", "upload": "image"}, "class_type": "LoadImage"},
  "22": {"inputs": {"ipadapter_file": "FLUX_IPADAPTER"}, "class_type": "IPAdapterModelLoader"},
  "30": {"inputs": {"clip_name": "FLUX_CLIP_L"}, "class_type": "CLIPVisionLoader"},
  "50": {"inputs": {
          "weight": 0.9,
          "start_at": 0.0,
          "end_at": 0.7,
          "model": ["1", 0],
          "pulid": ["40", 0],
          "eva_clip": ["40", 1],
          "face_analysis": ["15", 0],
          "image": ["20", 0]},
         "class_type": "ApplyPulidFlux"},
  "60": {"inputs": {
          "weight": 0.4,
          "weight_type": "linear",
          "combine_embeds": "concat",
          "start_at": 0.0,
          "end_at": 0.8,
          "embeds_scaling": "V only",
          "model": ["50", 0],
          "ipadapter": ["22", 0],
          "image": ["21", 0],
          "clip_vision": ["30", 0]},
         "class_type": "IPAdapterAdvanced"},
  "10": {"inputs": {
          "seed": 42, "steps": 28, "cfg": 1.0,
          "sampler_name": "euler", "scheduler": "beta", "denoise": 1.0,
          "model": ["60", 0],
          "positive": ["35", 0],
          "negative": ["3", 0],
          "latent_image": ["9", 0]},
         "class_type": "KSampler"},
  "11": {"inputs": {"samples": ["10", 0], "vae": ["5", 0]}, "class_type": "VAEDecode"},
  "12": {"inputs": {"filename_prefix": "panel_flux_char", "images": ["11", 0]}, "class_type": "SaveImage"}
}



```



## 2. Frontend Application (React / TypeScript)
### File: frontend\components\assembly\ComicCanvas.tsx
```tsx
'use client'
import { useRef, useEffect, useCallback, useState } from 'react'
import dynamic from 'next/dynamic'
import { useAssemblyStore } from '@/store/assemblyStore'
import { usePanelStore } from '@/store/panelStore'
import { staticUrl } from '@/lib/api'
import { Trash2, FlipHorizontal, ZoomIn, ZoomOut, Move, Hand, Minus, Plus } from 'lucide-react'
import type { SlotData } from '@/types'

const CANVAS_W = 800
const CANVAS_H = 1100

// ── Konva canvas — SSR-safe ────────────────────────────────────────────────────
// All Konva components must come from the same import and be used inside one Stage.
// Individual dynamic() per component breaks the React-Konva context (causes
// "Element type is invalid — received a Promise that resolves to: Layer").
const KonvaCanvas = dynamic(() => import('./KonvaCanvas'), {
  ssr: false,
  loading: () => (
    <div
      style={{ width: '100%', height: '100%', minHeight: 400, background: '#fff' }}
      className="flex items-center justify-center text-zinc-400 text-sm"
    >
      Loading canvas…
    </div>
  ),
})

export default function ComicCanvas({ children, onBackgroundClick }: { children?: React.ReactNode, onBackgroundClick?: () => void }) {
  const { currentPage, slots, assignPanel, addCustomSlot, selectedSlotId, deleteSlot, updateSlotImageState, setSelectedSlotId } = useAssemblyStore()
  const { panels } = usePanelStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<any>(null)
  const [scale, setScale] = useState(1)

  const canvasW = currentPage?.canvas_width || CANVAS_W
  const canvasH = currentPage?.canvas_height || CANVAS_H

  // Initial fit scaling
  useEffect(() => {
    if (!containerRef.current) return
    const { clientWidth, clientHeight } = containerRef.current
    const scaleX = (clientWidth - 48) / canvasW
    const scaleY = (clientHeight - 48) / canvasH
    setScale(Math.min(scaleX, scaleY, 1))
  }, [canvasW, canvasH, currentPage])

  // Handle drop from panel sidebar
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const panelId = e.dataTransfer.getData('panel_id')
    if (!panelId) return
    const panel = panels.find(p => p.id === panelId)
    if (!panel) return
    if (!wrapperRef.current) return

    const box = wrapperRef.current.getBoundingClientRect()

    const dropX = (e.clientX - box.left) / scale
    const dropY = (e.clientY - box.top) / scale

    const url = staticUrl(panel.image_path)
    if (!url) return

    if (currentPage?.template === 'custom') {
      let aspect = 1
      if (panel.aspect_ratio) {
        const [wStr, hStr] = panel.aspect_ratio.split(':')
        aspect = Number(wStr) / Number(hStr) || 1
      }

      const width = 300
      const height = width / aspect

      const newSlot: SlotData = {
        slot_id: `custom-${Date.now()}`,
        x: dropX - width / 2,
        y: dropY - height / 2,
        width,
        height,
        panel_id: panel.id,
        panel_image_url: url,
        z_index: slots.length + 1,
        scale: 1,
        rotation: 0
      }
      addCustomSlot(newSlot)
      setSelectedSlotId(newSlot.slot_id)
    } else {
      const targetSlot = slots.find(s =>
        dropX >= s.x && dropX <= s.x + s.width &&
        dropY >= s.y && dropY <= s.y + s.height
      )
      if (targetSlot) {
        assignPanel(targetSlot.slot_id, panelId, url)
        setSelectedSlotId(targetSlot.slot_id)
      }
    }
  }, [slots, panels, assignPanel, addCustomSlot, setSelectedSlotId, scale, currentPage])

  // Export handler
  useEffect(() => {
    const btn = document.getElementById('export-btn')
    if (!btn) return
    const handler = () => {
      if (stageRef.current) {
        const url = stageRef.current.toDataURL({ pixelRatio: 2 })
        const a = document.createElement('a')
        a.href = url
        a.download = `${currentPage?.title || 'comic-page'}.png`
        a.click()
      }
    }
    btn.addEventListener('click', handler)
    return () => btn.removeEventListener('click', handler)
  }, [currentPage])

  // Thumbnail/image capture — dispatched by saveThumbnail() and savePageImage() in lib/thumbnail.ts
  useEffect(() => {
    const handler = (e: Event) => {
      const { resolve, pixelRatio = 0.4, mimeType = 'jpeg', quality = 0.7 } = (e as CustomEvent).detail || {}
      if (stageRef.current) {
        const dataUrl = stageRef.current.toDataURL({
          pixelRatio,
          mimeType: `image/${mimeType}`,
          quality,
        })
        resolve?.(dataUrl)
      } else {
        resolve?.(null)
      }
    }
    window.addEventListener('comic-capture-thumbnail', handler)
    return () => window.removeEventListener('comic-capture-thumbnail', handler)
  }, [])

  const selectedSlot = selectedSlotId ? slots.find(s => s.slot_id === selectedSlotId) : null
  const isCustom = currentPage?.template === 'custom'

  return (
    <>
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-auto flex p-6"
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={(e) => { setSelectedSlotId(null); onBackgroundClick?.() }}
      >
        <div ref={wrapperRef} className="relative m-auto shrink-0" onClick={e => e.stopPropagation()}>
          <KonvaCanvas 
          stageRef={stageRef}
          slots={slots}
          canvasW={canvasW}
          canvasH={canvasH}
          scale={scale}
          isCustom={isCustom}
          onBackgroundClick={onBackgroundClick}
        >
          {children}
        </KonvaCanvas>  {/* Floating Toolbar */}
          {selectedSlot && (
            <div
              className="absolute flex flex-col gap-1 bg-zinc-900 border border-zinc-700 p-1.5 rounded-lg shadow-xl z-50 animate-fade-in"
              style={{
                top: selectedSlot.y * scale,
                left: (selectedSlot.x + selectedSlot.width) * scale + 12
              }}
            >
              {/* Delete */}
              <button title="Delete" onClick={() => deleteSlot(selectedSlot.slot_id, isCustom)} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-red-400 transition-colors">
                <Trash2 size={16} />
              </button>
              <div className="h-px bg-zinc-800 my-0.5" />

              {/* Pan / Move toggle (custom layout only) */}
              {isCustom && (
                <>
                  <button
                    title={selectedSlot.isPanMode ? "Switch to Move Panel Mode" : "Switch to Pan Image Mode"}
                    onClick={() => updateSlotImageState(selectedSlot.slot_id, { isPanMode: !selectedSlot.isPanMode })}
                    className={`p-1.5 rounded-md transition-colors ${selectedSlot.isPanMode ? 'bg-violet-500/20 text-violet-400' : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'}`}
                  >
                    {selectedSlot.isPanMode ? <Hand size={16} /> : <Move size={16} />}
                  </button>
                  <div className="h-px bg-zinc-800 my-0.5" />
                </>
              )}

              {/* Flip + Zoom (only when image is assigned) */}
              {selectedSlot.panel_image_url && (
                <>
                  <button title="Flip Horizontal" onClick={() => updateSlotImageState(selectedSlot.slot_id, { flipX: !selectedSlot.flipX })} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors">
                    <FlipHorizontal size={16} />
                  </button>
                  <div className="h-px bg-zinc-800 my-0.5" />
                  <button title="Zoom In" onClick={() => updateSlotImageState(selectedSlot.slot_id, { scale: Math.min((selectedSlot.scale || 1) + 0.1, 3) })} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors">
                    <ZoomIn size={16} />
                  </button>
                  <button title="Zoom Out" onClick={() => updateSlotImageState(selectedSlot.slot_id, { scale: Math.max((selectedSlot.scale || 1) - 0.1, 0.5) })} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors">
                    <ZoomOut size={16} />
                  </button>
                  <div className="h-px bg-zinc-800 my-0.5" />
                </>
              )}

              {/* ── Outline thickness ── */}
              <div className="flex flex-col items-center gap-0.5 px-0.5">
                <span className="text-[9px] text-zinc-500 uppercase tracking-wide leading-none mb-0.5">Border</span>
                <button title="Thicker" onClick={() => updateSlotImageState(selectedSlot.slot_id, { borderWidth: Math.min((selectedSlot.borderWidth ?? 2) + 1, 16) })} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors">
                  <Plus size={14} />
                </button>
                <span className="text-[11px] font-mono text-zinc-300 tabular-nums w-5 text-center">{selectedSlot.borderWidth ?? 2}</span>
                <button title="Thinner" onClick={() => updateSlotImageState(selectedSlot.slot_id, { borderWidth: Math.max((selectedSlot.borderWidth ?? 2) - 1, 0) })} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors">
                  <Minus size={14} />
                </button>
              </div>

              {/* ── Border color ── */}
              <div className="h-px bg-zinc-800 my-0.5" />
              <div className="flex flex-col items-center gap-1 px-0.5 pb-0.5">
                <span className="text-[9px] text-zinc-500 uppercase tracking-wide leading-none">Color</span>
                <input
                  type="color"
                  title="Border color"
                  value={selectedSlot.borderColor || '#27272a'}
                  onChange={e => updateSlotImageState(selectedSlot.slot_id, { borderColor: e.target.value })}
                  className="w-7 h-7 rounded cursor-pointer border border-zinc-700 bg-transparent p-0.5"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Global Canvas Zoom Controls */}
      <div className="absolute bottom-6 right-6 flex items-center gap-2 bg-zinc-900 border border-zinc-700 p-1.5 rounded-lg shadow-xl z-40">
        <button onClick={() => setScale(s => Math.max(0.1, s - 0.1))} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors">
          <ZoomOut size={16} />
        </button>
        <span className="text-xs font-mono w-12 text-center text-zinc-400">{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => Math.min(3, s + 0.1))} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors">
          <ZoomIn size={16} />
        </button>
      </div>
    </>
  )
}




```

### File: frontend\components\assembly\KonvaCanvas.tsx
```tsx
// KonvaCanvas.tsx — loaded only on client via dynamic() from ComicCanvas.tsx
// All react-konva components live here so they share one import context.
// Never import this directly — always go through ComicCanvas.tsx dynamic().
import React, { useState, useEffect, useRef } from 'react'
import { Stage, Layer, Rect, Image as KImage, Text, Group, Transformer } from 'react-konva'
import { useAssemblyStore } from '@/store/assemblyStore'
import type { SlotData } from '@/types'

interface Props {
  stageRef: React.MutableRefObject<any>
  slots: SlotData[]
  canvasW: number
  canvasH: number
  scale: number
  isCustom: boolean
  children?: React.ReactNode
  onBackgroundClick?: () => void
}

export default function KonvaCanvas({ stageRef, slots, canvasW, canvasH, scale, isCustom, children, onBackgroundClick }: Props) {
  const { selectedSlotId } = useAssemblyStore()

  return (
    <Stage
      ref={stageRef}
      width={canvasW * scale}
      height={canvasH * scale}
      scaleX={scale}
      scaleY={scale}
      style={{ background: '#fff', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}
    >
      <Layer>
        {/* White background — clicking here deselects everything */}
        <Rect x={0} y={0} width={canvasW} height={canvasH} fill="white"
          onClick={onBackgroundClick}
          onTap={onBackgroundClick}
        />
        {/* Slots */}
        {slots.map(slot => (
          <SlotRenderer 
            key={slot.slot_id} 
            slot={slot} 
            isCustom={isCustom} 
            isSelected={selectedSlotId === slot.slot_id} 
          />
        ))}
        {children}
      </Layer>
    </Stage>
  )
}

function SlotRenderer({ slot, isCustom, isSelected }: { slot: SlotData, isCustom: boolean, isSelected: boolean }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const groupRef = useRef<any>(null)
  const trRef = useRef<any>(null)
  const { setSelectedSlotId, updateSlotTransform, updateSlotImageState } = useAssemblyStore()

  useEffect(() => {
    if (isSelected && trRef.current && groupRef.current && isCustom) {
      trRef.current.nodes([groupRef.current])
      trRef.current.getLayer().batchDraw()
    }
  }, [isSelected, isCustom])

  useEffect(() => {
    if (!slot.panel_image_url) { setImg(null); return }
    const image = new window.Image()
    image.crossOrigin = 'anonymous'
    image.src = slot.panel_image_url
    image.onload = () => setImg(image)
  }, [slot.panel_image_url])

  return (
    <React.Fragment>
      <Group
        ref={groupRef}
        x={slot.x} y={slot.y}
        width={slot.width} height={slot.height}
        draggable={isCustom && !slot.isPanMode}
        onClick={() => setSelectedSlotId(slot.slot_id)}
        onTap={() => setSelectedSlotId(slot.slot_id)}
        onDragEnd={(e) => {
          if (isCustom && e.target === groupRef.current) {
            updateSlotTransform(slot.slot_id, { x: e.target.x(), y: e.target.y() })
          }
        }}
        onTransformEnd={(e) => {
          if (isCustom && groupRef.current) {
            const node = groupRef.current
            const scaleX = node.scaleX()
            const scaleY = node.scaleY()

            // We reset scale to 1 and apply transform to width/height directly
            node.scaleX(1)
            node.scaleY(1)

            updateSlotTransform(slot.slot_id, {
              x: node.x(),
              y: node.y(),
              width: Math.max(50, node.width() * scaleX),
              height: Math.max(50, node.height() * scaleY),
              rotation: node.rotation()
            })
          }
        }}
      >
        {/* Slot border */}
        <Rect
          x={0} y={0} width={slot.width} height={slot.height}
          fill={slot.panel_image_url ? 'transparent' : '#f4f4f5'}
          stroke={isSelected ? "#a855f7" : (slot.borderColor || "#27272a")}
          strokeWidth={isSelected ? Math.max(slot.borderWidth ?? 2, 4) : (slot.borderWidth ?? 2)}
        />
        {/* Panel image clipped to slot */}
        {img && (() => {
          const baseScale = Math.max(slot.width / img.width, slot.height / img.height)
          const imgScale = baseScale * (slot.scale || 1)

          const w = img.width * imgScale
          const h = img.height * imgScale

          const defCx = (slot.width - w) / 2
          const defCy = h > slot.height ? 0 : (slot.height - h) / 2

          const cx = defCx + (slot.offsetX || 0)
          const cy = defCy + (slot.offsetY || 0)

          return (
            <Group clipX={0} clipY={0} clipWidth={slot.width} clipHeight={slot.height}>
              <KImage
                image={img}
                x={slot.flipX ? cx + w : cx}
                y={cy}
                width={w}
                height={h}
                scaleX={slot.flipX ? -1 : 1}
                draggable={!isCustom || slot.isPanMode}
                onDragEnd={(e) => {
                  e.cancelBubble = true // Prevent triggering slot drag
                  const newX = slot.flipX ? e.target.x() - w : e.target.x()
                  const newY = e.target.y()
                  updateSlotImageState(slot.slot_id, {
                    offsetX: newX - defCx,
                    offsetY: newY - defCy
                  })
                }}
              />
            </Group>
          );
        })()}
        {/* Empty slot label */}
        {!slot.panel_image_url && (
          <Text
            x={slot.width / 2 - 60}
            y={slot.height / 2 - 10}
            text="Drop panel here"
            fontSize={13} fill="#a1a1aa" width={120} align="center"
          />
        )}
      </Group>
      {isSelected && isCustom && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 50 || newBox.height < 50) return oldBox
            return newBox
          }}
        />
      )}
    </React.Fragment>
  )
}




```

### File: frontend\store\assemblyStore.ts
```tsx
import { create } from 'zustand'
import { pagesApi } from '@/lib/api'
import type { ComicPage, SlotData } from '@/types'

interface AssemblyStore {
  pages: ComicPage[]
  currentPage: ComicPage | null
  slots: SlotData[]
  selectedSlotId: string | null
  isLoading: boolean
  isDirty: boolean

  fetchPages: () => Promise<void>
  createPage: (title?: string, template?: string) => Promise<ComicPage>
  renamePage: (id: string, title: string) => Promise<void>
  setCurrentPage: (page: ComicPage | null) => void
  setSlots: (slots: SlotData[]) => void
  assignPanel: (slotId: string, panelId: string, imageUrl: string) => void
  saveLayout: () => Promise<void>
  initSlots: (template: string, canvasWidth: number, canvasHeight: number) => void
  removePage: (id: string) => Promise<void>

  // Slot Manipulation
  setSelectedSlotId: (id: string | null) => void
  addCustomSlot: (slot: SlotData) => void
  updateSlotTransform: (id: string, attrs: Partial<SlotData>) => void
  updateSlotImageState: (id: string, attrs: Partial<SlotData>) => void
  deleteSlot: (id: string, isCustomTemplate: boolean) => void
}

export const TEMPLATES: Record<string, Omit<SlotData, 'slot_id'>[]> = {
  '2-vertical': [
    { x: 0, y: 0, width: 1, height: 0.5 },
    { x: 0, y: 0.5, width: 1, height: 0.5 },
  ],
  '3-horizontal': [
    { x: 0, y: 0, width: 0.333, height: 1 },
    { x: 0.333, y: 0, width: 0.333, height: 1 },
    { x: 0.666, y: 0, width: 0.334, height: 1 },
  ],
  '4-grid': [
    { x: 0, y: 0, width: 0.5, height: 0.5 },
    { x: 0.5, y: 0, width: 0.5, height: 0.5 },
    { x: 0, y: 0.5, width: 0.5, height: 0.5 },
    { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
  ],
  'manga-mixed': [
    { x: 0, y: 0, width: 0.6, height: 0.55 },
    { x: 0.6, y: 0, width: 0.4, height: 0.35 },
    { x: 0.6, y: 0.35, width: 0.4, height: 0.2 },
    { x: 0, y: 0.55, width: 0.4, height: 0.45 },
    { x: 0.4, y: 0.55, width: 0.6, height: 0.45 },
  ],
}

export const useAssemblyStore = create<AssemblyStore>((set, get) => ({
  pages: [],
  currentPage: null,
  slots: [],
  selectedSlotId: null,
  isLoading: false,
  isDirty: false,

  fetchPages: async () => {
    set({ isLoading: true })
    try {
      const pages = await pagesApi.list()
      set({ pages, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  createPage: async (title = 'Untitled Page', template = '4-grid') => {
    const page = await pagesApi.create({ title, template })
    set(s => ({ pages: [page, ...s.pages], currentPage: page }))
    get().initSlots(template, page.canvas_width, page.canvas_height)
    return page
  },

  renamePage: async (id, title) => {
    try {
      const updated = await pagesApi.update(id, { title })
      set(s => ({
        pages: s.pages.map(p => p.id === id ? { ...p, title: updated.title } : p),
        currentPage: s.currentPage?.id === id ? { ...s.currentPage, title: updated.title } : s.currentPage
      }))
    } catch (e) {
      console.error('Failed to rename page', e)
    }
  },

  setCurrentPage: (page) => {
    set({ currentPage: page, isDirty: false })
    if (!page) {
      set({ slots: [] })
      return
    }
    const layout = page.layout?.layout_json
    if (layout?.slots?.length) {
      set({ slots: layout.slots })
    } else {
      get().initSlots(page.template, page.canvas_width, page.canvas_height)
    }
  },

  setSlots: (slots) => set({ slots, isDirty: true }),

  assignPanel: (slotId, panelId, imageUrl) => {
    set(s => ({
      slots: s.slots.map(sl =>
        sl.slot_id === slotId ? { ...sl, panel_id: panelId, panel_image_url: imageUrl } : sl
      ),
      isDirty: true,
    }))
  },

  saveLayout: async () => {
    const { currentPage, slots } = get()
    if (!currentPage) return
    await pagesApi.updateLayout(currentPage.id, { slots })
    set({ isDirty: false })
  },

  removePage: async (id) => {
    await pagesApi.delete(id)
    set(s => ({
      pages: s.pages.filter(p => p.id !== id),
      currentPage: s.currentPage?.id === id ? null : s.currentPage,
    }))
  },

  initSlots: (template, canvasWidth, canvasHeight) => {
    if (template === 'custom') {
      set({ slots: [] })
      return
    }
    const defs = TEMPLATES[template] || TEMPLATES['4-grid']
    const GAP = 8
    const slots: SlotData[] = defs.map((d, i) => ({
      slot_id: `slot-${i}`,
      x: d.x * canvasWidth + GAP / 2,
      y: d.y * canvasHeight + GAP / 2,
      width: d.width * canvasWidth - GAP,
      height: d.height * canvasHeight - GAP,
      scale: 1,
      rotation: 0,
      z_index: i + 1,
    }))
    set({ slots })
  },

  setSelectedSlotId: (id) => set({ selectedSlotId: id }),

  addCustomSlot: (slot) => set(s => ({ slots: [...s.slots, slot], isDirty: true })),

  updateSlotTransform: (id, attrs) => set(s => ({
    slots: s.slots.map(sl => sl.slot_id === id ? { ...sl, ...attrs } : sl),
    isDirty: true
  })),

  updateSlotImageState: (id, attrs) => set(s => ({
    slots: s.slots.map(sl => sl.slot_id === id ? { ...sl, ...attrs } : sl),
    isDirty: true
  })),

  deleteSlot: (id, isCustomTemplate) => set(s => {
    if (isCustomTemplate) {
      // Completely remove the slot
      return { slots: s.slots.filter(sl => sl.slot_id !== id), isDirty: true, selectedSlotId: s.selectedSlotId === id ? null : s.selectedSlotId }
    } else {
      // Just empty it
      return {
        slots: s.slots.map(sl => sl.slot_id === id ? { ...sl, panel_id: undefined, panel_image_url: undefined } : sl),
        isDirty: true,
        selectedSlotId: s.selectedSlotId === id ? null : s.selectedSlotId
      }
    }
  }),
}))



```



## 3. MLOps & Orchestration (Jupyter Notebook)
### File: colab\comic_studio_backend.ipynb
```json
{
 "nbformat": 4,
 "nbformat_minor": 0,
 "metadata": {
  "colab": {
   "name": "Comic Studio — Full Backend",
   "provenance": [],
   "gpuType": "A100"
  },
  "kernelspec": {
   "name": "python3",
   "display_name": "Python 3"
  },
  "accelerator": "GPU"
 },
 "cells": [
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "# 🎨 Comic Studio — Full Backend (FLUX + PuLID)\n\n",
    "## Every session: run A1 → A2 → A3 → A4 → A5 → A6\n",
    "## First time only: also run B1 → B2 → B3 → B4 (takes ~45 min, then never again)\n\n",
    "```\n",
    "Your PC (localhost:3000)  ──ngrok──►  FastAPI (Colab)  ──►  ComfyUI (Colab)\n",
    "                                            │                      │\n",
    "                                       Google Drive ◄─────── FLUX models, LoRAs, images, DB\n",
    "```"
   ]
  },
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "---\n# ━━ SECTION A — Run Every Session ━━"
   ]
  },
  {
   "cell_type": "code",
   "metadata": {},
   "source": [
    "# A1 — Mount Drive & set all paths\n",
    "from google.colab import drive\n",
    "drive.mount('/content/drive')\n",
    "import os\n",
    "\n",
    "DRIVE_ROOT   = '/content/drive/MyDrive/ComicStudio'\n",
    "MODELS_DIR   = f'{DRIVE_ROOT}/models'\n",
    "LORAS_DIR    = f'{DRIVE_ROOT}/loras'\n",
    "STORAGE_PATH = f'{DRIVE_ROOT}/storage'\n",
    "DB_PATH      = f'{DRIVE_ROOT}/comic_studio.db'\n",
    "BACKEND_SRC  = f'{DRIVE_ROOT}/backend'\n",
    "BACKEND_WORK = '/content/comic_studio'\n",
    "COMFYUI_DIR  = '/content/ComfyUI'\n",
    "\n",
    "for d in [DRIVE_ROOT, MODELS_DIR, LORAS_DIR,\n",
    "          # FLUX model directories\n",
    "          f'{MODELS_DIR}/unet',         f'{MODELS_DIR}/vae',\n",
    "          f'{MODELS_DIR}/clip',         f'{MODELS_DIR}/pulid',\n",
    "          # Shared / SDXL rollback directories\n",
    "          f'{MODELS_DIR}/ipadapter',    f'{MODELS_DIR}/clip_vision',\n",
    "          f'{MODELS_DIR}/checkpoints',  f'{MODELS_DIR}/loras',\n",
    "          f'{MODELS_DIR}/controlnet',   f'{MODELS_DIR}/instantid',\n",
    "          f'{MODELS_DIR}/insightface/models',\n",
    "          STORAGE_PATH,\n",
    "          f'{STORAGE_PATH}/characters', f'{STORAGE_PATH}/variations',\n",
    "          f'{STORAGE_PATH}/sheets',     f'{STORAGE_PATH}/panels',\n",
    "          f'{STORAGE_PATH}/exports',    f'{STORAGE_PATH}/temp']:\n",
    "    os.makedirs(d, exist_ok=True)\n",
    "\n",
    "print('✅ A1 done — Drive mounted')\n",
    "print(f'   Models  → {MODELS_DIR}')\n",
    "print(f'   LoRAs   → {LORAS_DIR}')\n",
    "print(f'   Storage → {STORAGE_PATH}')"
   ],
   "execution_count": null,
   "outputs": []
  },
  {
   "cell_type": "code",
   "metadata": {},
   "source": [
    "# A2 — Sync backend code from Drive → Colab disk\n",
    "import shutil, os\n",
    "\n",
    "if not os.path.exists(BACKEND_SRC):\n",
    "    raise RuntimeError(f'Backend not on Drive! Upload your backend/ folder to {BACKEND_SRC}')\n",
    "\n",
    "if os.path.exists(BACKEND_WORK):\n",
    "    shutil.rmtree(BACKEND_WORK)\n",
    "os.makedirs(BACKEND_WORK, exist_ok=True)\n",
    "shutil.copytree(\n",
    "    BACKEND_SRC, f'{BACKEND_WORK}/backend',\n",
    "    ignore=shutil.ignore_patterns('venv', '__pycache__', '*.pyc', '*.pyo')\n",
    ")\n",
    "print(f'✅ A2 done — backend synced')\n",
    "print(f'   Files: {os.listdir(BACKEND_WORK)}')"
   ],
   "execution_count": null,
   "outputs": []
  },
  {
   "cell_type": "code",
   "metadata": {},
   "source": [
    "# A3 — Install Python dependencies\n",
    "%cd /content/comic_studio\n",
    "!pip install -q fastapi uvicorn[standard] sqlalchemy pydantic pydantic-settings \\\n",
    "    python-multipart Pillow httpx pydrive2 python-dotenv aiofiles pyngrok \\\n",
    "    insightface onnxruntime-gpu huggingface_hub\n",
    "print('✅ A3 done — dependencies installed')"
   ],
   "execution_count": null,
   "outputs": []
  },
  {
   "cell_type": "code",
   "metadata": {},
   "source": [
    "# A4 — Symlink Drive models into ComfyUI (fast, no copy)\n",
    "import os\n",
    "\n",
    "if not os.path.exists(COMFYUI_DIR):\n",
    "    raise RuntimeError('ComfyUI not installed! Run Section B first.')\n",
    "\n",
    "# Ensure all ComfyUI model dirs exist before symlinking\n",
    "for d in ['unet', 'vae', 'clip', 'pulid', 'ipadapter', 'clip_vision',\n",
    "          'checkpoints', 'controlnet', 'instantid', 'insightface']:\n",
    "    os.makedirs(f'{COMFYUI_DIR}/models/{d}', exist_ok=True)\n",
    "\n",
    "links = [\n",
    "    # ── FLUX models ──────────────────────────────────────────────────────\n",
    "    (f'{MODELS_DIR}/unet',        f'{COMFYUI_DIR}/models/unet'),\n",
    "    (f'{MODELS_DIR}/vae',         f'{COMFYUI_DIR}/models/vae'),\n",
    "    (f'{MODELS_DIR}/clip',        f'{COMFYUI_DIR}/models/clip'),\n",
    "    (f'{MODELS_DIR}/pulid',       f'{COMFYUI_DIR}/models/pulid'),\n",
    "    # ── Shared (IP-Adapter used by both FLUX and SDXL rollback) ─────────\n",
    "    (f'{MODELS_DIR}/ipadapter',   f'{COMFYUI_DIR}/models/ipadapter'),\n",
    "    (f'{MODELS_DIR}/clip_vision', f'{COMFYUI_DIR}/models/clip_vision'),\n",
    "    (LORAS_DIR,                   f'{COMFYUI_DIR}/models/loras'),\n",
    "    # ── SDXL rollback models ─────────────────────────────────────────────\n",
    "    (f'{MODELS_DIR}/checkpoints', f'{COMFYUI_DIR}/models/checkpoints'),\n",
    "    (f'{MODELS_DIR}/controlnet',  f'{COMFYUI_DIR}/models/controlnet'),\n",
    "    (f'{MODELS_DIR}/instantid',   f'{COMFYUI_DIR}/models/instantid'),\n",
    "    (f'{MODELS_DIR}/insightface', f'{COMFYUI_DIR}/models/insightface'),\n",
    "]\n",
    "for src, dst in links:\n",
    "    if os.path.islink(dst): os.unlink(dst)\n",
    "    elif os.path.exists(dst): import shutil; shutil.rmtree(dst)\n",
    "    os.symlink(src, dst)\n",
    "    print(f'   🔗 {os.path.basename(dst)}')\n",
    "\n",
    "print('✅ A4 done — models symlinked')"
   ],
   "execution_count": null,
   "outputs": []
  },
  {
   "cell_type": "code",
   "metadata": {},
   "source": [
    "# A5 — Configure environment (FLUX)\n",
    "# ═══════════════════════════════════════════════════════════════════\n",
    "HF_TOKEN           = 'paste_your_hf_token_here'  # huggingface.co/settings/tokens\n",
    "STYLE_LORA_TRIGGER = ''   # e.g. 'comicstyle' — leave blank if no style LoRA yet\n",
    "STYLE_LORA_WEIGHT  = '1.0'\n",
    "# ═══════════════════════════════════════════════════════════════════\n",
    "\n",
    "import os\n",
    "STYLE_LORA_PATH = ''\n",
    "\n",
    "env = f'''DATABASE_URL=sqlite:///{DB_PATH}\n",
    "STORAGE_PATH={STORAGE_PATH}\n",
    "GENERATION_BACKEND=comfyui\n",
    "COMFYUI_URL=http://127.0.0.1:8188\n",
    "COMFYUI_OUTPUT_DIR=/content/ComfyUI/output\n",
    "# ── FLUX model filenames (must match files in Drive/models/) ──\n",
    "FLUX_UNET=flux1-dev.safetensors\n",
    "FLUX_VAE=ae.safetensors\n",
    "FLUX_T5=t5xxl_fp8_e4m3fn.safetensors\n",
    "FLUX_CLIP_L=clip_l.safetensors\n",
    "PULID_MODEL=pulid_flux_v0.9.1.safetensors\n",
    "FLUX_IPADAPTER=ip-adapter.bin\n",
    "# ── Optional style LoRA ────────────────────────────────────────\n",
    "STYLE_LORA_PATH={STYLE_LORA_PATH}\n",
    "STYLE_LORA_TRIGGER={STYLE_LORA_TRIGGER}\n",
    "STYLE_LORA_WEIGHT={STYLE_LORA_WEIGHT}\n",
    "# ── Background removal (false = let FLUX handle white bg natively)\n",
    "REMOVE_BACKGROUND_ENABLED=false\n",
    "GDRIVE_SYNC_ENABLED=false\n",
    "'''\n",
    "with open(f'{BACKEND_WORK}/backend/.env', 'w') as f:\n",
    "    f.write(env)\n",
    "\n",
    "# Set HF token for B4 downloads (gated FLUX model)\n",
    "os.environ['HF_TOKEN'] = HF_TOKEN\n",
    "\n",
    "loras = [x for x in os.listdir(LORAS_DIR) if x.endswith('.safetensors')]\n",
    "print('✅ A5 done — FLUX env configured')\n",
    "print(f'   FLUX UNET   : flux1-dev.safetensors')\n",
    "print(f'   PuLID model : pulid_flux_v0.9.1.safetensors')\n",
    "print(f'   Style LoRA  : {STYLE_LORA_TRIGGER or \"none\"}')\n",
    "print(f'   All LoRAs   : {loras or [\"none yet\"]}')"
   ],
   "execution_count": null,
   "outputs": []
  },
  {
   "cell_type": "code",
   "metadata": {},
   "source": [
    "# A5b — (Optional) Link a character LoRA to a character in the DB\n",
    "# Edit and run this anytime you train a new character LoRA\n",
    "from sqlalchemy import create_engine, text\n",
    "import os\n",
    "\n",
    "CHARACTER_NAME    = 'Clara'                  # must match name in UI\n",
    "CHAR_LORA_FILE    = 'clara_v1.safetensors'   # file in ComicStudio/loras/\n",
    "CHAR_LORA_TRIGGER = 'clara_v1'\n",
    "CHAR_LORA_WEIGHT  = 0.85\n",
    "\n",
    "lora_path = f'{LORAS_DIR}/{CHAR_LORA_FILE}'\n",
    "if not os.path.exists(lora_path):\n",
    "    print(f'❌ File not found: {lora_path}  — upload it to Drive first')\n",
    "else:\n",
    "    engine = create_engine(f'sqlite:///{DB_PATH}', connect_args={'check_same_thread': False})\n",
    "    with engine.connect() as conn:\n",
    "        row = conn.execute(text('SELECT id FROM characters WHERE name LIKE :n'), {'n': CHARACTER_NAME}).fetchone()\n",
    "        if not row:\n",
    "            print(f'❌ Character \"{CHARACTER_NAME}\" not in DB')\n",
    "            print('Available:', [r[0] for r in conn.execute(text('SELECT name FROM characters')).fetchall()])\n",
    "        else:\n",
    "            conn.execute(text('UPDATE characters SET lora_path=:p,lora_trigger_word=:t,lora_weight=:w WHERE id=:id'),\n",
    "                         {'p': lora_path, 't': CHAR_LORA_TRIGGER, 'w': CHAR_LORA_WEIGHT, 'id': row[0]})\n",
    "            conn.commit()\n",
    "            print(f'✅ LoRA linked → {CHARACTER_NAME} will use ({CHAR_LORA_TRIGGER}:{CHAR_LORA_WEIGHT}) in every panel')"
   ],
   "execution_count": null,
   "outputs": []
  },
  {
   "cell_type": "code",
   "metadata": {},
   "source": [
    "# A6 — Start ComfyUI + FastAPI + ngrok  (keep this cell running!)\n",
    "import subprocess, threading, time, os, requests\n",
    "from pyngrok import ngrok\n",
    "\n",
    "# ═══════════════════════════════════════════════════\n",
    "NGROK_AUTH_TOKEN = 'paste_your_token_here'\n",
    "# ═══════════════════════════════════════════════════\n",
    "\n",
    "ngrok.set_auth_token(NGROK_AUTH_TOKEN)\n",
    "\n",
    "# ── Start ComfyUI ──\n",
    "def run_comfyui():\n",
    "    subprocess.run(['python', f'{COMFYUI_DIR}/main.py',\n",
    "                    '--listen', '0.0.0.0', '--port', '8188', '--disable-auto-launch'],\n",
    "                   cwd=COMFYUI_DIR)\n",
    "threading.Thread(target=run_comfyui, daemon=True).start()\n",
    "\n",
    "# Wait for ComfyUI to load the model into VRAM (can take 30-60s)\n",
    "print('⏳ Waiting for ComfyUI to load...')\n",
    "for i in range(60):\n",
    "    try:\n",
    "        r = requests.get('http://localhost:8188/system_stats', timeout=3)\n",
    "        if r.status_code == 200:\n",
    "            print(f'✅ ComfyUI ready — {r.json().get(\"system\",{}).get(\"comfyui_version\",\"ok\")}')\n",
    "            break\n",
    "    except:\n",
    "        pass\n",
    "    time.sleep(2)\n",
    "    print(f'   ... {(i+1)*2}s', end='\\r')\n",
    "else:\n",
    "    print('⚠️  ComfyUI slow to start — check logs above')\n",
    "\n",
    "# ── Start FastAPI ──\n",
    "def run_api():\n",
    "    subprocess.run(['python', '-m', 'uvicorn', 'backend.main:app',\n",
    "                    '--host', '0.0.0.0', '--port', '8000'], cwd=BACKEND_WORK)\n",
    "threading.Thread(target=run_api, daemon=True).start()\n",
    "time.sleep(4)\n",
    "\n",
    "# ── Open ngrok tunnel ──\n",
    "tunnel = ngrok.connect(8000)\n",
    "PUBLIC_URL = tunnel.public_url\n",
    "\n",
    "# Verify FastAPI\n",
    "try:\n",
    "    r = requests.get(f'http://localhost:8000/health', timeout=5)\n",
    "    print(f'✅ FastAPI ready — {r.json()}')\n",
    "except:\n",
    "    print('⚠️  FastAPI not responding — check for import errors above')\n",
    "\n",
    "print()\n",
    "print('=' * 60)\n",
    "print('🎨  Comic Studio is LIVE')\n",
    "print('=' * 60)\n",
    "print(f'''\n",
    "  Public URL  : {PUBLIC_URL}\n",
    "  API Docs    : {PUBLIC_URL}/docs\n",
    "  ComfyUI     : http://localhost:8188  (internal)\n",
    "\n",
    "  On your PC:\n",
    "  1. Open frontend/.env.local\n",
    "  2. Set: NEXT_PUBLIC_API_URL={PUBLIC_URL}\n",
    "  3. Run: npm run dev\n",
    "  4. Open: http://localhost:3000\n",
    "''')\n",
    "\n",
    "while True:\n",
    "    time.sleep(300)\n",
    "    print(f'♥ alive — {PUBLIC_URL}')"
   ],
   "execution_count": null,
   "outputs": []
  },
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "---\n# ━━ SECTION B — First Time Only ━━\n\nRun once. Models are cached on Drive. Never run again after that."
   ]
  },
  {
   "cell_type": "code",
   "metadata": {},
   "source": [
    "# B1 — Install ComfyUI  (~2 min)\n",
    "import os\n",
    "if not os.path.exists(COMFYUI_DIR):\n",
    "    !git clone https://github.com/comfyanonymous/ComfyUI {COMFYUI_DIR}\n",
    "else:\n",
    "    print('ComfyUI already installed — pulling latest')\n",
    "    !git -C {COMFYUI_DIR} pull\n",
    "\n",
    "%cd {COMFYUI_DIR}\n",
    "!pip install -q -r requirements.txt\n",
    "print('✅ B1 done — ComfyUI installed')"
   ],
   "execution_count": null,
   "outputs": []
  },
  {
   "cell_type": "code",
   "metadata": {},
   "source": [
    "# B2 — Install custom nodes: PuLID + IP-Adapter + InsightFace  (~3 min)\n",
    "import os\n",
    "nodes_dir = f'{COMFYUI_DIR}/custom_nodes'\n",
    "\n",
    "nodes = [\n",
    "    # PuLID for FLUX — identity without style damage\n",
    "    ('PuLID_ComfyUI',          'https://github.com/cubiq/PuLID_ComfyUI.git'),\n",
    "    # IP-Adapter Plus — handles both SDXL and FLUX IP-Adapter models\n",
    "    ('ComfyUI_IPAdapter_plus', 'https://github.com/cubiq/ComfyUI_IPAdapter_plus.git'),\n",
    "    # ControlNet aux preprocessors (kept for SDXL rollback)\n",
    "    ('comfyui_controlnet_aux', 'https://github.com/Fannovel16/comfyui_controlnet_aux.git'),\n",
    "    # InstantID (kept for SDXL rollback)\n",
    "    ('ComfyUI_InstantID',      'https://github.com/cubiq/ComfyUI_InstantID.git'),\n",
    "]\n",
    "for name, url in nodes:\n",
    "    dst = f'{nodes_dir}/{name}'\n",
    "    if not os.path.exists(dst):\n",
    "        !git clone {url} {dst}\n",
    "    else:\n",
    "        print(f'✅ {name} already installed — pulling latest')\n",
    "        !git -C {dst} pull --quiet\n",
    "    req = f'{dst}/requirements.txt'\n",
    "    if os.path.exists(req):\n",
    "        !pip install -q -r {req}\n",
    "\n",
    "!pip install -q insightface onnxruntime-gpu\n",
    "print('✅ B2 done — custom nodes installed')"
   ],
   "execution_count": null,
   "outputs": []
  },
  {
   "cell_type": "code",
   "metadata": {},
   "source": [
    "# B3 — Download SDXL + InstantID models (rollback/optional)  (~15-30 min first time)\n",
    "# Skip this if you don't need SDXL rollback capability.\n",
    "from huggingface_hub import hf_hub_download\n",
    "import os, shutil\n",
    "\n",
    "def get(repo, filename, dest_dir, dest_name=None, token=None):\n",
    "    dest_name = dest_name or os.path.basename(filename)\n",
    "    dest = f'{dest_dir}/{dest_name}'\n",
    "    if os.path.exists(dest):\n",
    "        mb = os.path.getsize(dest)/1024/1024\n",
    "        print(f'  ✅ cached — {dest_name} ({mb:.0f} MB)')\n",
    "        return dest\n",
    "    print(f'  ⬇️  {dest_name}...')\n",
    "    tmp = hf_hub_download(repo_id=repo, filename=filename, token=token)\n",
    "    os.makedirs(dest_dir, exist_ok=True)\n",
    "    shutil.copy(tmp, dest)\n",
    "    mb = os.path.getsize(dest)/1024/1024\n",
    "    print(f'  ✅ saved — {dest_name} ({mb:.0f} MB)')\n",
    "    return dest\n",
    "\n",
    "print('\\n[1/4] SDXL Base (~6.9 GB)...')\n",
    "get('stabilityai/stable-diffusion-xl-base-1.0',\n",
    "    'sd_xl_base_1.0.safetensors', f'{MODELS_DIR}/checkpoints')\n",
    "\n",
    "print('\\n[2/4] InstantID IP-Adapter...')\n",
    "get('InstantX/InstantID', 'ip-adapter.bin',\n",
    "    f'{MODELS_DIR}/instantid', 'ip-adapter_instantid_sdxl.bin')\n",
    "\n",
    "print('\\n[3/4] InstantID ControlNet...')\n",
    "get('InstantX/InstantID',\n",
    "    'ControlNetModel/diffusion_pytorch_model.safetensors',\n",
    "    f'{MODELS_DIR}/controlnet', 'instantid_controlnet.safetensors')\n",
    "\n",
    "print('\\n[4/4] InsightFace AntelopeV2...')\n",
    "antelop_dir = f'{MODELS_DIR}/insightface/models/antelopev2'\n",
    "os.makedirs(antelop_dir, exist_ok=True)\n",
    "for fname in ['1k3d68.onnx', '2d106det.onnx', 'genderage.onnx',\n",
    "              'glintr100.onnx', 'scrfd_10g_bnkps.onnx']:\n",
    "    get('DIAMONIK7777/antelopev2', fname, antelop_dir)\n",
    "\n",
    "print('\\n✅ B3 done — SDXL rollback models cached')"
   ],
   "execution_count": null,
   "outputs": []
  },
  {
   "cell_type": "code",
   "metadata": {},
   "execution_count": null,
   "outputs": [],
   "source": [
    "# B4 — Download FLUX models → cached on Drive  (~30-45 min first time)\n",
    "# Requires: HF_TOKEN set in A5 with FLUX.1-dev license accepted.\n",
    "# Accept license at: https://huggingface.co/black-forest-labs/FLUX.1-dev\n",
    "from huggingface_hub import hf_hub_download\n",
    "import os, shutil\n",
    "\n",
    "HF = os.environ.get('HF_TOKEN', '')  # set in A5\n",
    "if not HF:\n",
    "    raise RuntimeError('HF_TOKEN not set — run A5 first and paste your token')\n",
    "\n",
    "def get(repo, filename, dest_dir, dest_name=None, token=None):\n",
    "    dest_name = dest_name or os.path.basename(filename)\n",
    "    dest = f'{dest_dir}/{dest_name}'\n",
    "    if os.path.exists(dest):\n",
    "        mb = os.path.getsize(dest)/1024/1024\n",
    "        print(f'  ✅ cached — {dest_name} ({mb:.0f} MB)')\n",
    "        return dest\n",
    "    print(f'  ⬇️  {dest_name}...')\n",
    "    tmp = hf_hub_download(repo_id=repo, filename=filename, token=token)\n",
    "    os.makedirs(dest_dir, exist_ok=True)\n",
    "    shutil.copy(tmp, dest)\n",
    "    mb = os.path.getsize(dest)/1024/1024\n",
    "    print(f'  ✅ saved — {dest_name} ({mb:.0f} MB)')\n",
    "    return dest\n",
    "\n",
    "print('\\n[1/6] FLUX.1-dev UNET (~23 GB) — gated, needs HF token...')\n",
    "get('black-forest-labs/FLUX.1-dev', 'flux1-dev.safetensors',\n",
    "    f'{MODELS_DIR}/unet', token=HF)\n",
    "\n",
    "print('\\n[2/6] FLUX VAE (~335 MB)...')\n",
    "get('black-forest-labs/FLUX.1-dev', 'ae.safetensors',\n",
    "    f'{MODELS_DIR}/vae', token=HF)\n",
    "\n",
    "print('\\n[3/6] T5-XXL fp8 text encoder (~5 GB)...')\n",
    "get('comfyanonymous/flux_text_encoders', 't5xxl_fp8_e4m3fn.safetensors',\n",
    "    f'{MODELS_DIR}/clip')\n",
    "\n",
    "print('\\n[4/6] CLIP-L text encoder (~235 MB)...')\n",
    "get('comfyanonymous/flux_text_encoders', 'clip_l.safetensors',\n",
    "    f'{MODELS_DIR}/clip')\n",
    "\n",
    "print('\\n[5/6] PuLID FLUX model (~1.1 GB)...')\n",
    "get('guozinan/PuLID', 'pulid_flux_v0.9.1.safetensors',\n",
    "    f'{MODELS_DIR}/pulid')\n",
    "\n",
    "print('\\n[6/6] IP-Adapter FLUX (~1.1 GB)...')\n",
    "get('InstantX/FLUX.1-dev-IP-Adapter', 'ip-adapter.bin',\n",
    "    f'{MODELS_DIR}/ipadapter')\n",
    "\n",
    "print('\\n✅ B4 done — all FLUX models cached on Drive')\n",
    "print('Section B is complete. You never need to run it again.')\n",
    "print()\n",
    "print('Model sizes on Drive:')\n",
    "for sub, name in [('unet','FLUX UNET'), ('vae','VAE'), ('clip','Text encoders'),\n",
    "                  ('pulid','PuLID'), ('ipadapter','IP-Adapter')]:\n",
    "    d = f'{MODELS_DIR}/{sub}'\n",
    "    files = os.listdir(d) if os.path.exists(d) else []\n",
    "    total_mb = sum(os.path.getsize(f'{d}/{f}')/1024/1024 for f in files if os.path.isfile(f'{d}/{f}'))\n",
    "    print(f'  {name:<20}: {total_mb:.0f} MB  ({files})')"
   ]
  },
  {
   "cell_type": "code",
   "metadata": {},
   "execution_count": null,
   "outputs": [],
   "source": [
    "# B4 — Download FLUX models → cached on Drive  (~30-45 min first time)\n",
    "# Requires: HF_TOKEN set in A5 with FLUX.1-dev license accepted.\n",
    "# Accept license at: https://huggingface.co/black-forest-labs/FLUX.1-dev\n",
    "from huggingface_hub import hf_hub_download\n",
    "import os, shutil\n",
    "\n",
    "HF = os.environ.get('HF_TOKEN', '')  # set in A5\n",
    "if not HF:\n",
    "    raise RuntimeError('HF_TOKEN not set — run A5 first and paste your token')\n",
    "\n",
    "def get(repo, filename, dest_dir, dest_name=None, token=None):\n",
    "    dest_name = dest_name or os.path.basename(filename)\n",
    "    dest = f'{dest_dir}/{dest_name}'\n",
    "    if os.path.exists(dest):\n",
    "        mb = os.path.getsize(dest)/1024/1024\n",
    "        print(f'  ✅ cached — {dest_name} ({mb:.0f} MB)')\n",
    "        return dest\n",
    "    print(f'  ⬇️  {dest_name}...')\n",
    "    tmp = hf_hub_download(repo_id=repo, filename=filename, token=token)\n",
    "    os.makedirs(dest_dir, exist_ok=True)\n",
    "    shutil.copy(tmp, dest)\n",
    "    mb = os.path.getsize(dest)/1024/1024\n",
    "    print(f'  ✅ saved — {dest_name} ({mb:.0f} MB)')\n",
    "    return dest\n",
    "\n",
    "print('\\n[1/6] FLUX.1-dev UNET (~23 GB) — gated, needs HF token...')\n",
    "get('black-forest-labs/FLUX.1-dev', 'flux1-dev.safetensors',\n",
    "    f'{MODELS_DIR}/unet', token=HF)\n",
    "\n",
    "print('\\n[2/6] FLUX VAE (~335 MB)...')\n",
    "get('black-forest-labs/FLUX.1-dev', 'ae.safetensors',\n",
    "    f'{MODELS_DIR}/vae', token=HF)\n",
    "\n",
    "print('\\n[3/6] T5-XXL fp8 text encoder (~5 GB)...')\n",
    "get('comfyanonymous/flux_text_encoders', 't5xxl_fp8_e4m3fn.safetensors',\n",
    "    f'{MODELS_DIR}/clip')\n",
    "\n",
    "print('\\n[4/6] CLIP-L text encoder (~235 MB)...')\n",
    "get('comfyanonymous/flux_text_encoders', 'clip_l.safetensors',\n",
    "    f'{MODELS_DIR}/clip')\n",
    "\n",
    "print('\\n[5/6] PuLID FLUX model (~1.1 GB)...')\n",
    "get('guozinan/PuLID', 'pulid_flux_v0.9.1.safetensors',\n",
    "    f'{MODELS_DIR}/pulid')\n",
    "\n",
    "print('\\n[6/6] IP-Adapter FLUX (~1.1 GB)...')\n",
    "get('InstantX/FLUX.1-dev-IP-Adapter', 'ip-adapter.bin',\n",
    "    f'{MODELS_DIR}/ipadapter')\n",
    "\n",
    "print('\\n✅ B4 done — all FLUX models cached on Drive')\n",
    "print('Section B is complete. You never need to run it again.')\n",
    "print()\n",
    "print('Model sizes on Drive:')\n",
    "for sub, name in [('unet','FLUX UNET'), ('vae','VAE'), ('clip','Text encoders'),\n",
    "                  ('pulid','PuLID'), ('ipadapter','IP-Adapter')]:\n",
    "    d = f'{MODELS_DIR}/{sub}'\n",
    "    files = os.listdir(d) if os.path.exists(d) else []\n",
    "    total_mb = sum(os.path.getsize(f'{d}/{f}')/1024/1024 for f in files if os.path.isfile(f'{d}/{f}'))\n",
    "    print(f'  {name:<20}: {total_mb:.0f} MB  ({files})')"
   ]
  },
  {
   "cell_type": "code",
   "metadata": {},
   "execution_count": null,
   "outputs": [],
   "source": [
    "# B4 — Download FLUX models → cached on Drive  (~30-45 min first time)\n",
    "# Requires: HF_TOKEN set in A5 with FLUX.1-dev license accepted.\n",
    "# Accept license at: https://huggingface.co/black-forest-labs/FLUX.1-dev\n",
    "from huggingface_hub import hf_hub_download\n",
    "import os, shutil\n",
    "\n",
    "HF = os.environ.get('HF_TOKEN', '')  # set in A5\n",
    "if not HF:\n",
    "    raise RuntimeError('HF_TOKEN not set — run A5 first and paste your token')\n",
    "\n",
    "def get(repo, filename, dest_dir, dest_name=None, token=None):\n",
    "    dest_name = dest_name or os.path.basename(filename)\n",
    "    dest = f'{dest_dir}/{dest_name}'\n",
    "    if os.path.exists(dest):\n",
    "        mb = os.path.getsize(dest)/1024/1024\n",
    "        print(f'  ✅ cached — {dest_name} ({mb:.0f} MB)')\n",
    "        return dest\n",
    "    print(f'  ⬇️  {dest_name}...')\n",
    "    tmp = hf_hub_download(repo_id=repo, filename=filename, token=token)\n",
    "    os.makedirs(dest_dir, exist_ok=True)\n",
    "    shutil.copy(tmp, dest)\n",
    "    mb = os.path.getsize(dest)/1024/1024\n",
    "    print(f'  ✅ saved — {dest_name} ({mb:.0f} MB)')\n",
    "    return dest\n",
    "\n",
    "print('\\n[1/6] FLUX.1-dev UNET (~23 GB) — gated, needs HF token...')\n",
    "get('black-forest-labs/FLUX.1-dev', 'flux1-dev.safetensors',\n",
    "    f'{MODELS_DIR}/unet', token=HF)\n",
    "\n",
    "print('\\n[2/6] FLUX VAE (~335 MB)...')\n",
    "get('black-forest-labs/FLUX.1-dev', 'ae.safetensors',\n",
    "    f'{MODELS_DIR}/vae', token=HF)\n",
    "\n",
    "print('\\n[3/6] T5-XXL fp8 text encoder (~5 GB)...')\n",
    "get('comfyanonymous/flux_text_encoders', 't5xxl_fp8_e4m3fn.safetensors',\n",
    "    f'{MODELS_DIR}/clip')\n",
    "\n",
    "print('\\n[4/6] CLIP-L text encoder (~235 MB)...')\n",
    "get('comfyanonymous/flux_text_encoders', 'clip_l.safetensors',\n",
    "    f'{MODELS_DIR}/clip')\n",
    "\n",
    "print('\\n[5/6] PuLID FLUX model (~1.1 GB)...')\n",
    "get('guozinan/PuLID', 'pulid_flux_v0.9.1.safetensors',\n",
    "    f'{MODELS_DIR}/pulid')\n",
    "\n",
    "print('\\n[6/6] IP-Adapter FLUX (~1.1 GB)...')\n",
    "get('InstantX/FLUX.1-dev-IP-Adapter', 'ip-adapter.bin',\n",
    "    f'{MODELS_DIR}/ipadapter')\n",
    "\n",
    "print('\\n✅ B4 done — all FLUX models cached on Drive')\n",
    "print('Section B is complete. You never need to run it again.')\n",
    "print()\n",
    "print('Model sizes on Drive:')\n",
    "for sub, name in [('unet','FLUX UNET'), ('vae','VAE'), ('clip','Text encoders'),\n",
    "                  ('pulid','PuLID'), ('ipadapter','IP-Adapter')]:\n",
    "    d = f'{MODELS_DIR}/{sub}'\n",
    "    files = os.listdir(d) if os.path.exists(d) else []\n",
    "    total_mb = sum(os.path.getsize(f'{d}/{f}')/1024/1024 for f in files if os.path.isfile(f'{d}/{f}'))\n",
    "    print(f'  {name:<20}: {total_mb:.0f} MB  ({files})')"
   ]
  },
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": [
    "---\n# ━━ UTILITIES ━━\n\nRun anytime for diagnostics."
   ]
  },
  {
   "cell_type": "code",
   "metadata": {},
   "source": [
    "# U1 — Inspect everything on Drive\n",
    "from sqlalchemy import create_engine, text\n",
    "import os\n",
    "\n",
    "print('📁 Models on Drive:')\n",
    "for sub in ['checkpoints', 'instantid', 'controlnet', 'ipadapter',\n",
    "            'clip_vision', 'insightface/models/antelopev2']:\n",
    "    d = f'{MODELS_DIR}/{sub}'\n",
    "    if os.path.exists(d):\n",
    "        files = [f for f in os.listdir(d) if not f.startswith('.')]\n",
    "        print(f'  {sub}/: {files}')\n",
    "\n",
    "print('\\n📁 Your LoRAs:')\n",
    "for f in os.listdir(LORAS_DIR):\n",
    "    if f.endswith(('.safetensors', '.pt')):\n",
    "        mb = os.path.getsize(f'{LORAS_DIR}/{f}')/1024/1024\n",
    "        print(f'  {f}  ({mb:.0f} MB)')\n",
    "\n",
    "print('\\n📋 Characters in DB:')\n",
    "try:\n",
    "    engine = create_engine(f'sqlite:///{DB_PATH}', connect_args={'check_same_thread': False})\n",
    "    with engine.connect() as conn:\n",
    "        rows = conn.execute(text('SELECT name, lora_trigger_word, canonical_prompt FROM characters')).fetchall()\n",
    "        for r in rows:\n",
    "            lora = f'✅ {r[1]}' if r[1] else '❌ no LoRA'\n",
    "            print(f'  {r[0]:<20} {lora}')\n",
    "            if r[2]: print(f'  {\" \"*20} → {r[2][:70]}')\n",
    "except Exception as e:\n",
    "    print(f'  DB not ready yet: {e}')"
   ],
   "execution_count": null,
   "outputs": []
  },
  {
   "cell_type": "code",
   "metadata": {},
   "source": [
    "# U2 — Health check (run after A6 to verify everything works)\n",
    "import requests\n",
    "\n",
    "print('Checking ComfyUI...')\n",
    "try:\n",
    "    r = requests.get('http://localhost:8188/system_stats', timeout=5)\n",
    "    info = r.json().get('system', {})\n",
    "    print(f'  ✅ ComfyUI {info.get(\"comfyui_version\",\"ok\")} | '\n",
    "          f'GPU: {info.get(\"gpu_name\",\"?\")} | '\n",
    "          f'VRAM: {info.get(\"vram_free\",0)/1024:.1f} GB free')\n",
    "except Exception as e:\n",
    "    print(f'  ❌ {e}')\n",
    "\n",
    "print('Checking FastAPI...')\n",
    "try:\n",
    "    r = requests.get('http://localhost:8000/health', timeout=5)\n",
    "    print(f'  ✅ {r.json()}')\n",
    "    r2 = requests.get('http://localhost:8000/characters', timeout=5)\n",
    "    print(f'  ✅ {len(r2.json())} characters in DB')\n",
    "except Exception as e:\n",
    "    print(f'  ❌ {e}')"
   ],
   "execution_count": null,
   "outputs": []
  }
 ]
}

```