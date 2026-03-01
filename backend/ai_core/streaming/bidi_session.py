import asyncio
import inspect
import json
from google.adk.sessions import InMemorySessionService
from google.adk.runners import Runner, RunConfig
from google.adk.agents import LiveRequestQueue

from ..agents.articulation_agent import get_plares_agent

APP_NAME = "PlaresAR"
app_agent = get_plares_agent()
session_service = InMemorySessionService()
runner = Runner(agent=app_agent, app_name=APP_NAME, session_service=session_service)


def _to_json_safe(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [_to_json_safe(v) for v in value]
    if isinstance(value, tuple):
        return [_to_json_safe(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _to_json_safe(v) for k, v in value.items()}

    for method_name in ("model_dump", "dict"):
        method = getattr(value, method_name, None)
        if callable(method):
            try:
                return _to_json_safe(method())
            except Exception:
                pass
    return str(value)


async def _close_queue(queue: LiveRequestQueue) -> None:
    maybe = queue.close()
    if inspect.isawaitable(maybe):
        await maybe


def _serialize_event(event) -> dict:
    try:
        data = event.model_dump(mode="json")
    except Exception:
        try:
            data = event.dict()
        except Exception:
            data = {"raw": str(event)}
    data = _to_json_safe(data)

    payload = {
        "type": "live_event",
        "event_type": event.__class__.__name__,
        "data": data,
    }

    try:
        function_calls = event.get_function_calls()
    except Exception:
        function_calls = None
    if function_calls:
        payload["function_calls"] = _to_json_safe(function_calls)

    try:
        function_responses = event.get_function_responses()
    except Exception:
        function_responses = None
    if function_responses:
        payload["function_responses"] = _to_json_safe(function_responses)

    try:
        payload["is_final_response"] = bool(event.is_final_response())
    except Exception:
        payload["is_final_response"] = False

    return payload


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
                        if isinstance(data, dict):
                            command = str(data.get("type", "")).lower()
                            if command == "activity_start":
                                await queue.send_activity_start()
                                continue
                            if command == "activity_end":
                                await queue.send_activity_end()
                                continue
                        await queue.send_content(message)
                    except json.JSONDecodeError:
                        await queue.send_content(message)
        except Exception as e:
            print(f"Client read error: {e}")
        finally:
            # Client disconnected, shutdown queue
            await _close_queue(queue)

    async def process_downstream():
        try:
            # ADK 1.18.0: runner.run_live handles the Bidi-streaming duplex loop
            async for event in runner.run_live(
                user_id=client_id,
                session_id=client_id,
                live_request_queue=queue,
                run_config=RunConfig(),
            ):
                response = _serialize_event(event)
                await websocket.send(json.dumps(response))
        except asyncio.CancelledError:
            print("Live loop cancelled.")
        except Exception as e:
            print(f"Live loop error: {e}")

    listen_task = asyncio.create_task(listen_to_client())
    run_task = asyncio.create_task(process_downstream())

    # Prefer prompt teardown on disconnect: when either side completes,
    # cancel the other side to avoid hanging sessions.
    done, pending = await asyncio.wait(
        {listen_task, run_task},
        return_when=asyncio.FIRST_COMPLETED,
    )
    for task in pending:
        task.cancel()
    if pending:
        await asyncio.gather(*pending, return_exceptions=True)
    if done:
        await asyncio.gather(*done, return_exceptions=True)

    # 4. Cleanup
    print(f"Cleaning up ADK session {client_id}")
