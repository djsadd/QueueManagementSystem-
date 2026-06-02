import json
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from app.core.config import settings


class KafkaEventService:
    _producer = None

    @classmethod
    async def start(cls) -> None:
        if not settings.KAFKA_ENABLED:
            return

        try:
            from aiokafka import AIOKafkaProducer
        except ImportError:
            return

        cls._producer = AIOKafkaProducer(
            bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
            value_serializer=lambda value: json.dumps(value, default=cls.serialize).encode("utf-8"),
        )
        await cls._producer.start()

    @classmethod
    async def stop(cls) -> None:
        if cls._producer is not None:
            await cls._producer.stop()
            cls._producer = None

    @classmethod
    async def publish(cls, topic: str, payload: dict) -> None:
        if cls._producer is None:
            return

        await cls._producer.send_and_wait(topic, payload)

    @staticmethod
    def serialize(value):
        if isinstance(value, UUID):
            return str(value)

        if isinstance(value, (datetime, date)):
            return value.isoformat()

        if isinstance(value, Decimal):
            return float(value)

        return str(value)
