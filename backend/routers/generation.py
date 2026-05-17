from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend import models, schemas
from backend.services.prompt_builder import PromptBuilder
from backend.services.generation_service import GenerationService

router = APIRouter()


@router.post("/expand-prompt", response_model=schemas.ExpandPromptOut)
async def expand_prompt(body: schemas.ExpandPromptIn, db: Session = Depends(get_db)):
    """Preview what the final generation prompt will look like — for debugging."""
    builder = PromptBuilder(db)
    result = await builder.build(body.user_prompt, body.panel_type, body.aspect_ratio)
    return result


@router.post("/mock-image")
async def mock_image(body: schemas.PanelGenerateIn, db: Session = Depends(get_db)):
    """Force mock generation regardless of GENERATION_BACKEND setting."""
    from backend.services.generation_service import GenerationService
    svc = GenerationService(db)
    job = await svc.generate_panel(body, force_mock=True)
    return job


@router.post("/comfyui")
async def trigger_comfyui(body: schemas.PanelGenerateIn, db: Session = Depends(get_db)):
    """Trigger generation via ComfyUI backend directly."""
    from backend.services.generation_service import GenerationService
    svc = GenerationService(db)
    job = await svc.generate_panel(body, force_backend="comfyui")
    return job


@router.post("/diffusers")
async def trigger_diffusers(body: schemas.PanelGenerateIn, db: Session = Depends(get_db)):
    svc = GenerationService(db)
    job = await svc.generate_panel(body, force_backend="diffusers")
    return job


@router.get("/jobs/{job_id}", response_model=schemas.GenerationJobOut)
def get_job(job_id: str, db: Session = Depends(get_db)):
    job = db.get(models.GenerationJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
