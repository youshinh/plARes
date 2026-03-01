import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from ai_core.streaming.live_queue import LiveRequestQueue
from ai_core.streaming.bidi_session import handle_client_connection
from ai_core.agents.articulation_agent import get_plares_agent


@pytest.mark.asyncio
async def test_live_queue_basic():
    queue = LiveRequestQueue()
    await queue.put({"data": "test1"})
    await queue.put({"data": "test2"})
    
    item1 = await queue.get()
    item2 = await queue.get()
    
    assert item1["data"] == "test1"
    assert item2["data"] == "test2"


@pytest.mark.asyncio
async def test_live_queue_close():
    queue = LiveRequestQueue()
    await queue.put("item")
    await queue.close()
    
    item = await queue.get()
    assert item == "item"
    
    with pytest.raises(asyncio.CancelledError):
        await queue.get()


@pytest.mark.asyncio
async def test_handle_client_connection():
    """
    Unit test for handle_client_connection.
    Mocks the ADK runner.run_live() so no real Gemini API call is made.
    """
    class DummyWebSocket:
        def __init__(self):
            self.send = AsyncMock()

        def __aiter__(self):
            return self

        async def __anext__(self):
            raise StopAsyncIteration

    mock_ws = DummyWebSocket()

    async def mock_run_live(**kwargs):
        # Simulate the runner emitting one event then stopping
        mock_event = MagicMock()
        mock_event.__class__.__name__ = "TextEvent"
        yield mock_event

    with patch("ai_core.streaming.bidi_session.runner.run_live", new=mock_run_live):
        await asyncio.wait_for(
            handle_client_connection("test_client_id", mock_ws),
            timeout=3.0
        )

    # Check that websocket.send was called with the serialized event
    mock_ws.send.assert_called_once()
    call_arg = mock_ws.send.call_args[0][0]
    assert "TextEvent" in call_arg


def test_articulation_agent_setup():
    agent = get_plares_agent()
    assert agent.name == "plares_agent"
    assert len(agent.tools) == 2
    assert "You are PlaresBot Default" in agent.instruction
