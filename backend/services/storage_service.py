import os
import re
import shutil
from typing import Optional
from backend import models

STORAGE_PATH = os.getenv("STORAGE_PATH", "./storage")


class StorageService:

    @staticmethod
    def path(sub: str, filename: str) -> str:
        """Return absolute path for a file under a storage subdirectory."""
        return os.path.join(STORAGE_PATH, sub, filename)

    @staticmethod
    def url(sub: str, filename: str) -> str:
        """Return the URL path that FastAPI's StaticFiles will serve."""
        return f"/static/{sub}/{filename}"

    @staticmethod
    def ensure_dirs():
        for sub in ["characters", "variations", "sheets", "panels", "exports", "temp"]:
            os.makedirs(os.path.join(STORAGE_PATH, sub), exist_ok=True)

    @staticmethod
    def delete_file(path: Optional[str]):
        if not path:
            return
        # path might be a /static/... URL — convert to filesystem path
        if path.startswith("/static/"):
            path = os.path.join(STORAGE_PATH, path[len("/static/"):])
        try:
            if os.path.exists(path):
                os.remove(path)
        except OSError:
            pass

    @staticmethod
    def delete_character_files(character: models.Character):
        StorageService.delete_file(character.face_embed_path)
        StorageService.delete_file(character.front_sheet_image_path)
        if character.reference_images:
            for p in character.reference_images:
                StorageService.delete_file(p)
        if character.sheet:
            sheet = character.sheet
            for attr in [
                "front_image_path", "side_image_path", "back_image_path",
                "three_quarter_image_path", "face_closeup_image_path",
            ]:
                StorageService.delete_file(getattr(sheet, attr))
            for p in (sheet.expression_images or []):
                StorageService.delete_file(p)
        for v in character.variations:
            StorageService.delete_file(v.image_path)
