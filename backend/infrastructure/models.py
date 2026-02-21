from pydantic import BaseModel, Field
from typing import List, Optional, Literal

class HighlightEvent(BaseModel):
    timestamp: str
    description: str

class MatchLog(BaseModel):
    timestamp: str
    result: Literal["WIN", "LOSE", "DRAW"]
    target_id: Optional[str] = None
    highlight_events: List[HighlightEvent] = Field(default_factory=list)

class RobotStats(BaseModel):
    power: int
    speed: int
    vit: int

class RobotPersonality(BaseModel):
    talk_skill: int
    adlib_skill: int
    tone: str

class RobotNetwork(BaseModel):
    sync_rate: int

class RobotStatus(BaseModel):
    material: str
    level: int
    stats: RobotStats
    personality: RobotPersonality
    network: RobotNetwork

class UserProfile(BaseModel):
    player_name: str
    total_matches: int
    ai_memory_summary: str

class GameEvent(BaseModel):
    event: str
    user: str
    target: Optional[str] = None
    payload: Optional[dict] = None

class Coordinates(BaseModel):
    x: float
    y: float
    z: float

class Vector(BaseModel):
    x: float
    y: float
    z: float

class SyncData(BaseModel):
    user_id: str
    robot_id: str
    position: Coordinates
    velocity: Vector
    timestamp: float
    action: Optional[str] = None
