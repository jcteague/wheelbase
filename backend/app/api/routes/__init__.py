from fastapi import APIRouter

from app.api.routes.positions import router as positions_router

router = APIRouter()
router.include_router(positions_router)
