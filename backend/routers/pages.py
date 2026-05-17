import os
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List

from backend.database import get_db
from backend import models, schemas

router = APIRouter()


@router.post("", response_model=schemas.ComicPageOut, status_code=status.HTTP_201_CREATED)
def create_page(body: schemas.ComicPageCreate, db: Session = Depends(get_db)):
    page = models.ComicPage(**body.model_dump())
    db.add(page)
    db.flush()
    # Create empty layout
    layout = models.PageLayout(page_id=page.id, layout_json={"slots": []})
    db.add(layout)
    db.commit()
    db.refresh(page)
    return page


@router.get("", response_model=List[schemas.ComicPageOut])
def list_pages(db: Session = Depends(get_db)):
    return db.query(models.ComicPage).order_by(models.ComicPage.created_at.desc()).all()


@router.get("/{page_id}", response_model=schemas.ComicPageOut)
def get_page(page_id: str, db: Session = Depends(get_db)):
    page = db.get(models.ComicPage, page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


@router.put("/{page_id}", response_model=schemas.ComicPageOut)
def update_page(page_id: str, body: schemas.ComicPageCreate, db: Session = Depends(get_db)):
    page = db.get(models.ComicPage, page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    
    if body.title is not None:
        page.title = body.title
    if body.canvas_width is not None:
        page.canvas_width = body.canvas_width
    if body.canvas_height is not None:
        page.canvas_height = body.canvas_height
    if body.template is not None:
        page.template = body.template
        
    db.commit()
    db.refresh(page)
    return page


@router.put("/{page_id}/layout", response_model=schemas.PageLayoutOut)
def update_layout(page_id: str, body: schemas.PageLayoutUpdate, db: Session = Depends(get_db)):
    page = db.get(models.ComicPage, page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    if not page.layout:
        page.layout = models.PageLayout(page_id=page_id, layout_json=body.layout_json)
        db.add(page.layout)
    else:
        page.layout.layout_json = body.layout_json
    db.commit()
    db.refresh(page.layout)
    return page.layout


@router.post("/{page_id}/export")
def export_page(page_id: str, db: Session = Depends(get_db)):
    """
    The actual PNG export is done client-side via Konva stage.toDataURL().
    This endpoint records the export event and can optionally sync to Drive.
    """
    page = db.get(models.ComicPage, page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return {"status": "ok", "page_id": page_id, "message": "Export handled client-side"}


@router.post("/{page_id}/thumbnail", response_model=schemas.ComicPageOut)
def set_thumbnail(page_id: str, body: schemas.ThumbnailUpdate, db: Session = Depends(get_db)):
    """Accept a base64 data URL from the frontend Konva canvas and persist it."""
    page = db.get(models.ComicPage, page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    page.thumbnail_path = body.thumbnail_data_url
    db.commit()
    db.refresh(page)
    return page


@router.post("/{page_id}/save-image", response_model=schemas.ComicPageOut)
def save_page_image(page_id: str, body: schemas.PageImageUpdate, db: Session = Depends(get_db)):
    """
    Decode a full-resolution base64 PNG from the Konva canvas and persist it
    to storage/pages/<page_id>.png (which is inside the Google Drive mount).
    The resulting /static/pages/ URL is stored in page_image_path.
    """
    import base64, re, os as _os
    page = db.get(models.ComicPage, page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    # Strip the data URL header  e.g. "data:image/png;base64,..."
    match = re.match(r"data:image/\w+;base64,(.+)", body.image_data_url, re.DOTALL)
    if not match:
        raise HTTPException(status_code=400, detail="Invalid image data URL")

    img_bytes = base64.b64decode(match.group(1))
    storage_path = os.getenv("STORAGE_PATH", "./storage")
    pages_dir = _os.path.join(storage_path, "pages")
    _os.makedirs(pages_dir, exist_ok=True)

    filename = f"{page_id}.png"
    filepath = _os.path.join(pages_dir, filename)
    with open(filepath, "wb") as f:
        f.write(img_bytes)

    page.page_image_path = f"/static/pages/{filename}"
    db.commit()
    db.refresh(page)
    return page


@router.delete("/{page_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_page(page_id: str, db: Session = Depends(get_db)):
    page = db.get(models.ComicPage, page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    db.delete(page)
    db.commit()
