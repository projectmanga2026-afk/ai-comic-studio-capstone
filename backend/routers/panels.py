from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session
from typing import List

from backend.database import get_db, SessionLocal
from backend import models, schemas
from backend.services.generation_service import GenerationService
from backend.services.storage_service import StorageService

router = APIRouter()


def _run_panel_bg(job_id: str, body_dict: dict):
    """Run panel generation in a background thread with its own DB session."""
    import asyncio
    db = SessionLocal()
    try:
        job = db.get(models.GenerationJob, job_id)
        if not job:
            return
        body = schemas.PanelGenerateIn(**body_dict)
        svc = GenerationService(db)
        asyncio.run(svc._panel_work(body, job))
    except Exception as exc:
        db2 = SessionLocal()
        try:
            j = db2.get(models.GenerationJob, job_id)
            if j:
                j.status = "failed"
                j.error = str(exc)
                db2.commit()
        finally:
            db2.close()
    finally:
        db.close()


@router.post("/generate", response_model=schemas.GenerationJobOut, status_code=status.HTTP_201_CREATED)
def generate_panel(
    body: schemas.PanelGenerateIn,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Returns a job with status='pending' immediately.
    Panel generation runs in the background.
    Poll GET /generation/jobs/{job_id} every 2 seconds.
    When status=='complete', result_path contains the panel image URL.
    """
    job = models.GenerationJob(
        job_type="panel",
        status="pending",
        prompt=body.user_prompt,
        backend_used="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    background_tasks.add_task(_run_panel_bg, job.id, body.model_dump())
    return job


@router.get("", response_model=List[schemas.PanelOut])
def list_panels(db: Session = Depends(get_db)):
    return db.query(models.Panel).order_by(models.Panel.created_at.desc()).all()


@router.get("/{panel_id}", response_model=schemas.PanelOut)
def get_panel(panel_id: str, db: Session = Depends(get_db)):
    panel = db.get(models.Panel, panel_id)
    if not panel:
        raise HTTPException(status_code=404, detail="Panel not found")
    return panel


@router.delete("/{panel_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_panel(panel_id: str, db: Session = Depends(get_db)):
    panel = db.get(models.Panel, panel_id)
    if not panel:
        raise HTTPException(status_code=404, detail="Panel not found")
    StorageService.delete_file(panel.image_path)
    StorageService.delete_file(panel.thumbnail_path)
    db.delete(panel)
    db.commit()
