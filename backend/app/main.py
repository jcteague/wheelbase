from fastapi import FastAPI

from app.config import settings

app = FastAPI(title="Wheelbase API", debug=settings.debug)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
