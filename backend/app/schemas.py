from pydantic import BaseModel
from datetime import datetime, date
from typing import Optional, List
from app.models import ChatMessage, BookingIntent


class AppointmentCreate(BaseModel):
    name: str
    email: str
    purpose: str
    start_time: datetime
    end_time: datetime
    duration_minutes: int = 30
    notes: Optional[str] = None


class AppointmentUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None


class AppointmentResponse(BaseModel):
    id: str
    name: str
    email: str
    purpose: str
    start_time: datetime
    end_time: datetime
    status: str
    duration_minutes: int
    notes: Optional[str] = None
    created_at: datetime


class ChatRequest(BaseModel):
    message: str
    conversation_history: List[ChatMessage] = []


class ChatResponse(BaseModel):
    reply: str
    booking_intent: Optional[BookingIntent] = None
    conversation_history: List[ChatMessage]


class SlotCheckRequest(BaseModel):
    date: date
    duration_minutes: int = 30


class AvailableSlot(BaseModel):
    start_time: datetime
    end_time: datetime
    duration_minutes: int


class SlotsResponse(BaseModel):
    date: date
    available_slots: List[AvailableSlot]
    booked_slots: List[AppointmentResponse]
