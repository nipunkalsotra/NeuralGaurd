# backend/sentinel/event_bus/asyncio_queue_bus.py
"""
Event Bus — pub/sub over asyncio.Queue.
Per master doc Section 6: zero dependencies, in-memory, genuinely concurrent
(subscribers processed via asyncio.gather, not sequential polling).
"""

import asyncio
import logging
from typing import Any, Awaitable, Callable, Dict, List

logger = logging.getLogger("sentinel.event_bus")

Handler = Callable[[Dict[str, Any]], Awaitable[None]]


class EventBus:
    def __init__(self):
        self._subscribers: Dict[str, List[Handler]] = {}

    def subscribe(self, topic: str, handler: Handler) -> None:
        self._subscribers.setdefault(topic, []).append(handler)
        logger.info("Subscribed handler to topic '%s'", topic)

    async def publish(self, topic: str, event: Dict[str, Any]) -> None:
        handlers = self._subscribers.get(topic, [])
        if not handlers:
            logger.warning("No subscribers for topic '%s'", topic)
            return
        logger.info("Publishing to '%s': %d subscriber(s)", topic, len(handlers))
        # Concurrent dispatch — matches master doc's "not sequential polling" requirement
        await asyncio.gather(*(handler(event) for handler in handlers))