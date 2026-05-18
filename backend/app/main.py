from fastapi import FastAPI

from sqlalchemy import text
from app.db.base import engine

app = FastAPI()

@app.get("/")
def root():
    return {"status": "ok"}


@app.get("/health")
def healthcheck():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

        return {
            "status": "ok",
            "database": "connected"
        }

    except Exception as e:
        return {
            "status": "error",
            "database": "disconnected",
            "details": str(e)
        }