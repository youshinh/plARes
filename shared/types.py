from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List

class LiveConfig(BaseModel):
    client_id: str
    robot_name: str
    robot_tone: str
    intelligence_level: str
    sync_rate: float = Field(default=0.0, description="Synchronization rate between player and robot (0.0 to 1.0)")

class ArticulationScore(BaseModel):
    accuracy: float = Field(..., ge=0.0, le=1.0)
    speed: float = Field(..., ge=0.0, le=1.0)
    passion: float = Field(..., ge=0.0, le=1.0)
    is_critical: bool
    is_miss: bool

class ActionCommand(BaseModel):
    command_type: str = Field(description="The type of the action, e.g., 'deploy_shield', 'attack'")
    target: Optional[str] = Field(None, description="The target of the action, if applicable")
    parameters: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional parameters for the action")

class FunctionCallResponse(BaseModel):
    action: ActionCommand
    articulation_score: Optional[ArticulationScore] = None
    speech_text: Optional[str] = None

class FusedItem(BaseModel):
    requested_by: str
    concept: str
    texture_url: str

class MemoryUpdate(BaseModel):
    user_id: str
    timestamp: str
    room_id: str
    result: str
    total_matches: int
    ai_memory_summary: str

