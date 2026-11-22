import time
from collections import defaultdict, deque
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth.api_key_handler import verify_virtual_api_key
from app.repositories.admin_repo import AdminRepository
from app.repositories.database import get_db
from app.repositories.models import ApiKey, RolePolicy


class InMemoryRateLimiter:
    """ตัวจำกัดจำนวนครั้งการเรียกใช้งานต่อนาที (Sliding Window Rate Limiter)"""

    def __init__(self):
        # เก็บ Timestamp ของแต่ละ api_key_id: { key_id: deque([t1, t2, ...]) }
        self._requests: dict[int, deque[float]] = defaultdict(deque)

    def check_rate_limit(self, key_id: int, limit_per_minute: int) -> None:
        now = time.monotonic()
        window_start = now - 60.0
        timestamps = self._requests[key_id]

        # ลบประวัติการยิงที่เก่าเกิน 60 วินาทีออกจากคิว
        while timestamps and timestamps[0] < window_start:
            timestamps.popleft()

        if len(timestamps) >= limit_per_minute:
            retry_after = max(1, int(60 - (now - timestamps[0])))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded ({limit_per_minute} requests/minute). Try again in {retry_after}s.",
                headers={"Retry-After": str(retry_after)},
            )

        timestamps.append(now)


rate_limiter = InMemoryRateLimiter()


async def enforce_rate_limit(
    api_key: ApiKey = Depends(verify_virtual_api_key),
    x_provider_api_key: str | None = Header(default=None, alias="X-Provider-Api-Key"),
    db: AsyncSession = Depends(get_db),
) -> ApiKey:
    """
    Dependency สำหรับตรวจสิทธิ์ API Key, ดึงโควต้าจาก Role (ถ้าไม่ได้ Override),
    ตรวจงบประมาณ (เฉพาะคีย์กลาง) และเช็กความเร็วการยิง (RPM)
    """
    is_byok = bool(x_provider_api_key and x_provider_api_key.strip())

    role_policy: RolePolicy | None = None
    if api_key.role_name:
        admin_repo = AdminRepository(db)
        role_policy = await admin_repo.get_role_by_name(api_key.role_name)

    setattr(api_key, "_role_policy", role_policy)

    # 1. ตรวจงบประมาณกลาง (ข้ามหากผู้ใช้พกคีย์ส่วนตัว BYOK มาเอง)
    if not is_byok:
        effective_budget = (
            api_key.max_budget_usd
            if api_key.max_budget_usd is not None
            else (role_policy.default_max_budget_usd if role_policy else None)
        )
        if effective_budget is not None and api_key.current_spend_usd >= effective_budget:
            role_label = f" (role='{api_key.role_name}')" if api_key.role_name else ""
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=(
                    f"Budget limit exceeded{role_label}. "
                    f"Current spend: ${api_key.current_spend_usd:.6f} / "
                    f"Max budget: ${effective_budget:.6f}"
                ),
            )

    # 2. ตรวจความเร็วการยิง (บังคับใช้ทั้งคีย์กลางและ BYOK เพื่อป้องกันการยิงถล่ม Gateway)
    effective_rpm = (
        api_key.rate_limit_per_minute
        if api_key.rate_limit_per_minute is not None
        else (role_policy.default_rate_limit_per_minute if role_policy else None)
    )
    if effective_rpm and effective_rpm > 0:
        rate_limiter.check_rate_limit(key_id=api_key.id, limit_per_minute=effective_rpm)

    return api_key


def verify_model_access(api_key: ApiKey, model_name: str) -> None:
    """ตรวจสอบว่า Role ของคีย์นี้ได้รับอนุญาตให้เรียกใช้งานโมเดลที่ร้องขอหรือไม่"""
    role_policy: RolePolicy | None = getattr(api_key, "_role_policy", None)
    if not role_policy or not role_policy.allowed_models:
        return

    allowed_raw = role_policy.allowed_models.strip()
    if allowed_raw == "*":
        return

    allowed_prefixes = [p.strip().lower() for p in allowed_raw.split(",") if p.strip()]
    normalized_model = model_name.strip().lower()

    if not any(normalized_model.startswith(prefix) for prefix in allowed_prefixes):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Model '{model_name}' is not allowed for role '{role_policy.role_name}'. "
                f"Allowed prefixes: {allowed_raw}"
            ),
        )