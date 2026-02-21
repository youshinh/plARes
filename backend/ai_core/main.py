import asyncio
import websockets
import json

from .streaming.bidi_session import handle_client_connection

async def websocket_handler(websocket, path):
    # In a real app, we'd extract the client ID from the path or a handshake message
    # Here we just use a generic implementation
    client_id = str(id(websocket))
    print(f"New client connected: {client_id}")

    try:
        await handle_client_connection(client_id, websocket)
    except websockets.exceptions.ConnectionClosed:
        print(f"Client {client_id} disconnected unexpectedly.")
    finally:
        print(f"Connection cleanup for client {client_id} completed.")

async def start_server():
    print("Starting PlaresAR Backend AI Core...")
    print("WebSocket server listening on ws://localhost:8765")
    async with websockets.serve(websocket_handler, "localhost", 8765):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(start_server())
