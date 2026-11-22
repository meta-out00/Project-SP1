from fastapi import APIRouter, Depends, Header
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth.api_key_handler import verify_virtual_api_key
from app.auth.rate_limiter import enforce_rate_limit, verify_model_access
from app.repositories.admin_repo import AdminRepository
from app.repositories.database import get_db
from app.repositories.log_repo import LogRepository
from app.repositories.models import ApiKey
from app.router.gateway_router import GatewayRouter
from app.schemas.admin_schema import MyUsageResponse
from app.schemas.openai_schema import ChatCompletionRequest, ChatCompletionResponse

router = APIRouter(prefix="/v1", tags=["Data Plane - Chat Completions"])
gateway_router = GatewayRouter()


@router.post("/chat/completions", response_model=ChatCompletionResponse)
async def create_chat_completion(
    request: ChatCompletionRequest,
    api_key: ApiKey = Depends(enforce_rate_limit),
    x_provider_api_key: str | None = Header(
        default=None,
        alias="X-Provider-Api-Key",
        description="Optional: พก API Key ของค่าย AI ส่วนตัวมาเอง (BYOK) เพื่อใช้แทนคีย์กลางของระบบ",
    ),
    db: AsyncSession = Depends(get_db),
):
    """
    Endpoint หลักสำหรับรับคำขอสนทนาตามมาตรฐาน OpenAI API
    - ตรวจสอบสิทธิ์ Virtual API Key, โควต้าตาม Role (งบประมาณ/ความเร็ว) และสิทธิ์เรียกใช้งานโมเดล
    - รองรับทั้งการตอบกลับแบบก้อนเดียว (stream: false) และไหลทีละคำ (stream: true)
    """
    # ตรวจสิทธิ์การเรียกใช้โมเดลตาม Role Policy (บล็อกทั้งแบบปกติและ Streaming)
    verify_model_access(api_key=api_key, model_name=request.model)

    if request.stream:
        # Resolve Handler ก่อนเริ่มสตรีม เพื่อให้คืน HTTP 400 ได้ทันทีหากตั้งค่าไม่ครบ
        handler, provider_name = await gateway_router.resolve_handler(
            request=request,
            db=db,
            byok_api_key=x_provider_api_key,
        )
        return StreamingResponse(
            gateway_router.stream_with_logging(
                handler=handler,
                provider_name=provider_name,
                request=request,
                api_key_id=api_key.id,
                is_byok=bool(x_provider_api_key and x_provider_api_key.strip()),
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    return await gateway_router.route_chat_completion(
        request=request,
        db=db,
        api_key_id=api_key.id,
        byok_api_key=x_provider_api_key,
    )


@router.get("/usage/me", response_model=MyUsageResponse)
async def get_my_usage(
    api_key: ApiKey = Depends(verify_virtual_api_key),
    db: AsyncSession = Depends(get_db),
):
    """ให้เจ้าของ Virtual API Key ตรวจสอบโควต้า งบกลางคงเหลือ และยอดใช้งานสะสมของตัวเอง"""
    role_policy = None
    if api_key.role_name:
        admin_repo = AdminRepository(db)
        role_policy = await admin_repo.get_role_by_name(api_key.role_name)

    effective_budget = (
        api_key.max_budget_usd
        if api_key.max_budget_usd is not None
        else (role_policy.default_max_budget_usd if role_policy else None)
    )
    effective_rpm = (
        api_key.rate_limit_per_minute
        if api_key.rate_limit_per_minute is not None
        else (role_policy.default_rate_limit_per_minute if role_policy else None)
    )
    remaining_budget = (
        round(max(0.0, effective_budget - api_key.current_spend_usd), 6)
        if effective_budget is not None
        else None
    )

    log_repo = LogRepository(db)
    stats = await log_repo.get_usage_stats_by_api_key(api_key.id)

    return MyUsageResponse(
        key_name=api_key.key_name,
        key_prefix=api_key.key_prefix,
        role_name=api_key.role_name,
        effective_rate_limit_per_minute=effective_rpm,
        effective_max_budget_usd=effective_budget,
        current_spend_usd=round(api_key.current_spend_usd, 6),
        remaining_budget_usd=remaining_budget,
        allowed_models=role_policy.allowed_models if role_policy else "*",
        total_requests=stats["total_requests"],
        total_tokens=stats["total_tokens"],
        byok_requests=stats["byok_requests"],
        byok_estimated_cost_usd=stats["byok_estimated_cost_usd"],
    )