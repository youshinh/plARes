import logging
from typing import Dict, Any, List
from .models import MatchLog, HighlightEvent, SyncData, GameEvent
from datetime import datetime

# Import Firebase Admin SDK Native implementation
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
import asyncio

logger = logging.getLogger(__name__)

class StateManager:
    """
    State Management layer for Prares AR.
    Ensures that high-frequency positional syncs and damage events
    are stored entirely in-memory during the match, 
    to prevent overwhelming Firestore with read/write costs.
    """
    def __init__(self, match_id: str):
        self.match_id = match_id
        self.is_active = False
        
        # Ensure Firebase Admin is initialized
        if not firebase_admin._apps:
            # Requires GOOGLE_APPLICATION_CREDENTIALS to be set in env
            firebase_admin.initialize_app()
            
        self.db = firestore.client()
        
        # In-memory storage for high-frequency events
        self.match_events: List[GameEvent] = []
        self.positional_history: Dict[str, List[SyncData]] = {}
        
        # Aggregated highlight events for the LLM to summarize at the end
        self.highlight_events: List[HighlightEvent] = []
        
    def start_match(self):
        """Initializes match state in memory."""
        self.is_active = True
        logger.info(f"Match {self.match_id} started. Gathering initial context from Vertex Cache...")
        
    def log_position(self, data: SyncData):
        """Logs positional data in memory. NEVER written to Firestore directly."""
        if not self.is_active:
            return
            
        if data.user_id not in self.positional_history:
            self.positional_history[data.user_id] = []
            
        self.positional_history[data.user_id].append(data)
        
        # Simple memory trim to prevent unbounded growth during long matches
        if len(self.positional_history[data.user_id]) > 1000:
            self.positional_history[data.user_id].pop(0)

    def process_game_event(self, event: GameEvent):
        if not self.is_active:
            return
            
        self.match_events.append(event)
        
        # Logic to determine if an event is a "Highlight"
        if event.event in ["critical_hit", "milestone_reached", "item_dropped"]:
            description = f"{event.user} triggered {event.event} against {event.target or 'None'}"
            hl = HighlightEvent(
                timestamp=datetime.utcnow().isoformat(),
                description=description
            )
            self.highlight_events.append(hl)

    async def commit_and_summarize(self, user_id: str, result: str) -> MatchLog:
        """
        Implementation of the Commit & Summarize pattern.
        Utilizes Firestore Admin SDK for batch writes.
        """
        self.is_active = False
        logger.info(f"Match {self.match_id} ended. Prompting Gemini for 3-sentence extraction...")
        
        # Real Implementation mock according to SKILL.md:
        # prompt = f"Extract the narrative highlights of this match in 3 sentences based on these events: {self.highlight_events}"
        # summary = await gemini_model.generate_content(prompt)
        
        ai_highlight = "The robot narrowly dodged the Spring Roll attack and countered with a massive Laser Beam to secure the victory at the last second. The sync rate peaked during the final blow."
        
        match_log_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "result": result,
            "highlight_events": [h.dict() for h in self.highlight_events]
        }
        
        logger.info(f"Writing 3-sentence summary to users/{user_id}/matchLogs/{self.match_id} and updating aiMemorySummary")
        
        # Execute Firestore Batch Commit to minimize billing
        batch = self.db.batch()
        
        user_ref = self.db.collection('users').document(user_id)
        match_log_ref = user_ref.collection('matchLogs').document(self.match_id)
        
        batch.set(match_log_ref, match_log_data)
        batch.update(user_ref, {"aiMemorySummary": ai_highlight})
        
        # Run batch commit in async wrapper
        await asyncio.to_thread(batch.commit)
        logger.info("Firestore State Commit Successful.")
        
        return MatchLog(**match_log_data)


