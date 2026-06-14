from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import appointments, slots, chat

settings = get_settings()

app = FastAPI(
    title="AppointmentIQ API",
    description="AI-Powered Smart Appointment Booking System",
    version="1.0.0",
)

print("FRONTEND_URL =", settings.frontend_url)
# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(appointments.router)
app.include_router(slots.router)
app.include_router(chat.router)


@app.get("/")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "app": "AppointmentIQ",
        "version": "1.0.0",
    }


@app.on_event("startup")
async def startup_event():
    """Log startup message."""
    print("AppointmentIQ backend running")
