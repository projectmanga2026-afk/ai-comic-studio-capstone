from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from backend.database import get_db
from backend import models, schemas

router = APIRouter()


@router.post("/{page_id}/bubbles", response_model=schemas.BubbleOut, status_code=status.HTTP_201_CREATED)
def create_bubble(page_id: str, body: schemas.BubbleCreate, db: Session = Depends(get_db)):
    page = db.get(models.ComicPage, page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    bubble = models.SpeechBubble(page_id=page_id, **body.model_dump())
    db.add(bubble)
    db.commit()
    db.refresh(bubble)
    return bubble


@router.get("/{page_id}/bubbles", response_model=List[schemas.BubbleOut])
def list_bubbles(page_id: str, db: Session = Depends(get_db)):
    return (
        db.query(models.SpeechBubble)
        .filter(models.SpeechBubble.page_id == page_id)
        .order_by(models.SpeechBubble.z_index)
        .all()
    )


@router.put("/{page_id}/bubbles/{bubble_id}", response_model=schemas.BubbleOut)
def update_bubble(
    page_id: str, bubble_id: str, body: schemas.BubbleUpdate, db: Session = Depends(get_db)
):
    bubble = db.get(models.SpeechBubble, bubble_id)
    if not bubble or bubble.page_id != page_id:
        raise HTTPException(status_code=404, detail="Bubble not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(bubble, field, value)
    db.commit()
    db.refresh(bubble)
    return bubble


@router.delete("/{page_id}/bubbles/{bubble_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bubble(page_id: str, bubble_id: str, db: Session = Depends(get_db)):
    bubble = db.get(models.SpeechBubble, bubble_id)
    if not bubble or bubble.page_id != page_id:
        raise HTTPException(status_code=404, detail="Bubble not found")
    db.delete(bubble)
    db.commit()
