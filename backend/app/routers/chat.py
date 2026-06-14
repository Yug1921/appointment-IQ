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

# Model cascade — Gemma is the most reliable, so it gets multiple retries
# before falling back to other models. (model, retries_on_429, wait_between_retries)
MODEL_CONFIG = [
    ("google/gemma-4-31b-it:free", 3, 5),
    ("meta-llama/llama-3.3-70b-instruct:free", 1, 0),
    ("qwen/qwen3-next-80b-a3b-instruct:free", 1, 0),
]

# How many times to retry the FULL cascade if every model returns 429
MAX_CASCADE_RETRIES = 2
CASCADE_RETRY_WAIT = 8  # seconds between full cascade passes


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
            f"- {apt['start_time']} to {apt['end_time']}: {apt['purpose']} (with {apt.get('name','?')}, email: {apt.get('email','?')}, id: {apt['id']})"
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


def find_cancellable_appointments(intent: BookingIntent) -> list:
    """Find non-cancelled, upcoming appointments matching email (and optionally datetime)."""
    supabase = get_supabase()
    now = datetime.utcnow()

    query = (
        supabase.table("appointments")
        .select("*")
        .neq("status", "cancelled")
        .gte("start_time", now.isoformat())
    )

    if intent.email:
        query = query.eq("email", intent.email)
    elif intent.name:
        query = query.eq("name", intent.name)

    result = query.order("start_time").execute()
    appointments = result.data or []

    # if a specific datetime was mentioned, narrow down to the closest match (same day)
    if intent.requested_datetime and appointments:
        target_date = intent.requested_datetime.date()
        same_day = [
            a for a in appointments
            if datetime.fromisoformat(a["start_time"].replace("Z", "+00:00")).date() == target_date
        ]
        if same_day:
            appointments = same_day

    return appointments


async def auto_cancel_appointment(intent: BookingIntent) -> dict:
    """
    Attempt to cancel an appointment based on AI-extracted intent.
    Returns a dict describing the outcome:
      {"status": "cancelled", "appointment": {...}}
      {"status": "not_found"}
      {"status": "multiple", "appointments": [...]}
      {"status": "missing_info"}
    """
    if not intent.email and not intent.name:
        return {"status": "missing_info"}

    matches = find_cancellable_appointments(intent)

    if not matches:
        return {"status": "not_found"}

    if len(matches) > 1:
        return {"status": "multiple", "appointments": matches}

    supabase = get_supabase()
    apt = matches[0]
    try:
        supabase.table("appointments").update({"status": "cancelled"}).eq("id", apt["id"]).execute()
        return {"status": "cancelled", "appointment": apt}
    except Exception as e:
        print(f"[chat] auto_cancel failed: {e}")
        return {"status": "error", "error": str(e)}


def _call_single_model(model: str, messages: list, headers: dict) -> tuple:
    """Single API call. Returns (content, status_code, error_msg)."""
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
        if response.status_code == 200:
            data = response.json()
            choices = data.get("choices", [])
            if not choices:
                return None, 200, "Empty choices in response"
            content = choices[0]["message"]["content"]
            if not content or not content.strip():
                return None, 200, "Empty content in response"
            actual_model = data.get("model", model)
            print(f"[chat] success via: {actual_model}")
            return content, 200, None
        return None, response.status_code, response.text[:200]
    except httpx.TimeoutException:
        return None, 0, f"Timeout on {model}"
    except httpx.RequestError as e:
        return None, 0, str(e)


def _try_models_once(messages: list, settings) -> tuple:
    """One pass through MODEL_CONFIG. Returns (content, last_error). content is None if all failed."""
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "AppointmentIQ",
    }
    last_error = None

    for model, retries, wait in MODEL_CONFIG:
        for attempt in range(retries):
            print(f"[chat] trying model: {model} (attempt {attempt + 1}/{retries})")
            content, status, err = _call_single_model(model, messages, headers)

            if content is not None:
                return content, None

            if status == 429:
                print(f"[chat] 429 on {model}")
                last_error = f"429 rate limit on {model}"
                if attempt < retries - 1:
                    print(f"[chat] waiting {wait}s before retrying {model}...")
                    time_module_sleep(wait)
                continue

            if status in (400, 404):
                print(f"[chat] {status} on {model} — unavailable, skipping model")
                last_error = f"{status} on {model}"
                break  # don't retry this model, move to next

            if status >= 500:
                print(f"[chat] {status} on {model} — retrying once...")
                content, status2, err2 = _call_single_model(model, messages, headers)
                if content is not None:
                    return content, None
                last_error = f"5xx on {model}"
                break

            last_error = err or f"status {status} on {model}"
            break

    return None, last_error


def time_module_sleep(seconds):
    import time
    time.sleep(seconds)


async def call_openrouter(messages: list, settings) -> str:
    """
    Run the model cascade. If every model in a pass returns 429 (all free tiers
    exhausted momentarily), wait and retry the whole cascade up to
    MAX_CASCADE_RETRIES times before giving up.
    """
    last_error = None

    for attempt in range(MAX_CASCADE_RETRIES):
        if attempt > 0:
            print(f"[chat] all models busy — waiting {CASCADE_RETRY_WAIT}s before retrying cascade (attempt {attempt + 1}/{MAX_CASCADE_RETRIES})")
            await asyncio.sleep(CASCADE_RETRY_WAIT)

        content, last_error = _try_models_once(messages, settings)
        if content is not None:
            return content

    raise HTTPException(
        status_code=503,
        detail=f"AI service is busy right now. Last error: {last_error}. Please try again in a moment.",
    )


@router.post("/message")
async def chat_message(request: ChatRequest) -> ChatResponse:
    settings = get_settings()
    try:
        booked_slots_str = get_booked_slots_formatted()
        current_time = datetime.utcnow().strftime("%A, %B %d %Y %H:%M UTC")

        system_prompt = f"""You are AppointmentIQ, an intelligent booking assistant for a corporate office. Today is {current_time}. Business hours are 9:00 AM to 6:00 PM, Monday to Friday.

Currently booked slots in the next 7 days (each shows time range, purpose, person, email, and id):
{booked_slots_str}

Your job:
- Understand the user's intent from natural language: booking, checking availability, or cancelling
- For BOOKING: extract name, email, purpose, preferred date and time. Check availability above. If available, confirm. If not, suggest up to 3 nearest alternative free slots.
- For CANCELLING: extract the email (required) and, if mentioned, the date/time of the appointment to cancel. Set action to "cancel".
- If information is missing: ask for it politely with action "clarify"
- Keep responses concise and professional

CRITICAL — MULTI-TURN MEMORY:
- ALWAYS review the full conversation history before responding, not just the latest message.
- If earlier messages already contain the name, email, or purpose for the CURRENT booking attempt, carry those values forward into your JSON response even if the latest message doesn't repeat them.
- If the user's latest message only specifies a new date/time (e.g. "Book me Jun 16 at 2:30 PM" after you suggested alternatives), treat this as continuing the SAME booking: reuse the name/email/purpose already collected in this conversation and combine them with the new date/time.
- Only ask for name, email, or purpose if they have NEVER been provided anywhere in this conversation for the current booking.
- When you have all four fields (name, email, purpose, datetime) — from this message OR earlier ones combined — set action to "confirm" immediately.

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
action must be exactly one of: confirm, suggest, clarify, cancel

For cancel requests, "email" is required to identify the appointment. "requested_datetime" is optional — include it only if the user specified which date/time appointment to cancel."""

        messages = [{"role": "system", "content": system_prompt}]
        for msg in (request.conversation_history or []):
            messages.append({"role": msg.role, "content": msg.content})
        messages.append({"role": "user", "content": request.message})

        assistant_text = await call_openrouter(messages, settings)

        intent, is_valid = parse_booking_intent(assistant_text)

        if is_valid and intent.action == "confirm":
            created_apt = await auto_create_appointment(intent)
            if created_apt is None and intent.requested_datetime:
                alternatives = get_next_free_slots(intent.requested_datetime)
                intent.action = "suggest"
                intent.suggested_slots = [datetime.fromisoformat(s) for s in alternatives]
                intent.message = "That slot is no longer available. Here are the next free times: " + ", ".join(
                    datetime.fromisoformat(s).strftime("%b %d at %I:%M %p") for s in alternatives
                )

        elif is_valid and intent.action == "cancel":
            result = await auto_cancel_appointment(intent)

            if result["status"] == "missing_info":
                intent.message = (
                    "To cancel an appointment, I'll need the email address it was booked under. "
                    "Could you share that?"
                )

            elif result["status"] == "not_found":
                who = intent.email or intent.name or "that person"
                intent.message = f"I couldn't find an upcoming appointment for {who}. Could you double check the email or date?"

            elif result["status"] == "multiple":
                apts = result["appointments"]
                lines = []
                for a in apts:
                    dt = datetime.fromisoformat(a["start_time"].replace("Z", "+00:00"))
                    lines.append(f"- {a['purpose']} on {dt.strftime('%b %d at %I:%M %p')}")
                intent.message = (
                    "I found multiple upcoming appointments for that email. "
                    "Could you tell me the date or time of the one you'd like to cancel?\n"
                    + "\n".join(lines)
                )

            elif result["status"] == "cancelled":
                apt = result["appointment"]
                dt = datetime.fromisoformat(apt["start_time"].replace("Z", "+00:00"))
                intent.message = (
                    f"Done — your appointment \"{apt['purpose']}\" on "
                    f"{dt.strftime('%A, %b %d at %I:%M %p')} has been cancelled."
                )

            else:  # error
                intent.message = "Something went wrong while cancelling. Please try again or use the Appointments page directly."

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