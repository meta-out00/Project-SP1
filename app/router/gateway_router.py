import json
import time
import uuid
from collections.abc import AsyncGenerator
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth.security import decrypt_provider_key
from app.handlers.base_handler import BaseHandler
from app.handlers.mock_handler import MockHandler
from app.handlers.openai_compatible_handler import OpenAICompatibleHandler
from app.hooks.usage_logger import UsageLoggerHook
from app.repositories.admin_repo import AdminRepository
from app.repositories.database import AsyncSessionLocal
from app.schemas.openai_schema import (
    ChatCompletionChoice,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatMessage,
    CompletionUsage,
)


class GatewayRouter:
    """
    ตัวกลางควบคุมเส้นทางคำขอ (Routing Engine)
    - รองรับทั้ง Non-Streaming และ SSE Streaming
    - รองรับทั้ง Managed Key (จาก DB) และ BYOK (X-Provider-Api-Key)
    - จับเวลาและบันทึก Telemetry ลง usage_logs อัตโนมัติ (แยกยอด Managed vs BYOK)
    """

    def __init__(self):
        self.mock_handler = MockHandler()

    def _infer_default_base_url(self, model_name: str) -> str:
        if model_name.startswith("gemini-"):
            return "https://generativelanguage.googleapis.com/v1beta/openai"
        return "https://api.openai.com/v1"

    async def resolve_handler(
        self,
        request: ChatCompletionRequest,
        db: AsyncSession,
        byok_api_key: str | None = None,
    ) -> tuple[BaseHandler, str]:
        if request.model.startswith("mock-"):
            return self.mock_handler, "built-in-mock"

        cleaned_byok = byok_api_key.strip() if byok_api_key else None
        admin_repo = AdminRepository(db)
        provider = await admin_repo.get_active_provider_for_model(request.model)

        if provider:
            base_url = provider.base_url
            provider_name = provider.name
            if cleaned_byok:
                resolved_api_key = cleaned_byok
            elif provider.encrypted_api_key:
                resolved_api_key = decrypt_provider_key(provider.encrypted_api_key)
            else:
                resolved_api_key = None
        else:
            if not cleaned_byok:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"No active AI provider configured for model '{request.model}'. "
                        "Either register a provider via /admin/providers or pass your own key via 'X-Provider-Api-Key' header."
                    ),
                )
            base_url = self._infer_default_base_url(request.model)
            provider_name = "byok-direct"
            resolved_api_key = cleaned_byok

        handler = OpenAICompatibleHandler(
            base_url=base_url,
            api_key=resolved_api_key,
            provider_name=provider_name,
        )
        return handler, provider_name

    async def route_chat_completion(
        self,
        request: ChatCompletionRequest,
        db: AsyncSession,
        api_key_id: int | None = None,
        byok_api_key: str | None = None,
    ) -> ChatCompletionResponse:
        handler, provider_name = await self.resolve_handler(request, db, byok_api_key)
        is_byok = bool(byok_api_key and byok_api_key.strip())

        start_time = time.perf_counter()
        try:
            response = await handler.chat_completion(request)
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)

            await UsageLoggerHook.log_success(
                db=db,
                response=response,
                latency_ms=latency_ms,
                api_key_id=api_key_id,
                is_byok=is_byok,
            )
            return response

        except HTTPException as http_exc:
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            await UsageLoggerHook.log_failure(
                db=db,
                model_name=request.model,
                provider_name=provider_name,
                latency_ms=latency_ms,
                status_code=http_exc.status_code,
                error_message=str(http_exc.detail),
                api_key_id=api_key_id,
                is_byok=is_byok,
            )
            raise

        except Exception as exc:
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            await UsageLoggerHook.log_failure(
                db=db,
                model_name=request.model,
                provider_name=provider_name,
                latency_ms=latency_ms,
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                error_message=str(exc),
                api_key_id=api_key_id,
                is_byok=is_byok,
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Internal Gateway Error: {str(exc)}",
            )

    async def stream_with_logging(
        self,
        handler: BaseHandler,
        provider_name: str,
        request: ChatCompletionRequest,
        api_key_id: int | None = None,
        is_byok: bool = False,
    ) -> AsyncGenerator[str, None]:
        start_time = time.perf_counter()
        stream_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
        prompt_tokens = 0
        completion_tokens = 0
        total_tokens = 0
        collected_text = []

        try:
            async for chunk_str in handler.chat_completion_stream(request):
                if chunk_str.startswith("data: ") and not chunk_str.strip().endswith("[DONE]"):
                    try:
                        payload = json.loads(chunk_str[6:].strip())
                        if payload.get("id"):
                            stream_id = payload["id"]
                        choices = payload.get("choices", [])
                        if choices:
                            delta_content = choices[0].get("delta", {}).get("content", "")
                            if delta_content:
                                collected_text.append(delta_content)
                        if payload.get("usage"):
                            usage_obj = payload["usage"]
                            prompt_tokens = usage_obj.get("prompt_tokens", 0)
                            completion_tokens = usage_obj.get("completion_tokens", 0)
                            total_tokens = usage_obj.get("total_tokens", 0)
                    except Exception:
                        pass

                yield chunk_str

            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            synthetic_response = ChatCompletionResponse(
                id=stream_id,
                model=request.model,
                provider=provider_name,
                choices=[
                    ChatCompletionChoice(
                        index=0,
                        message=ChatMessage(
                            role="assistant", content="".join(collected_text)
                        ),
                    )
                ],
                usage=CompletionUsage(
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=total_tokens,
                ),
            )
            # เปิด Session ใหม่สำหรับบันทึก Log หลังสตรีมจบ (ป้องกัน Session ของ Endpoint ปิดไปก่อน)
            async with AsyncSessionLocal() as log_db:
                await UsageLoggerHook.log_success(
                    db=log_db,
                    response=synthetic_response,
                    latency_ms=latency_ms,
                    api_key_id=api_key_id,
                    is_byok=is_byok,
                )

        except HTTPException as http_exc:
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            async with AsyncSessionLocal() as log_db:
                await UsageLoggerHook.log_failure(
                    db=log_db,
                    model_name=request.model,
                    provider_name=provider_name,
                    latency_ms=latency_ms,
                    status_code=http_exc.status_code,
                    error_message=str(http_exc.detail),
                    api_key_id=api_key_id,
                    is_byok=is_byok,
                )
            err_payload = {
                "error": {"message": str(http_exc.detail), "code": http_exc.status_code}
            }
            yield f"data: {json.dumps(err_payload, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"