from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.endpoints import admin_endpoint, chat_endpoint
from app.repositories.admin_repo import AdminRepository
from app.repositories.database import AsyncSessionLocal, Base, engine
import app.repositories.models  # นำเข้าเพื่อให้ Base รู้จักตารางทั้งหมด


@asynccontextmanager
async def lifespan(app: FastAPI):
    """ทำงานอัตโนมัติตอนเริ่มเปิดเซิร์ฟเวอร์ และตอนปิดเซิร์ฟเวอร์"""
    # 1. สร้างตารางทั้งหมดใน PostgreSQL (ถ้ายังไม่มี)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("[Database] Verified and initialized all PostgreSQL tables.")

    # 2. สร้างบัญชีแอดมินเริ่มต้นอัตโนมัติ (Auto-Seed)
    async with AsyncSessionLocal() as session:
        admin_repo = AdminRepository(session)
        await admin_repo.seed_default_admin()
        await admin_repo.seed_default_roles()

    yield

    # 3. ปิดท่อเชื่อมต่อฐานข้อมูลตอนปิดเซิร์ฟเวอร์
    await engine.dispose()
    print("[Database] Disconnected from PostgreSQL.")


app = FastAPI(
    title=settings.APP_NAME,
    description="Modular AI Gateway รองรับมาตรฐาน OpenAI API, Mock AI Simulator และระบบจัดการสิทธิ์",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # React / Vite
        "http://localhost:3000",  # Next.js
        "http://127.0.0.1:5500",  # VS Code Live Server (HTML ธรรมดา)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_endpoint.router)
app.include_router(admin_endpoint.router)


@app.get("/health", tags=["System"])
async def health_check():
    """ตรวจสอบสถานะความพร้อมของเซิร์ฟเวอร์ (ใช้สำหรับ Docker Healthcheck)"""
    return {
        "status": "healthy",
        "app_name": settings.APP_NAME,
        "environment": settings.APP_ENV,
    }