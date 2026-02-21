import asyncio
import os
import sys

# Ensure backend acts as root
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from datetime import datetime, timezone
import json
from ai_core.main import _finalize_room_runtime, room_runtime_state, _load_user_profile, _save_user_profile

async def main():
    room_id = "test-room-week-5"
    user_id = "test-user-milestone"
    
    # 1. Setup mock user profile with 4 matches out of 5 to trigger Veo on the next
    profile = _load_user_profile(user_id, "en-US", 0.5)
    profile["total_matches"] = 4
    _save_user_profile(profile)
    
    # 2. Inject mock game state
    room_runtime_state[room_id] = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "events": [],
        "sync_packets": 100,
        "per_user": {
            user_id: {
                "critical_hits": 5, # Critical hits > misses = WIN (Lyria trigger)
                "misses": 2,
                "lang": "en-US",
                "sync_rate": 0.5
            }
        }
    }
    
    # 3. Trigger _finalize_room_runtime
    print("--- Triggering the room finalize ---")
    _finalize_room_runtime(room_id, trigger="manual_test")
    print("--- Trigger complete ---")
    
    # Allow background event loop tasks to run and print logs
    await asyncio.sleep(2)

if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
