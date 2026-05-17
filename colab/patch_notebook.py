"""
patch_notebook.py — Run this once locally to update comic_studio_backend.ipynb
for the FLUX migration. Patches cells A1, A4, A5, B2, and adds B4 (FLUX downloads).

Usage: python patch_notebook.py
"""
import json
from pathlib import Path

NB_PATH = Path(__file__).parent / "comic_studio_backend.ipynb"
nb = json.loads(NB_PATH.read_text(encoding="utf-8"))
cells = nb["cells"]

def find_cell(marker: str) -> int:
    """Return index of first code cell whose source starts with marker."""
    for i, c in enumerate(cells):
        if c["cell_type"] == "code":
            src = "".join(c["source"])
            if src.strip().startswith(marker):
                return i
    raise ValueError(f"Cell not found: {marker!r}")


# ── Header markdown ─────────────────────────────────────────────────────────
cells[0]["source"] = [
    "# 🎨 Comic Studio — Full Backend (FLUX + PuLID)\n\n",
    "## Every session: run A1 → A2 → A3 → A4 → A5 → A6\n",
    "## First time only: also run B1 → B2 → B3 → B4 (takes ~45 min, then never again)\n\n",
    "```\n",
    "Your PC (localhost:3000)  ──ngrok──►  FastAPI (Colab)  ──►  ComfyUI (Colab)\n",
    "                                            │                      │\n",
    "                                       Google Drive ◄─────── FLUX models, LoRAs, images, DB\n",
    "```",
]

# ── A1 — Mount Drive & set all paths ────────────────────────────────────────
i_a1 = find_cell("# A1")
cells[i_a1]["source"] = [
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
    "print(f'   Storage → {STORAGE_PATH}')",
]

# ── A4 — Symlinks ────────────────────────────────────────────────────────────
i_a4 = find_cell("# A4")
cells[i_a4]["source"] = [
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
    "print('✅ A4 done — models symlinked')",
]

# ── A5 — Environment (FLUX) ──────────────────────────────────────────────────
i_a5 = find_cell("# A5")
cells[i_a5]["source"] = [
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
    "print(f'   All LoRAs   : {loras or [\"none yet\"]}')",
]

# ── B2 — Custom nodes: add PuLID ────────────────────────────────────────────
i_b2 = find_cell("# B2")
cells[i_b2]["source"] = [
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
    "print('✅ B2 done — custom nodes installed')",
]

# ── B3 — Rename to SDXL models only (legacy/rollback) ───────────────────────
i_b3 = find_cell("# B3")
cells[i_b3]["source"] = [
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
    "print('\\n✅ B3 done — SDXL rollback models cached')",
]

# ── B4 — NEW: FLUX model downloads ──────────────────────────────────────────
b4_cell = {
    "cell_type": "code",
    "metadata": {},
    "execution_count": None,
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
        "    print(f'  {name:<20}: {total_mb:.0f} MB  ({files})')",
    ],
}

# Insert B4 right after B3
cells.insert(i_b3 + 1, b4_cell)

# ── Write patched notebook ───────────────────────────────────────────────────
NB_PATH.write_text(json.dumps(nb, indent=1, ensure_ascii=False), encoding="utf-8")
print(f"[OK] Notebook patched: {NB_PATH}")
print("   Changes: header, A1, A4, A5, B2, B3 (renamed), B4 (new FLUX downloads)")
