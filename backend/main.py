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
