import asyncio

class LiveRequestQueue:
    """
    A thread-safe asynchronous FIFO buffer for multimodal inputs (audio/video).
    Used to route upstream data into the Gemini Multimodal Live API without blocking.
    """
    def __init__(self):
        self._queue = asyncio.Queue()
        self._closed = False

    async def put(self, item):
        if not self._closed:
            await self._queue.put(item)

    async def get(self):
        """Get the next item. Raises asyncio.CancelledError if queue is closed."""
        item = await self._queue.get()
        if self._closed and item is None:
             raise asyncio.CancelledError()
        return item

    async def close(self):
        self._closed = True
        # Wake up any pending gets
        await self._queue.put(None)
