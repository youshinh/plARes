import asyncio
import os
import sys

# Ensure backend acts as root
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from datetime import datetime, timezone
import json

from ai_core.main import _finalize_room_runtime, room_runtime_state, _generate_winner_interview

async def main():
    room_id = "test-room-week-6"
    winner_id = "player1_jp"
    loser_id = "player2_es"
    loser_lang = "es"
    
    print(f"--- Triggering Winner Interview for {loser_id} in {loser_lang} ---")
    response = await _generate_winner_interview(winner_id, loser_id, loser_lang)
    print(f"--- Response: {response} ---")
    
if __name__ == "__main__":
    asyncio.run(main())
