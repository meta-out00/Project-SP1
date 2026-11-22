from sqlalchemy import case, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.models import ApiKey, AuditLog, UsageLog


class LogRepository:
    """จัดการการบันทึกและดึงข้อมูลสถิติจากตาราง usage_logs และ audit_logs"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_usage_logs(self, limit: int = 100) -> list[UsageLog]:
        result = await self.db.execute(
            select(UsageLog)
            .order_by(UsageLog.created_at.desc(), UsageLog.id.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_usage_summary(self) -> dict:
        result = await self.db.execute(
            select(
                func.count(UsageLog.id),
                func.count(UsageLog.id).filter(UsageLog.status_code.between(200, 399)),
                func.count(UsageLog.id).filter(UsageLog.status_code >= 400),
                func.coalesce(func.sum(UsageLog.total_tokens), 0),
                func.coalesce(func.sum(UsageLog.cost_usd), 0.0),
                func.coalesce(func.avg(UsageLog.latency_ms), 0.0),
            )
        )
        row = result.one()
        return {
            "total_requests": int(row[0] or 0),
            "successful_requests": int(row[1] or 0),
            "failed_requests": int(row[2] or 0),
            "total_tokens": int(row[3] or 0),
            "total_cost_usd": float(row[4] or 0.0),
            "average_latency_ms": float(row[5] or 0.0),
        }

    async def list_audit_logs(self, limit: int = 100) -> list[AuditLog]:
        result = await self.db.execute(
            select(AuditLog)
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def create_usage_log(
        self,
        request_id: str,
        provider_name: str,
        model_name: str,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        total_tokens: int = 0,
        latency_ms: float = 0.0,
        cost_usd: float = 0.0,
        is_byok: bool = False,
        status_code: int = 200,
        error_message: str | None = None,
        api_key_id: int | None = None,
    ) -> UsageLog:
        """บันทึกประวัติการเรียกใช้งาน AI ลงตาราง usage_logs"""
        log_entry = UsageLog(
            request_id=request_id,
            api_key_id=api_key_id,
            provider_name=provider_name,
            model_name=model_name,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            cost_usd=cost_usd,
            is_byok=is_byok,
            latency_ms=latency_ms,
            status_code=status_code,
            error_message=error_message,
        )
        self.db.add(log_entry)
        await self.db.commit()
        await self.db.refresh(log_entry)
        return log_entry

    async def increment_api_key_spend(self, api_key_id: int, cost_usd: float) -> None:
        """บวกยอดค่าใช้จ่ายสะสมเข้า api_keys แบบ Atomic ป้องกันตัวเลขเพี้ยนเวลายิงพร้อมกัน"""
        if cost_usd <= 0:
            return
        stmt = (
            update(ApiKey)
            .where(ApiKey.id == api_key_id)
            .values(current_spend_usd=ApiKey.current_spend_usd + cost_usd)
        )
        await self.db.execute(stmt)
        await self.db.commit()

    async def create_audit_log(
        self,
        action: str,
        target_resource: str,
        admin_user_id: int | None = None,
        details: str | None = None,
        ip_address: str | None = None,
    ) -> AuditLog:
        """บันทึกประวัติการกระทำของแอดมินลงตาราง audit_logs"""
        audit_entry = AuditLog(
            admin_user_id=admin_user_id,
            action=action,
            target_resource=target_resource,
            details=details,
            ip_address=ip_address,
        )
        self.db.add(audit_entry)
        await self.db.commit()
        await self.db.refresh(audit_entry)
        return audit_entry

    async def get_analytics_summary(self) -> dict:
        """คำนวณสถิติภาพรวมทั้งหมด แยกยอดงบกลาง (Managed) กับคีย์ส่วนตัว (BYOK)"""
        summary_stmt = select(
            func.count(UsageLog.id).label("total_requests"),
            func.coalesce(
                func.sum(case((UsageLog.status_code == 200, 1), else_=0)), 0
            ).label("success_requests"),
            func.coalesce(
                func.sum(case((UsageLog.status_code != 200, 1), else_=0)), 0
            ).label("failed_requests"),
            func.coalesce(func.sum(UsageLog.prompt_tokens), 0).label("total_prompt_tokens"),
            func.coalesce(func.sum(UsageLog.completion_tokens), 0).label("total_completion_tokens"),
            func.coalesce(func.sum(UsageLog.total_tokens), 0).label("total_tokens"),
            func.coalesce(
                func.sum(case((UsageLog.is_byok.is_(False), UsageLog.cost_usd), else_=0.0)), 0.0
            ).label("system_cost_usd"),
            func.coalesce(
                func.sum(case((UsageLog.is_byok.is_(True), UsageLog.cost_usd), else_=0.0)), 0.0
            ).label("byok_cost_usd"),
            func.coalesce(func.avg(UsageLog.latency_ms), 0.0).label("avg_latency_ms"),
        )
        row = (await self.db.execute(summary_stmt)).one()

        model_stmt = (
            select(
                UsageLog.model_name.label("name"),
                func.count(UsageLog.id).label("requests"),
                func.coalesce(func.sum(UsageLog.total_tokens), 0).label("total_tokens"),
                func.coalesce(func.sum(UsageLog.cost_usd), 0.0).label("cost_usd"),
            )
            .group_by(UsageLog.model_name)
            .order_by(func.count(UsageLog.id).desc())
        )
        by_model = [
            {
                "name": r.name,
                "requests": int(r.requests),
                "total_tokens": int(r.total_tokens),
                "cost_usd": round(float(r.cost_usd), 6),
            }
            for r in (await self.db.execute(model_stmt)).all()
        ]

        provider_stmt = (
            select(
                UsageLog.provider_name.label("name"),
                func.count(UsageLog.id).label("requests"),
                func.coalesce(func.sum(UsageLog.total_tokens), 0).label("total_tokens"),
                func.coalesce(func.sum(UsageLog.cost_usd), 0.0).label("cost_usd"),
            )
            .group_by(UsageLog.provider_name)
            .order_by(func.count(UsageLog.id).desc())
        )
        by_provider = [
            {
                "name": r.name,
                "requests": int(r.requests),
                "total_tokens": int(r.total_tokens),
                "cost_usd": round(float(r.cost_usd), 6),
            }
            for r in (await self.db.execute(provider_stmt)).all()
        ]

        system_cost = round(float(row.system_cost_usd), 6)
        byok_cost = round(float(row.byok_cost_usd), 6)

        return {
            "total_requests": int(row.total_requests),
            "success_requests": int(row.success_requests),
            "failed_requests": int(row.failed_requests),
            "total_prompt_tokens": int(row.total_prompt_tokens),
            "total_completion_tokens": int(row.total_completion_tokens),
            "total_tokens": int(row.total_tokens),
            "system_cost_usd": system_cost,
            "byok_cost_usd": byok_cost,
            "total_cost_usd": round(system_cost + byok_cost, 6),
            "avg_latency_ms": round(float(row.avg_latency_ms), 2),
            "by_model": by_model,
            "by_provider": by_provider,
        }

    async def list_usage_logs(
        self,
        limit: int = 50,
        offset: int = 0,
        api_key_id: int | None = None,
        model_name: str | None = None,
        status_code: int | None = None,
        is_byok: bool | None = None,
    ) -> list[UsageLog]:
        """ดึงประวัติการเรียกใช้งาน AI ล่าสุด พร้อมตัวกรอง"""
        stmt = select(UsageLog).order_by(UsageLog.id.desc())
        if api_key_id is not None:
            stmt = stmt.where(UsageLog.api_key_id == api_key_id)
        if model_name:
            stmt = stmt.where(UsageLog.model_name == model_name.strip())
        if status_code is not None:
            stmt = stmt.where(UsageLog.status_code == status_code)
        if is_byok is not None:
            stmt = stmt.where(UsageLog.is_byok.is_(is_byok))

        stmt = stmt.limit(limit).offset(offset)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_audit_logs(
        self,
        limit: int = 50,
        offset: int = 0,
        action: str | None = None,
    ) -> list[AuditLog]:
        """ดึงประวัติการกระทำของแอดมินล่าสุด"""
        stmt = select(AuditLog).order_by(AuditLog.id.desc())
        if action:
            stmt = stmt.where(AuditLog.action == action.strip().upper())

        stmt = stmt.limit(limit).offset(offset)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_usage_stats_by_api_key(self, api_key_id: int) -> dict:
        """สรุปยอดการใช้งานสะสมเฉพาะ API Key เดียว (ใช้กับ GET /v1/usage/me)"""
        stmt = select(
            func.count(UsageLog.id).label("total_requests"),
            func.coalesce(func.sum(UsageLog.total_tokens), 0).label("total_tokens"),
            func.coalesce(
                func.sum(case((UsageLog.is_byok.is_(True), 1), else_=0)), 0
            ).label("byok_requests"),
            func.coalesce(
                func.sum(case((UsageLog.is_byok.is_(True), UsageLog.cost_usd), else_=0.0)), 0.0
            ).label("byok_estimated_cost_usd"),
        ).where(UsageLog.api_key_id == api_key_id)

        row = (await self.db.execute(stmt)).one()
        return {
            "total_requests": int(row.total_requests),
            "total_tokens": int(row.total_tokens),
            "byok_requests": int(row.byok_requests),
            "byok_estimated_cost_usd": round(float(row.byok_estimated_cost_usd), 6),
        }