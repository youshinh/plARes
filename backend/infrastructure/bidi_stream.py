import asyncio
import logging
from typing import Optional, Any
from .models import GameEvent, SyncData

from google_adk import Runner, SessionService, RunConfig, LiveRequestQueue

logger = logging.getLogger(__name__)

class ADKBidiStreamingManager:
    """
    Manages the Bidi-streaming lifecycle using the Agent Development Kit (ADK).
    Integrates connection management, Session context, and the LiveRequestQueue.
    """
    def __init__(self, session_id: str, runner: Runner, session_service: SessionService):
        self.session_id = session_id
        
        # SessionService retrieves/creates the conversation history directly
        self.session = session_service.get_or_create_session(session_id)
        self.runner = runner # ADK Runner instance
        
        # LiveRequestQueue is provided by ADK for multimodal multiplexing
        self.request_queue = LiveRequestQueue()
        
        self.audio_gating_active = False
        self.video_gating_active = False
        self.is_closed = False

    async def start_session(self):
        """Initializes ADK live streaming session."""
        logger.info(f"Starting ADK Bidi-streaming session: {self.session_id}")
        
        run_config = RunConfig(modalities=["AUDIO", "VIDEO", "TEXT"])
        try:
            # Native ADK run_live handles the bidirectional duplex loop transparently.
            # No mock asyncio.sleep needed here. 
            await self.runner.run_live(session=self.session, config=run_config, queue=self.request_queue)
        except Exception as e:
            logger.error(f"Error in ADK Bidi-stream loop: {e}")
        finally:
            self.stop_session()

    def stop_session(self):
        logger.info(f"Stopping session: {self.session_id}")
        self.is_closed = True
        self.request_queue.close()

    async def receive_client_data(self, data_type: str, payload: dict):
        """
        Receives data from client (WebRTC, User voice, Video frames).
        Implements Dynamic Gating to drop expensive data when not needed.
        """
        if data_type == "audio" and not self.audio_gating_active:
            return
            
        if data_type == "video" and not self.video_gating_active:
            return

        # Uses the ADK LiveRequestQueue native method
        await self.request_queue.put({"type": data_type, "payload": payload})
        logger.debug(f"Pushed {data_type} to ADK LiveRequestQueue")

    def open_audio_gate(self):
        self.audio_gating_active = True
        logger.info("Audio Gating: OPENED (Microphone stream live)")

    def open_video_gate(self):
        self.video_gating_active = True
        logger.info("Video Gating: OPENED (Camera stream live)")

    def close_gates(self):
        self.audio_gating_active = False
        self.video_gating_active = False
        logger.info("Gating: CLOSED")


