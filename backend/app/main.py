from fastapi import FastAPI
from sqlalchemy import text
from app.db.session import engine

# Routers
from app.api.auth.auth import auth_router
from app.api.tickets.routes import tickets_router

app = FastAPI()
app.include_router(auth_router)
app.include_router(tickets_router)

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