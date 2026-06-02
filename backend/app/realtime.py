from collections import defaultdict
from datetime import datetime
from typing import Any

from fastapi import WebSocket


class RealtimeConnectionManager:
    def __init__(self) -> None:
        self._my_window_connections: dict[int, set[WebSocket]] = defaultdict(set)
        self._queue_display_connections: set[WebSocket] = set()

    async def connect_my_window(self, window_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self._my_window_connections[window_id].add(websocket)

    def disconnect_my_window(self, window_id: int, websocket: WebSocket) -> None:
        connections = self._my_window_connections.get(window_id)
        if connections is None:
            return

        connections.discard(websocket)
        if not connections:
            self._my_window_connections.pop(window_id, None)

    async def connect_queue_display(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._queue_display_connections.add(websocket)

    def disconnect_queue_display(self, websocket: WebSocket) -> None:
        self._queue_display_connections.discard(websocket)

    async def broadcast_queue_display_update(
        self,
        reason: str,
        payload: dict[str, Any] | None = None,
    ) -> None:
        message = {
            "type": "queue_display.updated",
            "reason": reason,
            "payload": payload or {},
            "sent_at": f"{datetime.utcnow().isoformat()}Z",
        }

        stale_connections: list[WebSocket] = []
        for websocket in list(self._queue_display_connections):
            try:
                await websocket.send_json(message)
            except Exception:
                stale_connections.append(websocket)

        for websocket in stale_connections:
            self.disconnect_queue_display(websocket)

    async def broadcast_my_window_update(
        self,
        window_id: int | None,
        reason: str,
        payload: dict[str, Any] | None = None,
    ) -> None:
        if window_id is None:
            return

        message = {
            "type": "my_window.updated",
            "window_id": window_id,
            "reason": reason,
            "payload": payload or {},
            "sent_at": f"{datetime.utcnow().isoformat()}Z",
        }

        stale_connections: list[WebSocket] = []
        for websocket in list(self._my_window_connections.get(window_id, set())):
            try:
                await websocket.send_json(message)
            except Exception:
                stale_connections.append(websocket)

        for websocket in stale_connections:
            self.disconnect_my_window(window_id, websocket)

    async def broadcast_all_my_windows_update(
        self,
        reason: str,
        payload: dict[str, Any] | None = None,
    ) -> None:
        message = {
            "type": "my_window.updated",
            "window_id": None,
            "reason": reason,
            "payload": payload or {},
            "sent_at": f"{datetime.utcnow().isoformat()}Z",
        }

        stale_connections: list[tuple[int, WebSocket]] = []
        for window_id, connections in list(self._my_window_connections.items()):
            for websocket in list(connections):
                try:
                    await websocket.send_json(message)
                except Exception:
                    stale_connections.append((window_id, websocket))

        for window_id, websocket in stale_connections:
            self.disconnect_my_window(window_id, websocket)

        await self.broadcast_queue_display_update(reason, payload)


realtime_manager = RealtimeConnectionManager()
