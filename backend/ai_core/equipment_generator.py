import asyncio
import logging
import os
from typing import Any, Literal, TypedDict

MountPointId = Literal["WEAPON_R", "WEAPON_L", "HEAD_ACCESSORY", "BACKPACK"]
CraftKind = Literal["skin", "attachment"]

VALID_MOUNT_POINTS: tuple[MountPointId, ...] = (
    "WEAPON_R",
    "WEAPON_L",
    "HEAD_ACCESSORY",
    "BACKPACK",
)


class EquipmentGenerationPayload(TypedDict):
    action: str
    mount_point: MountPointId | None
    scale: float
    inventory_type: str


def normalize_craft_kind(value: Any) -> CraftKind:
    if isinstance(value, str) and value.strip().lower() == "attachment":
        return "attachment"
    return "skin"


def normalize_mount_point(value: Any) -> MountPointId:
    if isinstance(value, str):
        upper = value.strip().upper()
        if upper in VALID_MOUNT_POINTS:
            return upper  # type: ignore[return-value]
    return "WEAPON_R"


def build_equipment_payload(craft_kind: CraftKind, mount_point: Any) -> EquipmentGenerationPayload:
    if craft_kind == "attachment":
        resolved_mount = normalize_mount_point(mount_point)
        return {
            "action": "attach",
            "mount_point": resolved_mount,
            "scale": 0.28,
            "inventory_type": "attachment",
        }

    return {
        "action": "equip",
        "mount_point": None,
        "scale": 1.0,
        "inventory_type": "skin",
    }


# ── Meshy Image-to-3D Client ───────────────────────────────────────────────

logger = logging.getLogger(__name__)

try:
    import aiohttp  # type: ignore
    _AIOHTTP_AVAILABLE = True
except ImportError:
    aiohttp = None  # type: ignore[assignment]
    _AIOHTTP_AVAILABLE = False

MESHY_BASE_URL = "https://api.meshy.ai/openapi/v1"
MESHY_POLL_INTERVAL_SEC = 4.0
MESHY_MAX_POLL_SEC = 180.0  # 3分タイムアウト


class MeshyGenerationError(RuntimeError):
    """Meshy API の生成エラー。"""


class MeshyClient:
    """
    Meshy Image-to-3D API の非同期クライアント。

    最速構成:
    - エンドポイント: POST /v1/image-to-3d
    - ai_model: "latest" (= Meshy-6)
    - should_remesh: False  → リメッシュなしで最速
    - should_texture: True
    - enable_pbr: True      → メタリック/ラフネス/ノーマルマップ付き

    craft_kind="attachment" → GLB URL を返す
    craft_kind="skin"       → base_color テクスチャ URL を返す

    使用例::
        client = MeshyClient()
        glb_url = await client.generate(image_base64="...", prompt="sword")
    """

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or os.getenv("MESHY_API_KEY", "")

    async def generate(
        self,
        image_base64: str,
        prompt: str = "",
        *,
        craft_kind: CraftKind = "attachment",
    ) -> str:
        """
        画像（Base64）から3Dモデルを生成して URL を返す。

        Args:
            image_base64: JPEG / PNG の Base64 エンコード文字列
                          (data URI プレフィックス付きでも可)
            prompt: テクスチャ生成のヒントとなるテキスト
            craft_kind: "attachment" → GLB URL, "skin" → テクスチャ URL

        Returns:
            craft_kind="attachment" の場合 GLB URL、
            craft_kind="skin" の場合 base_color テクスチャ URL
        """
        if not self._api_key:
            raise MeshyGenerationError(
                "MESHY_API_KEY が設定されていません。"
                ".env ファイルまたは環境変数に MESHY_API_KEY を追加してください。"
            )
        if not _AIOHTTP_AVAILABLE:
            raise MeshyGenerationError(
                "aiohttp がインストールされていません。"
                "`pip install aiohttp` を実行してください。"
            )

        data_uri = self._to_data_uri(image_base64)
        task_id = await self._create_task(data_uri, prompt)
        logger.info(f"[Meshy] Image-to-3D task created: {task_id}")

        task = await self._poll_task(task_id)
        logger.info(f"[Meshy] Task {task_id} SUCCEEDED")

        return self._extract_url(task, task_id, craft_kind)

    # ── helpers ─────────────────────────────────────────────────────────────

    @staticmethod
    def _to_data_uri(image_base64: str) -> str:
        s = (image_base64 or "").strip()
        if s.startswith("data:"):
            return s
        return f"data:image/jpeg;base64,{s}"

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

    async def _create_task(self, data_uri: str, prompt: str) -> str:
        """POST /v1/image-to-3d でタスクを作成し task ID を返す。"""
        payload: dict[str, Any] = {
            "image_url": data_uri,
            "ai_model": "meshy-4",      # "latest" (Meshy-6)からダウングレード。コスト半分＆高速化
            "should_remesh": False,     # False = リメッシュなし = 最速
            "should_texture": True,
            # "enable_pbr": False,      # コストと生成時間を削減するためPBR生成もオフにする
        }
        if prompt:
            payload["texture_prompt"] = prompt[:200]

        url = f"{MESHY_BASE_URL}/image-to-3d"
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=self._headers(), json=payload) as resp:
                if resp.status >= 400:
                    body = await resp.text()
                    raise MeshyGenerationError(
                        f"Meshy タスク作成失敗 HTTP {resp.status}: {body[:400]}"
                    )
                data: dict[str, Any] = await resp.json()

        task_id = data.get("result", "")
        if not task_id:
            raise MeshyGenerationError(
                f"Meshy API が task ID を返しませんでした: {data}"
            )
        return str(task_id)

    async def _poll_task(self, task_id: str) -> dict[str, Any]:
        """
        GET /v1/image-to-3d/{task_id} を定期的にポーリングし SUCCEEDED 結果を返す。
        FAILED / EXPIRED の場合は MeshyGenerationError を送出。
        """
        url = f"{MESHY_BASE_URL}/image-to-3d/{task_id}"
        elapsed = 0.0

        async with aiohttp.ClientSession() as session:
            while elapsed < MESHY_MAX_POLL_SEC:
                async with session.get(url, headers=self._headers()) as resp:
                    if resp.status >= 400:
                        body = await resp.text()
                        raise MeshyGenerationError(
                            f"Meshy ポーリング失敗 HTTP {resp.status}: {body[:400]}"
                        )
                    task: dict[str, Any] = await resp.json()

                status = task.get("status", "")
                progress = task.get("progress", 0)
                logger.debug(
                    f"[Meshy] Task {task_id} status={status} progress={progress}%"
                )

                if status == "SUCCEEDED":
                    return task
                if status in ("FAILED", "EXPIRED"):
                    err_msg = (task.get("task_error") or {}).get("message", "")
                    raise MeshyGenerationError(
                        f"Meshy タスク {task_id} が {status} になりました: {err_msg}"
                    )

                await asyncio.sleep(MESHY_POLL_INTERVAL_SEC)
                elapsed += MESHY_POLL_INTERVAL_SEC

        raise MeshyGenerationError(
            f"Meshy タスク {task_id} が {MESHY_MAX_POLL_SEC}秒以内に完了しませんでした。"
        )

    @staticmethod
    def _extract_url(
        task: dict[str, Any],
        task_id: str,
        craft_kind: CraftKind,
    ) -> str:
        """タスク結果から craft_kind に応じた URL を抽出する。"""
        if craft_kind == "attachment":
            glb_url = (task.get("model_urls") or {}).get("glb", "")
            if not glb_url:
                raise MeshyGenerationError(
                    f"Task {task_id}: GLB URL が返されませんでした。"
                )
            return glb_url

        # skin → base_color テクスチャ URL
        texture_urls = task.get("texture_urls") or []
        if texture_urls and isinstance(texture_urls[0], dict):
            url = texture_urls[0].get("base_color", "")
            if url:
                return url
        # フォールバック: thumbnail
        thumbnail = task.get("thumbnail_url", "")
        if thumbnail:
            return thumbnail
        raise MeshyGenerationError(
            f"Task {task_id}: テクスチャ URL が返されませんでした。"
        )
