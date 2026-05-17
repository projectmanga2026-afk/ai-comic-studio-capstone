from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session
from typing import List

from backend.database import get_db, SessionLocal
from backend import models, schemas
from backend.services.generation_service import GenerationService
from backend.services.storage_service import StorageService

router = APIRouter()


# ── CRUD ───────────────────────────────────────────────────────────────────────

@router.post("", response_model=schemas.CharacterOut, status_code=status.HTTP_201_CREATED)
def create_character(body: schemas.CharacterCreate, db: Session = Depends(get_db)):
    char = models.Character(
        name=body.name,
        description=body.description,
        visual_traits_summary=body.visual_traits_summary,
    )
    db.add(char)
    db.commit()
    db.refresh(char)
    return char


@router.get("", response_model=List[schemas.CharacterOut])
def list_characters(db: Session = Depends(get_db)):
    return db.query(models.Character).order_by(models.Character.created_at.desc()).all()


@router.get("/{character_id}", response_model=schemas.CharacterOut)
def get_character(character_id: str, db: Session = Depends(get_db)):
    char = db.get(models.Character, character_id)
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")
    return char


@router.put("/{character_id}", response_model=schemas.CharacterOut)
def update_character(character_id: str, body: schemas.CharacterUpdate, db: Session = Depends(get_db)):
    char = db.get(models.Character, character_id)
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(char, field, value)
    db.commit()
    db.refresh(char)
    return char


@router.delete("/{character_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_character(character_id: str, db: Session = Depends(get_db)):
    char = db.get(models.Character, character_id)
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")
    StorageService.delete_character_files(char)
    db.delete(char)
    db.commit()


# ── Generation — background tasks (return instantly, poll /generation/jobs/{id}) ─

def _run_variations_bg(character_id: str, job_id: str):
    """Runs in a background thread — own DB session, no request context."""
    import asyncio
    db = SessionLocal()
    try:
        char = db.get(models.Character, character_id)
        job  = db.get(models.GenerationJob, job_id)
        if not char or not job:
            return
        svc = GenerationService(db)
        asyncio.run(svc._variations_work(char, job))
    except Exception as exc:
        # Mark job failed if anything blows up outside the service
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


def _run_sheet_bg(character_id: str, job_id: str):
    import asyncio
    db = SessionLocal()
    try:
        char = db.get(models.Character, character_id)
        job  = db.get(models.GenerationJob, job_id)
        if not char or not job:
            return
        svc = GenerationService(db)
        asyncio.run(svc._sheet_work(char, job))
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


@router.post("/{character_id}/generate-variations", response_model=schemas.GenerationJobOut)
def generate_variations(
    character_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Immediately returns a job with status='pending'.
    Generation runs in the background.
    Poll GET /generation/jobs/{job_id} every 2 seconds.
    When status=='complete', GET /characters/{character_id} to see the variations.
    """
    char = db.get(models.Character, character_id)
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")

    job = models.GenerationJob(
        job_type="variation",
        status="pending",
        prompt=char.description,
        backend_used="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    background_tasks.add_task(_run_variations_bg, character_id, job.id)
    return job


@router.post("/{character_id}/select-variation", response_model=schemas.CharacterOut)
def select_variation(
    character_id: str,
    body: schemas.SelectVariationIn,
    db: Session = Depends(get_db),
):
    char = db.get(models.Character, character_id)
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")

    for v in char.variations:
        v.is_selected = False
    variation = db.get(models.CharacterVariation, body.variation_id)
    if not variation or variation.character_id != character_id:
        raise HTTPException(status_code=404, detail="Variation not found")

    variation.is_selected = True
    # Use the character's own description as canonical — NOT the variation prompt
    char.canonical_prompt = char.description
    # Store the selected variation image as both:
    #   front_sheet_image_path — body/style reference for panels & sheet generation
    #   face_embed_path        — face reference so PuLID works in panels immediately,
    #                            even before a character sheet has been generated
    char.front_sheet_image_path = variation.image_path
    char.face_embed_path = variation.image_path
    db.commit()
    db.refresh(char)
    return char


@router.post("/{character_id}/generate-sheet", response_model=schemas.GenerationJobOut)
def generate_sheet(
    character_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Immediately returns a job with status='pending'.
    Sheet generation (5 views) runs in the background.
    Poll GET /generation/jobs/{job_id} every 2 seconds.
    """
    char = db.get(models.Character, character_id)
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")

    job = models.GenerationJob(
        job_type="sheet",
        status="pending",
        prompt=char.canonical_prompt or char.description,
        backend_used="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    background_tasks.add_task(_run_sheet_bg, character_id, job.id)
    return job
