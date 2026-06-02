import uuid

import jwt
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.operator import Operator
from app.security.jwt import ALGORITHM, SECRET_KEY
from app.services.user_service import UserService
from app.realtime import realtime_manager


realtime_router = APIRouter(prefix="/ws", tags=["realtime"])


async def get_user_id_from_token(token: str | None) -> uuid.UUID | None:
    if not token:
        return None

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        subject = payload.get("sub")
        return uuid.UUID(subject) if isinstance(subject, str) else None
    except (jwt.InvalidTokenError, ValueError):
        return None


async def get_operator_window_id(db: AsyncSession, user_id: uuid.UUID) -> int | None:
    user = await UserService.get_by_id(db, user_id)
    if user is None or not user.is_active:
        return None

    result = await db.execute(select(Operator).where(Operator.user_id == user_id))
    operator = result.scalar_one_or_none()
    return operator.window_id if operator is not None else None


@realtime_router.websocket("/my-window")
async def my_window_websocket(
    websocket: WebSocket,
    token: str | None = Query(default=None),
) -> None:
    user_id = await get_user_id_from_token(token)
    if user_id is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    async with AsyncSessionLocal() as db:
        window_id = await get_operator_window_id(db, user_id)

    if window_id is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await realtime_manager.connect_my_window(window_id, websocket)
    await websocket.send_json({"type": "my_window.connected", "window_id": window_id})

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        realtime_manager.disconnect_my_window(window_id, websocket)


@realtime_router.websocket("/queue-display")
async def queue_display_websocket(websocket: WebSocket) -> None:
    await realtime_manager.connect_queue_display(websocket)
    await websocket.send_json({"type": "queue_display.connected"})

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        realtime_manager.disconnect_queue_display(websocket)
