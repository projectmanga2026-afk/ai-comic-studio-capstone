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
