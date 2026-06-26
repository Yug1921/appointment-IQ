from enum import Enum
from pydantic import BaseModel
from datetime import datetime
from uuid import UUID
from typing import Optional, List


class AppointmentStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class SlotDurationType(str, Enum):
    FIXED = "fixed"
    CUSTOM = "custom"


class Appointment(BaseModel):
    id: UUID
    name: str
    email: str
    purpose: str
    start_time: datetime
    end_time: datetime
    status: AppointmentStatus
    duration_minutes: int
    notes: Optional[str] = None
    created_at: datetime


class BlockedSlot(BaseModel):
    id: UUID
    start_time: datetime
    end_time: datetime
    reason: Optional[str] = None
    created_at: datetime


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str
    timestamp: datetime


class BookingIntent(BaseModel):
    action: str  # "confirm", "suggest", "clarify", "cancel"
    name: Optional[str] = None
    email: Optional[str] = None
    purpose: Optional[str] = None
    requested_datetime: Optional[datetime] = None
    suggested_slots: Optional[List[datetime]] = None
    duration_minutes: int = 30  # extracted from user message, default 30
    message: str