from fastapi import APIRouter, HTTPException
from datetime import datetime, timedelta
import httpx
import json

from app.database import get_supabase
from app.schemas import (
    ChatRequest,
    ChatResponse,
)
from app.models import ChatMessage, BookingIntent
from app.config import get_settings
from app.routers.slots import get_available_slots_for_date
from app.routers.appointments import send_confirmation_email
from app.schemas import AppointmentCreate, AppointmentResponse

router = APIRouter(prefix="/chat", tags=["chat"])


def get_booked_slots_formatted(days_ahead: int = 7) -> str:
    """Get formatted booked slots for the next N days."""
    supabase = get_supabase()
    
    now = datetime.utcnow()
    future = now + timedelta(days=days_ahead)
    
    result = supabase.table("appointments").select("*").gte(
        "start_time", now.isoformat()
    ).lt(
        "start_time", future.isoformat()
    ).neq("status", "cancelled").execute()
    
    appointments = result.data or []
    
    if not appointments:
        return "No appointments booked yet."
    
    formatted = []
    for apt in appointments:
        start = apt["start_time"]
        end = apt["end_time"]
        purpose = apt["purpose"]
        formatted.append(f"- {start} to {end}: {purpose}")
    
    return "\n".join(formatted)


def parse_booking_intent(response_text: str) -> tuple[BookingIntent, bool]:
    """
    Parse the AI response and extract booking intent.
    Returns (BookingIntent, is_valid_json)
    """
    try:
        data = json.loads(response_text)
        
        suggested_slots = None
        if data.get("suggested_slots"):
            suggested_slots = [
                datetime.fromisoformat(slot.replace("Z", "+00:00"))
                for slot in data["suggested_slots"]
            ]
        
        requested_datetime = None
        if data.get("requested_datetime"):
            requested_datetime = datetime.fromisoformat(
                data["requested_datetime"].replace("Z", "+00:00")
            )
        
        intent = BookingIntent(
            action=data.get("action", "clarify"),
            name=data.get("name"),
            email=data.get("email"),
            purpose=data.get("purpose"),
            requested_datetime=requested_datetime,
            suggested_slots=suggested_slots,
            message=data.get("message", ""),
        )
        
        return intent, True
    except (json.JSONDecodeError, ValueError, KeyError) as e:
        # Fallback: extract message if JSON is malformed
        intent = BookingIntent(
            action="clarify",
            message=response_text,
        )
        return intent, False


async def auto_create_appointment(intent: BookingIntent) -> AppointmentResponse:
    """Automatically create an appointment if all required fields are present."""
    if not all([intent.name, intent.email, intent.purpose, intent.requested_datetime]):
        return None
    
    # Check if slot is available
    available_slots, _ = get_available_slots_for_date(
        intent.requested_datetime.date(), 30
    )
    
    slot_available = False
    for slot in available_slots:
        if slot.start_time == intent.requested_datetime:
            slot_available = True
            break
    
    if not slot_available:
        return None
    
    # Create appointment
    supabase = get_supabase()
    
    end_time = intent.requested_datetime + timedelta(minutes=30)
    
    result = supabase.table("appointments").insert({
        "name": intent.name,
        "email": intent.email,
        "purpose": intent.purpose,
        "start_time": intent.requested_datetime.isoformat(),
        "end_time": end_time.isoformat(),
        "duration_minutes": 30,
        "status": "confirmed",
        "notes": None,
    }).execute()
    
    created_apt = result.data[0]
    apt_response = AppointmentResponse(
        id=created_apt["id"],
        name=created_apt["name"],
        email=created_apt["email"],
        purpose=created_apt["purpose"],
        start_time=datetime.fromisoformat(created_apt["start_time"].replace("Z", "+00:00")),
        end_time=datetime.fromisoformat(created_apt["end_time"].replace("Z", "+00:00")),
        status=created_apt["status"],
        duration_minutes=created_apt["duration_minutes"],
        notes=created_apt.get("notes"),
        created_at=datetime.fromisoformat(created_apt["created_at"].replace("Z", "+00:00")),
    )
    
    # Send confirmation email
    send_confirmation_email(apt_response)
    
    return apt_response


@router.post("/message")
async def chat_message(request: ChatRequest) -> ChatResponse:
    """AI booking assistant endpoint."""
    settings = get_settings()
    
    try:
        # Get booked slots for context
        booked_slots_str = get_booked_slots_formatted()
        current_time = datetime.utcnow().isoformat()
        
        # Build system prompt
        system_prompt = f"""You are AppointmentIQ, an intelligent booking assistant for a corporate office. Today is {current_time}. Business hours are 9:00 AM to 6:00 PM, Monday to Friday.

Currently booked slots in the next 7 days:
{booked_slots_str}

Your job:
- Understand the user's booking intent from natural language
- Extract: name, email, purpose, preferred date and time
- Check if the requested slot is available based on the booked slots above
- If available: confirm the booking intent
- If not available: suggest up to 3 nearest alternative free slots
- If information is missing: ask for it politely
- Keep responses concise and professional

IMPORTANT: Always respond in this exact JSON format and nothing else:
{{
  "action": "confirm" | "suggest" | "clarify" | "cancel",
  "name": "string or null",
  "email": "string or null", 
  "purpose": "string or null",
  "requested_datetime": "ISO8601 string or null",
  "suggested_slots": ["ISO8601 string", ...] or null,
  "message": "Your conversational reply to the user"
}}"""
        
        # Build messages
        messages = [
            {
                "role": "system",
                "content": system_prompt,
            }
        ]
        
        # Add conversation history
        for msg in request.conversation_history:
            messages.append({
                "role": msg.role,
                "content": msg.content,
            })
        
        # Add new user message
        messages.append({
            "role": "user",
            "content": request.message,
        })
        
        # Call OpenRouter API
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "HTTP-Referer": "http://localhost:3000",
                    "X-Title": "AppointmentIQ",
                },
                json={
                    "model": "meta-llama/llama-3.3-70b-instruct:free",
                    "messages": messages,
                    "max_tokens": 800,
                    "temperature": 0.3,
                },
                timeout=30.0,
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"OpenRouter API error: {response.text}",
                )
            
            api_response = response.json()
            assistant_message = api_response["choices"][0]["message"]["content"]
        
        # Parse intent
        intent, is_valid = parse_booking_intent(assistant_message)
        
        # If valid JSON and action is "confirm", auto-create appointment
        if is_valid and intent.action == "confirm":
            apt = await auto_create_appointment(intent)
        
        # Build conversation history
        new_history = list(request.conversation_history)
        new_history.append(
            ChatMessage(
                role="user",
                content=request.message,
                timestamp=datetime.utcnow(),
            )
        )
        new_history.append(
            ChatMessage(
                role="assistant",
                content=intent.message,
                timestamp=datetime.utcnow(),
            )
        )
        
        return ChatResponse(
            reply=intent.message,
            booking_intent=intent,
            conversation_history=new_history,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
