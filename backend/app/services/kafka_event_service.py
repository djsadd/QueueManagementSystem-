import json
import logging
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from app.core.config import settings


logger = logging.getLogger(__name__)


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
        try:
            await cls._producer.start()
        except Exception:
            logger.warning("Kafka producer could not be started", exc_info=True)
            cls._producer = None

    @classmethod
    async def stop(cls) -> None:
        if cls._producer is not None:
            await cls._producer.stop()
            cls._producer = None

    @classmethod
    async def publish(cls, topic: str, payload: dict) -> None:
        if cls._producer is None:
            return

        try:
            await cls._producer.send_and_wait(topic, payload)
        except Exception:
            logger.warning("Kafka event publish failed for topic %s", topic, exc_info=True)

    @staticmethod
    def serialize(value):
        if isinstance(value, UUID):
            return str(value)

        if isinstance(value, (datetime, date)):
            return value.isoformat()

        if isinstance(value, Decimal):
            return float(value)

        return str(value)
