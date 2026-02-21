import asyncio
import json
from google.adk.sessions import InMemorySessionService
from google.adk.runners import Runner, RunConfig
from google.adk.agents import LiveRequestQueue

from ..agents.articulation_agent import get_plares_agent

APP_NAME = "PlaresAR"
app_agent = get_plares_agent()
session_service = InMemorySessionService()
runner = Runner(agent=app_agent, app_name=APP_NAME, session_service=session_service)

async def handle_client_connection(client_id, websocket):
    """
    Handles ADK Session Lifecycle for a connected WebSocket client.
    Uses the real Google ADK Bidi-streaming architecture.
    """
    print(f"Initializing ADK session for {client_id}")

    # Ensure session exists
    existing = await session_service.get_session(
        app_name=APP_NAME, user_id=client_id, session_id=client_id
    )
    if existing is None:
        await session_service.create_session(
            app_name=APP_NAME, user_id=client_id, session_id=client_id
        )

    queue = LiveRequestQueue()

    async def listen_to_client():
        try:
            async for message in websocket:
                if isinstance(message, bytes):
                    await queue.send_realtime(message)
                else:
                    try:
                        data = json.loads(message)
                        await queue.send_content(message)
                    except json.JSONDecodeError:
                        await queue.send_content(message)
        except Exception as e:
            print(f"Client read error: {e}")
        finally:
            # Client disconnected, shutdown queue
            await queue.close()

    async def process_downstream():
        try:
            # ADK 1.18.0: runner.run_live handles the Bidi-streaming duplex loop
            async for event in runner.run_live(
                user_id=client_id,
                session_id=client_id,
                live_request_queue=queue,
                run_config=RunConfig(),
            ):
                response = {
                    "type": event.__class__.__name__,
                    "data": str(event)
                }
                await websocket.send(json.dumps(response))
        except asyncio.CancelledError:
            print("Live loop cancelled.")
        except Exception as e:
            print(f"Live loop error: {e}")

    listen_task = asyncio.create_task(listen_to_client())
    run_task = asyncio.create_task(process_downstream())

    # Wait for both tasks to complete or client disconnects
    await asyncio.gather(listen_task, run_task, return_exceptions=True)

    # 4. Cleanup
    print(f"Cleaning up ADK session {client_id}")
    queue.close()
