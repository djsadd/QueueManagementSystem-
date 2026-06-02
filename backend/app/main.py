from fastapi import FastAPI
from sqlalchemy import text
from app.db.session import engine
from app.db import models  # noqa: F401
from app.services.kafka_event_service import KafkaEventService

# Routers
from app.api.applicants.routes import applicants_router
from app.api.auth.auth import auth_router
from app.api.education.routes import academic_degrees_router, educational_programs_router, operator_programs_router
from app.api.operators.routes import operators_router
from app.api.public.routes import public_router
from app.api.realtime.routes import realtime_router
from app.api.services.routes import services_router
from app.api.ticket_events.routes import ticket_events_router
from app.api.tickets.routes import tickets_router
from app.api.users.routes import users_router
from app.api.windows.routes import windows_router

app = FastAPI()
app.include_router(applicants_router)
app.include_router(auth_router)
app.include_router(public_router)
app.include_router(realtime_router)
app.include_router(academic_degrees_router)
app.include_router(educational_programs_router)
app.include_router(operators_router)
app.include_router(operator_programs_router)
app.include_router(services_router)
app.include_router(ticket_events_router)
app.include_router(tickets_router)
app.include_router(users_router)
app.include_router(windows_router)


@app.on_event("startup")
async def startup() -> None:
    await KafkaEventService.start()


@app.on_event("shutdown")
async def shutdown() -> None:
    await KafkaEventService.stop()

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
