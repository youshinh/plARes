import os
import json
from pathlib import Path
from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool
from pydantic import BaseModel, Field
from typing import Optional

from ..adk_bridge import get_adk_bridge
from .tone_control import generate_persona

try:
    from dotenv import load_dotenv
except Exception:  # pragma: no cover
    load_dotenv = None

if load_dotenv is not None:
    env_path = Path(__file__).resolve().parents[2] / ".env"
    load_dotenv(env_path, override=False)

# Define Pydantic models for the function tools
class EvaluateArticulationArgs(BaseModel):
    accuracy: float = Field(..., ge=0.0, le=1.0, description="0.0 to 1.0")
    speed: float = Field(..., ge=0.0, le=1.0, description="0.0 to 1.0")
    passion: float = Field(..., ge=0.0, le=1.0, description="0.0 to 1.0")
    is_critical: bool
    is_miss: bool
    action: str = Field(..., description="Action to take: deploy_shield, attack, dodge, stumble, heavy_attack")

class ExecuteTacticalMoveArgs(BaseModel):
    room_id: str
    user_id: str
    action: str
    target: Optional[str] = None

class QueryBattleStateArgs(BaseModel):
    room_id: str
    user_id: str

# Define the actual functions for the tools
def evaluate_articulation(args: EvaluateArticulationArgs) -> str:
    """Evaluate the user's raw voice (incantation) against accuracy, speed, and passion."""
    recommended_action = args.action
    if args.is_miss:
        recommended_action = "observe"
    elif args.is_critical and args.passion >= 0.75:
        recommended_action = "heavy_attack"
    return json.dumps(
        {
            "ok": True,
            "kind": "articulation_feedback",
            "accuracy": args.accuracy,
            "speed": args.speed,
            "passion": args.passion,
            "recommended_action": recommended_action,
        },
        ensure_ascii=False,
    )

def execute_tactical_move(args: ExecuteTacticalMoveArgs) -> str:
    """React to the opponent or environmental changes with physical actions."""
    payload = get_adk_bridge().propose_tactic(
        room_id=args.room_id,
        user_id=args.user_id,
        action=args.action,
        target=args.target,
    )
    return json.dumps(payload, ensure_ascii=False)


def query_battle_state(args: QueryBattleStateArgs) -> str:
    """Read the current battle snapshot for a user in a room."""
    payload = get_adk_bridge().query_battle_state(
        room_id=args.room_id,
        user_id=args.user_id,
    )
    return json.dumps(payload, ensure_ascii=False)

def get_plares_agent() -> LlmAgent:
    """
    Initializes the global stateless App Agent using ADK.
    """
    default_live_model = "models/gemini-2.5-flash-native-audio-preview-12-2025"
    model_name = os.getenv("PLARES_ADK_MODEL", default_live_model).strip() or default_live_model

    evaluate_articulation_tool = FunctionTool(evaluate_articulation)
    execute_tactical_move_tool = FunctionTool(execute_tactical_move)
    query_battle_state_tool = FunctionTool(query_battle_state)

    default_prompt = generate_persona(
        robot_name="PlaresBot Default",
        robot_tone="Aggressive, Competitive",
        intelligence_level="High"
    )

    agent = LlmAgent(
        name="plares_agent",
        model=model_name,
        instruction=default_prompt,
        tools=[evaluate_articulation_tool, execute_tactical_move_tool, query_battle_state_tool]
    )
    
    return agent
