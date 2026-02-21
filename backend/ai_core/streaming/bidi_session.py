import asyncio
import json
from google.adk.sessions import InMemorySessionService
from google.adk.runners import Runner
from google.adk.agents import LiveRequestQueue

from ..agents.articulation_agent import get_plares_agent

app_agent = get_plares_agent()
session_service = InMemorySessionService()

async def handle_client_connection(client_id, websocket):
    """
    Handles ADK Session Lifecycle for a connected WebSocket client.
    Uses the real Google ADK Bidi-streaming architecture.
    """
    print(f"Initializing ADK session for {client_id}")
    
    # 2. Session Init (Stateful)
    try:
        session = await session_service.get_session(client_id)
    except Exception:
        # Fallback to creating a new one if it doesn't exist
        session = await session_service.create_session(session_id=client_id, app_name="PlaresAR", user_id=client_id)
        
    queue = LiveRequestQueue()

    # 3. Stream Execution Setup
    from google.adk.agents import InvocationContext, RunConfig
    
    context = InvocationContext(
        id=client_id,
        session=session,
        live_request_queue=queue,
        run_config=RunConfig(),
        agent=app_agent
    )

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
            # Launch the live Bidi-streaming loop specifically on the LlmAgent
            async for event in app_agent.run_live(parent_context=context):
                # Serialize ADK Event Actions (like Function Calls or Native Audio) back to client
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
    await queue.close()
