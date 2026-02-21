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


class TrainingLog(BaseModel):
    session_id: Optional[str] = None
    timestamp: str
    mode: Literal["training"] = "training"
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    sync_rate_before: Optional[float] = None
    sync_rate_after: Optional[float] = None
    result: Literal["SUCCESS", "FAILURE"]
    accuracy_score: Optional[float] = None
    speed_score: Optional[float] = None
    passion_score: Optional[float] = None
    drill_type: Optional[str] = None
    accuracy: Optional[float] = None
    speed: Optional[float] = None
    passion: Optional[float] = None
    retry_count: int = 0
    highlights: List[str] = Field(default_factory=list)
    ai_comment: Optional[str] = None
    highlight_events: List[HighlightEvent] = Field(default_factory=list)


class WalkLog(BaseModel):
    session_id: Optional[str] = None
    timestamp: str
    mode: Literal["walk"] = "walk"
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    route_summary: str = ""
    found_items: List[str] = Field(default_factory=list)
    proactive_audio_highlights: List[str] = Field(default_factory=list)
    sync_rate_before: Optional[float] = None
    sync_rate_after: Optional[float] = None
    ai_comment: Optional[str] = None
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
    sync_rate: float = 0.5
    unison: float = 100.0  # 団体戦用共鳴度

class RobotStatus(BaseModel):
    name: str = ""      # Geminiが提案するロボット名
    material: str       # "Wood" | "Metal" | "Resin"
    level: int = 1
    stats: RobotStats
    personality: RobotPersonality
    network: RobotNetwork
    character_dna: Optional[dict] = None


class CharacterGenerationRequest(BaseModel):
    """フロントエンドから送信するロボット生成リクエスト"""
    user_id: str
    face_image_base64: Optional[str] = None  # Base64 JPEG（スキップ時はNone）
    preset_text: Optional[str] = None        # スキップ時のテキストプロンプト


class CharacterGenerationResult(BaseModel):
    """Gemini Visionから生成したロボット初期パラメータ"""
    name: str
    material: str
    power: int
    speed: int
    vit: int
    talk_skill: int
    adlib_skill: int
    tone: str
    character_dna: Optional[dict] = None

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
    arena_frame_id: Optional[str] = None
