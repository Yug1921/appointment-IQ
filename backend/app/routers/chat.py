from fastapi import APIRouter, HTTPException
from datetime import datetime, timedelta
import httpx
import json
import asyncio

from app.database import get_supabase
from app.schemas import (
    ChatRequest,
    ChatResponse,
    AppointmentCreate,
    AppointmentResponse,
)
from app.models import ChatMessage, BookingIntent
from app.config import get_settings

router = APIRouter(prefix="/chat", tags=["chat"])

# Model cascade — all free, different providers to avoid single-provider rate limits
MODELS = [
    "google/gemma-4-31b-it:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
]


def get_booked_slots_formatted(days_ahead: int = 7) -> str:
    supabase = get_supabase()
    now = datetime.utcnow()
    future = now + timedelta(days=days_ahead)
    result = (
        supabase.table("appointments")
        .select("*")
        .gte("start_time", now.isoformat())
        .lt("start_time", future.isoformat())
        .neq("status", "cancelled")
        .execute()
    )
    appointments = result.data or []
    if not appointments:
        return "No appointments booked yet."
    formatted = []
    for apt in appointments:
        formatted.append(
            f"- {apt['start_time']} to {apt['end_time']}: {apt['purpose']} (with {apt.get('name','?')})"
        )
    return "\n".join(formatted)


def is_slot_free(requested_dt: datetime, duration_minutes: int = 30) -> bool:
    supabase = get_supabase()
    end_dt = requested_dt + timedelta(minutes=duration_minutes)
    result = (
        supabase.table("appointments")
        .select("id")
        .lt("start_time", end_dt.isoformat())
        .gt("end_time", requested_dt.isoformat())
        .neq("status", "cancelled")
        .execute()
    )
    return len(result.data or []) == 0


def get_next_free_slots(from_dt: datetime, count: int = 3, duration: int = 30) -> list:
    slots = []
    candidate = from_dt.replace(second=0, microsecond=0)
    if candidate <= from_dt:
        candidate += timedelta(minutes=duration)
    attempts = 0
    while len(slots) < count and attempts < 96:
        attempts += 1
        if candidate.weekday() >= 5:
            days_ahead = 7 - candidate.weekday()
            candidate = (candidate + timedelta(days=days_ahead)).replace(hour=9, minute=0)
            continue
        if candidate.hour < 9:
            candidate = candidate.replace(hour=9, minute=0)
            continue
        if candidate.hour >= 18:
            candidate = (candidate + timedelta(days=1)).replace(hour=9, minute=0)
            continue
        if is_slot_free(candidate, duration):
            slots.append(candidate.isoformat())
        candidate += timedelta(minutes=duration)
    return slots


def parse_booking_intent(response_text: str):
    cleaned = response_text.strip()
    if "```" in cleaned:
        parts = cleaned.split("```")
        for part in parts:
            part = part.strip()
            if part.startswith("json"):
                part = part[4:].strip()
            if part.startswith("{"):
                cleaned = part
                break
    # find first { to last }
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1:
        cleaned = cleaned[start : end + 1]
    try:
        data = json.loads(cleaned)
        suggested_slots = None
        if data.get("suggested_slots"):
            suggested_slots = [
                datetime.fromisoformat(s.replace("Z", "+00:00"))
                for s in data["suggested_slots"]
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
            message=data.get("message", response_text),
        )
        return intent, True
    except (json.JSONDecodeError, ValueError, KeyError) as e:
        print(f"[chat] JSON parse failed: {e} | raw: {response_text[:200]}")
        return BookingIntent(action="clarify", message=response_text), False


async def auto_create_appointment(intent: BookingIntent):
    if not all([intent.name, intent.email, intent.purpose, intent.requested_datetime]):
        return None
    if not is_slot_free(intent.requested_datetime, 30):
        return None
    supabase = get_supabase()
    end_time = intent.requested_datetime + timedelta(minutes=30)
    try:
        result = (
            supabase.table("appointments")
            .insert({
                "name": intent.name,
                "email": intent.email,
                "purpose": intent.purpose,
                "start_time": intent.requested_datetime.isoformat(),
                "end_time": end_time.isoformat(),
                "duration_minutes": 30,
                "status": "confirmed",
                "notes": None,
            })
            .execute()
        )
        created = result.data[0]
        return AppointmentResponse(
            id=created["id"],
            name=created["name"],
            email=created["email"],
            purpose=created["purpose"],
            start_time=datetime.fromisoformat(created["start_time"].replace("Z", "+00:00")),
            end_time=datetime.fromisoformat(created["end_time"].replace("Z", "+00:00")),
            status=created["status"],
            duration_minutes=created["duration_minutes"],
            notes=created.get("notes"),
            created_at=datetime.fromisoformat(created["created_at"].replace("Z", "+00:00")),
        )
    except Exception as e:
        print(f"[chat] auto_create failed: {e}")
        return None


async def call_openrouter(messages: list, settings) -> str:
    """Try each model in MODELS cascade using sync httpx (matches proven pattern).
    429 = skip immediately. 404 = skip. 5xx = one retry. Returns text or raises."""
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "AppointmentIQ",
    }
    last_error = None

    for model in MODELS:
        print(f"[chat] trying model: {model}")
        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": 800,
            "temperature": 0.3,
        }
        try:
            with httpx.Client(timeout=60) as client:
                response = client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    json=payload,
                    headers=headers,
                )

            if response.status_code == 429:
                print(f"[chat] 429 on {model} — skipping immediately")
                last_error = f"429 rate limit on {model}"
                continue

            if response.status_code in (400, 404):
                print(f"[chat] {response.status_code} on {model} — unavailable, skipping")
                last_error = f"{response.status_code} on {model}"
                continue

            if response.status_code >= 500:
                print(f"[chat] {response.status_code} on {model} — retrying once in 8s...")
                await asyncio.sleep(8)
                with httpx.Client(timeout=60) as client:
                    response = client.post(
                        "https://openrouter.ai/api/v1/chat/completions",
                        json=payload,
                        headers=headers,
                    )
                if response.status_code != 200:
                    last_error = f"5xx on {model}"
                    continue

            if response.status_code == 200:
                data = response.json()
                choices = data.get("choices", [])
                if not choices:
                    last_error = "Empty choices in response"
                    continue
                content = choices[0]["message"]["content"]
                if not content or not content.strip():
                    last_error = "Empty content in response"
                    continue
                actual_model = data.get("model", model)
                print(f"[chat] success via: {actual_model}")
                return content

            last_error = f"Unexpected status {response.status_code} on {model}"
            continue

        except httpx.TimeoutException:
            print(f"[chat] timeout on {model} — skipping")
            last_error = f"Timeout on {model}"
            continue
        except httpx.RequestError as e:
            print(f"[chat] network error on {model}: {e}")
            last_error = str(e)
            continue

    raise HTTPException(
        status_code=503,
        detail=f"AI service temporarily unavailable. All models failed. Last error: {last_error}. Please try again in 30 seconds.",
    )


@router.post("/message")
async def chat_message(request: ChatRequest) -> ChatResponse:
    settings = get_settings()
    try:
        booked_slots_str = get_booked_slots_formatted()
        current_time = datetime.utcnow().strftime("%A, %B %d %Y %H:%M UTC")

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

IMPORTANT: Always respond ONLY with this JSON object. No markdown fences, no extra text before or after:
{{
  "action": "confirm",
  "name": "string or null",
  "email": "string or null",
  "purpose": "string or null",
  "requested_datetime": "ISO8601 string or null",
  "suggested_slots": ["ISO8601 string"] or null,
  "message": "Your conversational reply to the user"
}}
action must be exactly one of: confirm, suggest, clarify, cancel"""

        messages = [{"role": "system", "content": system_prompt}]
        for msg in (request.conversation_history or []):
            messages.append({"role": msg.role, "content": msg.content})
        messages.append({"role": "user", "content": request.message})

        assistant_text = await call_openrouter(messages, settings)

        intent, is_valid = parse_booking_intent(assistant_text)

        created_apt = None
        if is_valid and intent.action == "confirm":
            created_apt = await auto_create_appointment(intent)
            if created_apt is None and intent.requested_datetime:
                alternatives = get_next_free_slots(intent.requested_datetime)
                intent.action = "suggest"
                intent.suggested_slots = [datetime.fromisoformat(s) for s in alternatives]
                intent.message = "That slot is no longer available. Here are the next free times: " + ", ".join(
                    datetime.fromisoformat(s).strftime("%b %d at %I:%M %p") for s in alternatives
                )

        new_history = list(request.conversation_history or [])
        new_history.append(ChatMessage(role="user", content=request.message, timestamp=datetime.utcnow()))
        new_history.append(ChatMessage(role="assistant", content=intent.message, timestamp=datetime.utcnow()))

        return ChatResponse(
            reply=intent.message,
            booking_intent=intent,
            conversation_history=new_history,
        )

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))