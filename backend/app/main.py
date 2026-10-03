from fastapi import FastAPI

app = FastAPI(
    title="Enterprise Multi-Agent AI Assistant",
    version="0.1.0",
    description="Backend API for the multi-agent project-management assistant.",
)


@app.get("/api/health", tags=["system"])
def health_check() -> dict:
    """Simple liveness check used by us now, and by Docker/CI later."""
    return {"status": "ok", "service": "backend", "version": app.version}