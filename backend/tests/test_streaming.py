import pytest
import asyncio
from unittest.mock import AsyncMock

from ai_core.streaming.live_queue import LiveRequestQueue
from ai_core.streaming.bidi_session import handle_client_connection, get_plares_agent

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
    # Mock a websocket connection
    mock_ws = AsyncMock()
    mock_ws.__aiter__.return_value = ["message1", "message2"]
    
    # We want handle_client_connection to complete quickly without blocking forever
    # Since it waits for listen_task (which finishes after 2 messages based on __aiter__)
    # it should close cleanly.
    await handle_client_connection("test_client_id", mock_ws)
    
    # Check that stream.send was called (mocking the runner output)
    mock_ws.send.assert_called()

def test_articulation_agent_setup():
    agent = get_plares_agent()
    assert agent.name == "plares_agent"
    assert len(agent.tools) == 2
    assert "You are PlaresBot Default" in agent.instruction
