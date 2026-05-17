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
