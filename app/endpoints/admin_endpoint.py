from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth.jwt_handler import get_current_admin
from app.auth.security import create_access_token, verify_password
from app.repositories.admin_repo import AdminRepository
from app.repositories.database import get_db
from app.repositories.log_repo import LogRepository
from app.repositories.models import User
from app.schemas.admin_schema import (
    AdminLoginRequest,
    AnalyticsSummaryResponse,
    ApiKeyCreateRequest,
    ApiKeyCreateResponse,
    ApiKeyItemResponse,
    AuditLogItemResponse,
    ProviderCreateRequest,
    ProviderResponse,
    RolePolicyCreateRequest,
    RolePolicyResponse,
    RolePolicyUpdateRequest,
    TokenResponse,
    UsageLogItemResponse,
)

router = APIRouter(prefix="/admin", tags=["Control Plane - Admin Management"])


# ==========================================
# 1. เข้าสู่ระบบแอดมิน (ไม่ต้องใช้ JWT)
# ==========================================
@router.post("/login", response_model=TokenResponse)
async def admin_login(
    payload: AdminLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """ล็อกอินด้วย Username/Password เพื่อรับ JWT Token"""
    admin_repo = AdminRepository(db)
    log_repo = LogRepository(db)
    client_ip = request.client.host if request.client else None

    user = await admin_repo.get_user_by_username(payload.username)
    if not user or not verify_password(payload.password, user.hashed_password):
        await log_repo.create_audit_log(
            action="ADMIN_LOGIN_FAILED",
            target_resource=f"user:{payload.username}",
            details="Invalid username or password",
            ip_address=client_ip,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
        )

    token = create_access_token(subject=user.username, role=user.role)
    await log_repo.create_audit_log(
        action="ADMIN_LOGIN_SUCCESS",
        target_resource=f"user:{user.username}",
        admin_user_id=user.id,
        ip_address=client_ip,
    )
    return TokenResponse(access_token=token)


# ==========================================
# 2. จัดการ Virtual API Keys (ต้องแนบ Admin JWT)
# ==========================================
@router.post("/api-keys", response_model=ApiKeyCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_virtual_api_key(
    payload: ApiKeyCreateRequest,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """สร้าง Virtual API Key ใหม่ (แสดงคีย์เต็มเพียงครั้งเดียว)"""
    admin_repo = AdminRepository(db)
    log_repo = LogRepository(db)

    normalized_role = payload.role_name.strip().lower() if payload.role_name else None
    if normalized_role:
        role_exists = await admin_repo.get_role_by_name(normalized_role)
        if not role_exists:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Role '{normalized_role}' does not exist. Check GET /admin/roles first.",
            )

    new_key, raw_key = await admin_repo.create_api_key(
        key_name=payload.key_name,
        user_id=current_admin.id,
        role_name=normalized_role,
        rate_limit_per_minute=payload.rate_limit_per_minute,
        max_budget_usd=payload.max_budget_usd,
        expires_at=payload.expires_at,
    )

    await log_repo.create_audit_log(
        action="CREATE_API_KEY",
        target_resource=f"api_key:{new_key.id}",
        admin_user_id=current_admin.id,
        details=(
            f"Created key '{new_key.key_name}' ({new_key.key_prefix}), "
            f"role={new_key.role_name}, max_budget={new_key.max_budget_usd}"
        ),
        ip_address=request.client.host if request.client else None,
    )

    return ApiKeyCreateResponse(
        id=new_key.id,
        key_name=new_key.key_name,
        key_prefix=new_key.key_prefix,
        raw_api_key=raw_key,
        role_name=new_key.role_name,
        rate_limit_per_minute=new_key.rate_limit_per_minute,
        max_budget_usd=new_key.max_budget_usd,
        current_spend_usd=new_key.current_spend_usd,
        is_active=new_key.is_active,
        created_at=new_key.created_at,
    )


@router.get("/api-keys", response_model=list[ApiKeyItemResponse])
async def list_virtual_api_keys(
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """ดูรายการ Virtual API Keys ทั้งหมดในระบบ"""
    admin_repo = AdminRepository(db)
    return await admin_repo.list_api_keys()


@router.delete("/api-keys/{key_id}", response_model=ApiKeyItemResponse)
async def revoke_virtual_api_key(
    key_id: int,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """เพิกถอน (ปิดการใช้งาน) Virtual API Key ทันที"""
    admin_repo = AdminRepository(db)
    log_repo = LogRepository(db)

    revoked_key = await admin_repo.revoke_api_key(key_id)
    if not revoked_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API Key not found.")

    await log_repo.create_audit_log(
        action="REVOKE_API_KEY",
        target_resource=f"api_key:{revoked_key.id}",
        admin_user_id=current_admin.id,
        details=f"Revoked key '{revoked_key.key_name}' ({revoked_key.key_prefix})",
        ip_address=request.client.host if request.client else None,
    )
    return revoked_key


# ==========================================
# 3. จัดการค่าย AI ปลายทาง (Providers)
# ==========================================
@router.post("/providers", response_model=ProviderResponse, status_code=status.HTTP_201_CREATED)
async def register_provider(
    payload: ProviderCreateRequest,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """เพิ่มค่าย AI ปลายทาง (เข้ารหัส API Key จริงด้วย Fernet อัตโนมัติ)"""
    admin_repo = AdminRepository(db)
    log_repo = LogRepository(db)

    provider = await admin_repo.create_provider(
        name=payload.name,
        provider_type=payload.provider_type,
        base_url=payload.base_url,
        default_model=payload.default_model,
        raw_api_key=payload.api_key,
        priority=payload.priority,
    )

    await log_repo.create_audit_log(
        action="REGISTER_PROVIDER",
        target_resource=f"provider:{provider.name}",
        admin_user_id=current_admin.id,
        details=f"Registered {provider.provider_type} ({provider.base_url})",
        ip_address=request.client.host if request.client else None,
    )
    return provider


@router.get("/providers", response_model=list[ProviderResponse])
async def list_providers(
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """ดูรายชื่อค่าย AI ปลายทางทั้งหมด"""
    admin_repo = AdminRepository(db)
    return await admin_repo.list_providers()


# ==========================================
# 4. จัดการกลุ่มสิทธิ์และโควต้า (Role Policies)
# ==========================================
@router.get("/roles", response_model=list[RolePolicyResponse])
async def list_role_policies(
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """ดูรายการกลุ่มสิทธิ์และโควต้าเริ่มต้นทั้งหมด"""
    admin_repo = AdminRepository(db)
    return await admin_repo.list_roles()


@router.post("/roles", response_model=RolePolicyResponse, status_code=status.HTTP_201_CREATED)
async def create_role_policy(
    payload: RolePolicyCreateRequest,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """เพิ่มกลุ่มสิทธิ์และกำหนดโควต้าเริ่มต้นใหม่"""
    admin_repo = AdminRepository(db)
    log_repo = LogRepository(db)

    if await admin_repo.get_role_by_name(payload.role_name):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Role '{payload.role_name}' already exists.",
        )

    role = await admin_repo.create_role(
        role_name=payload.role_name,
        description=payload.description,
        default_rate_limit_per_minute=payload.default_rate_limit_per_minute,
        default_max_budget_usd=payload.default_max_budget_usd,
        allowed_models=payload.allowed_models,
    )

    await log_repo.create_audit_log(
        action="CREATE_ROLE_POLICY",
        target_resource=f"role:{role.role_name}",
        admin_user_id=current_admin.id,
        details=(
            f"rpm={role.default_rate_limit_per_minute}, "
            f"budget={role.default_max_budget_usd}, models={role.allowed_models}"
        ),
        ip_address=request.client.host if request.client else None,
    )
    return role


@router.put("/roles/{role_id}", response_model=RolePolicyResponse)
async def update_role_policy(
    role_id: int,
    payload: RolePolicyUpdateRequest,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """แก้ไขโควต้าหรือสิทธิ์โมเดลของกลุ่ม (มีผลทันทีกับคีย์ที่ไม่ได้ Override)"""
    admin_repo = AdminRepository(db)
    log_repo = LogRepository(db)

    role = await admin_repo.get_role_by_id(role_id)
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role policy not found.")

    updates = payload.model_dump(exclude_unset=True)
    updated_role = await admin_repo.update_role(role, updates)

    await log_repo.create_audit_log(
        action="UPDATE_ROLE_POLICY",
        target_resource=f"role:{updated_role.role_name}",
        admin_user_id=current_admin.id,
        details=f"Updated fields: {updates}",
        ip_address=request.client.host if request.client else None,
    )
    return updated_role


@router.delete("/roles/{role_id}", status_code=status.HTTP_200_OK)
async def delete_role_policy(
    role_id: int,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """ลบกลุ่มสิทธิ์ (ป้องกันการลบกลุ่ม admin หรือกลุ่มที่ยังมี API Key ผูกอยู่)"""
    admin_repo = AdminRepository(db)
    log_repo = LogRepository(db)

    role = await admin_repo.get_role_by_id(role_id)
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role policy not found.")

    if role.role_name == "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the system 'admin' role.",
        )

    in_use_count = await admin_repo.count_api_keys_by_role(role.role_name)
    if in_use_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete role '{role.role_name}' because {in_use_count} API key(s) are assigned to it.",
        )

    role_name = role.role_name
    await admin_repo.delete_role(role)

    await log_repo.create_audit_log(
        action="DELETE_ROLE_POLICY",
        target_resource=f"role:{role_name}",
        admin_user_id=current_admin.id,
        details=f"Deleted role '{role_name}'",
        ip_address=request.client.host if request.client else None,
    )
    return {"message": f"Role '{role_name}' deleted successfully."}

# ==========================================
# 5. รายงานสถิติและประวัติการใช้งาน (Analytics & Logs)
# ==========================================
@router.get("/analytics/summary", response_model=AnalyticsSummaryResponse)
async def get_analytics_summary(
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """สรุปภาพรวมการใช้งานทั้งระบบ (แยกยอดงบกลาง vs BYOK และแยกตามโมเดล/ค่าย AI)"""
    log_repo = LogRepository(db)
    return await log_repo.get_analytics_summary()


@router.get("/usage-logs", response_model=list[UsageLogItemResponse])
async def list_usage_logs(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    api_key_id: int | None = Query(default=None),
    model_name: str | None = Query(default=None),
    status_code: int | None = Query(default=None),
    is_byok: bool | None = Query(default=None),
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """ดูประวัติการเรียกใช้งาน AI ล่าสุด (รองรับการกรองและแบ่งหน้า)"""
    log_repo = LogRepository(db)
    return await log_repo.list_usage_logs(
        limit=limit,
        offset=offset,
        api_key_id=api_key_id,
        model_name=model_name,
        status_code=status_code,
        is_byok=is_byok,
    )


@router.get("/audit-logs", response_model=list[AuditLogItemResponse])
async def list_audit_logs(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    action: str | None = Query(default=None, description="เช่น CREATE_API_KEY, ADMIN_LOGIN_SUCCESS"),
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """ดูประวัติการจัดการระบบของแอดมิน (Security Audit Trail)"""
    log_repo = LogRepository(db)
    return await log_repo.list_audit_logs(limit=limit, offset=offset, action=action)