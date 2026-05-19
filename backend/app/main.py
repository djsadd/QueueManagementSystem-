from fastapi import FastAPI
from sqlalchemy import text
from app.db.session import engine
from app.db import models  # noqa: F401

# Routers
from app.api.auth.auth import auth_router
from app.api.services.routes import services_router
from app.api.tickets.routes import tickets_router
from app.api.windows.routes import windows_router

app = FastAPI()
app.include_router(auth_router)
app.include_router(services_router)
app.include_router(tickets_router)
app.include_router(windows_router)

@app.get("/")
def root():
    return {"status": "ok"}


@app.get("/health")
async def healthcheck():
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))

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
