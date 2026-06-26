from fastapi import APIRouter, HTTPException
from datetime import datetime, timedelta, timezone
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

# IST timezone — used throughout to ensure all times are stored and displayed correctly
IST = timezone(timedelta(hours=5, minutes=30))

# Model cascade — Gemma is the most reliable, so it gets multiple retries
# before falling back to other models. (model, retries_on_429, wait_between_retries)
MODEL_CONFIG = [
    ("google/gemma-4-31b-it:free", 3, 5),
    ("meta-llama/llama-3.3-70b-instruct:free", 1, 0),
    ("qwen/qwen3-next-80b-a3b-instruct:free", 1, 0),
]

MAX_CASCADE_RETRIES = 2
CASCADE_RETRY_WAIT = 8


def get_booked_slots_formatted(days_ahead: int = 7) -> str:
    supabase = get_supabase()
    now = datetime.now(IST)
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
        # Convert stored UTC time to IST for display in the prompt
        start_utc = datetime.fromisoformat(apt["start_time"].replace("Z", "+00:00"))
        start_ist = start_utc.astimezone(IST)
        end_utc = datetime.fromisoformat(apt["end_time"].replace("Z", "+00:00"))
        end_ist = end_utc.astimezone(IST)
        formatted.append(
            f"- {start_ist.strftime('%Y-%m-%d %H:%M IST')} to {end_ist.strftime('%H:%M IST')}: "
            f"{apt['purpose']} (with {apt.get('name','?')}, email: {apt.get('email','?')}, id: {apt['id']})"
        )
    return "\n".join(formatted)


def is_slot_free(requested_dt: datetime, duration_minutes: int = 30) -> bool:
    supabase = get_supabase()
    # Ensure timezone-aware for comparison
    if requested_dt.tzinfo is None:
        requested_dt = requested_dt.replace(tzinfo=IST)
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
    if from_dt.tzinfo is None:
        from_dt = from_dt.replace(tzinfo=IST)
    slots = []
    candidate = from_dt.replace(second=0, microsecond=0)
    if candidate <= from_dt:
        candidate += timedelta(minutes=duration)
    attempts = 0
    while len(slots) < count and attempts < 96:
        attempts += 1
        # Work in IST for business hours logic
        candidate_ist = candidate.astimezone(IST)
        if candidate_ist.weekday() >= 5:
            days_ahead = 7 - candidate_ist.weekday()
            candidate = (candidate + timedelta(days=days_ahead)).replace(hour=9, minute=0)
            continue
        if candidate_ist.hour < 9:
            candidate = candidate.replace(hour=9, minute=0)
            continue
        if candidate_ist.hour >= 18:
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
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1:
        cleaned = cleaned[start : end + 1]
    try:
        data = json.loads(cleaned)
        suggested_slots = None
        if data.get("suggested_slots"):
            suggested_slots = []
            for s in data["suggested_slots"]:
                dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
                # If no tzinfo, treat as IST (LLM output is in IST per system prompt)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=IST)
                suggested_slots.append(dt)

        requested_datetime = None
        if data.get("requested_datetime"):
            dt = datetime.fromisoformat(
                data["requested_datetime"].replace("Z", "+00:00")
            )
            # If LLM returned a naive datetime, treat it as IST
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=IST)
            requested_datetime = dt

        duration_minutes = int(data.get("duration_minutes") or 30)

        intent = BookingIntent(
            action=data.get("action", "clarify"),
            name=data.get("name"),
            email=data.get("email"),
            purpose=data.get("purpose"),
            requested_datetime=requested_datetime,
            suggested_slots=suggested_slots,
            duration_minutes=duration_minutes,
            message=data.get("message", response_text),
        )
        return intent, True
    except (json.JSONDecodeError, ValueError, KeyError) as e:
        print(f"[chat] JSON parse failed: {e} | raw: {response_text[:200]}")
        return BookingIntent(action="clarify", message=response_text), False


async def auto_create_appointment(intent: BookingIntent):
    if not all([intent.name, intent.email, intent.purpose, intent.requested_datetime]):
        return None

    # Ensure timezone-aware; treat naive as IST
    req_dt = intent.requested_datetime
    if req_dt.tzinfo is None:
        req_dt = req_dt.replace(tzinfo=IST)

    if not is_slot_free(req_dt, 30):
        return None

    supabase = get_supabase()
    duration = intent.duration_minutes or 30
    end_time = req_dt + timedelta(minutes=duration)

    try:
        result = (
            supabase.table("appointments")
            .insert({
                "name": intent.name,
                "email": intent.email,
                "purpose": intent.purpose,
                # Store as UTC ISO string — Supabase/PostgreSQL handles TIMESTAMPTZ correctly
                "start_time": req_dt.astimezone(timezone.utc).isoformat(),
                "end_time": end_time.astimezone(timezone.utc).isoformat(),
                "duration_minutes": duration,
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
    supabase = get_supabase()
    now = datetime.now(timezone.utc)

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

    if intent.requested_datetime and appointments:
        req_dt = intent.requested_datetime
        if req_dt.tzinfo is None:
            req_dt = req_dt.replace(tzinfo=IST)
        target_date = req_dt.astimezone(IST).date()
        same_day = [
            a for a in appointments
            if datetime.fromisoformat(a["start_time"].replace("Z", "+00:00"))
               .astimezone(IST).date() == target_date
        ]
        if same_day:
            appointments = same_day

    return appointments


async def auto_cancel_appointment(intent: BookingIntent) -> dict:
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
                break

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
    last_error = None
    for attempt in range(MAX_CASCADE_RETRIES):
        if attempt > 0:
            print(f"[chat] all models busy — waiting {CASCADE_RETRY_WAIT}s (attempt {attempt + 1}/{MAX_CASCADE_RETRIES})")
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
        # Always show current time in IST so the LLM reasons in IST
        current_time_ist = datetime.now(IST).strftime("%A, %B %d %Y %H:%M IST")

        system_prompt = f"""You are AppointmentIQ, an intelligent booking assistant for a corporate office. Today is {current_time_ist}. Business hours are 9:00 AM to 6:00 PM IST, Monday to Friday.

Currently booked slots in the next 7 days (times shown in IST):
{booked_slots_str}

Your job:
- Understand the user's intent from natural language: booking, checking availability, or cancelling
- For BOOKING: extract name, email, purpose, preferred date, time, and duration in minutes. Common phrases: "1 hour" or "one hour" = 60, "30 min" = 30, "45 minutes" = 45, "2 hours" = 120. Default to 30 if not mentioned. Check availability above. If available, confirm. If not, suggest up to 3 nearest alternative free slots.
- For CANCELLING: extract the email (required) and, if mentioned, the date/time of the appointment to cancel. Set action to "cancel".
- If information is missing: ask for it politely with action "clarify"
- Keep responses concise and professional

TIMEZONE: All times are in IST (UTC+5:30). When a user says "4 PM", treat it as 4:00 PM IST.
Output requested_datetime and suggested_slots as ISO8601 strings WITH the IST offset: e.g. "2026-06-26T16:00:00+05:30"

CRITICAL — MULTI-TURN MEMORY:
- ALWAYS review the full conversation history before responding, not just the latest message.
- If earlier messages already contain the name, email, or purpose for the CURRENT booking attempt, carry those values forward into your JSON response even if the latest message doesn't repeat them.
- If the user's latest message only specifies a new date/time, treat this as continuing the SAME booking: reuse name/email/purpose already collected.
- Only ask for name, email, or purpose if they have NEVER been provided anywhere in this conversation.
- When you have all four fields (name, email, purpose, datetime) — set action to "confirm" immediately.

IMPORTANT: Always respond ONLY with this JSON object. No markdown fences, no extra text:
{{
  "action": "confirm",
  "name": "string or null",
  "email": "string or null",
  "purpose": "string or null",
  "requested_datetime": "ISO8601 string with +05:30 offset or null",
  "duration_minutes": 30,
  "suggested_slots": ["ISO8601 string with +05:30 offset"] or null,
  "message": "Your conversational reply to the user"
}}
action must be exactly one of: confirm, suggest, clarify, cancel

For cancel requests, "email" is required. "requested_datetime" is optional."""

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
                    datetime.fromisoformat(s).astimezone(IST).strftime("%b %d at %I:%M %p IST")
                    for s in alternatives
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
                    dt = datetime.fromisoformat(a["start_time"].replace("Z", "+00:00")).astimezone(IST)
                    lines.append(f"- {a['purpose']} on {dt.strftime('%b %d at %I:%M %p IST')}")
                intent.message = (
                    "I found multiple upcoming appointments for that email. "
                    "Could you tell me the date or time of the one you'd like to cancel?\n"
                    + "\n".join(lines)
                )
            elif result["status"] == "cancelled":
                apt = result["appointment"]
                dt = datetime.fromisoformat(apt["start_time"].replace("Z", "+00:00")).astimezone(IST)
                intent.message = (
                    f"Done — your appointment \"{apt['purpose']}\" on "
                    f"{dt.strftime('%A, %b %d at %I:%M %p IST')} has been cancelled."
                )
            else:
                intent.message = "Something went wrong while cancelling. Please try again or use the Appointments page directly."

        new_history = list(request.conversation_history or [])
        new_history.append(ChatMessage(role="user", content=request.message, timestamp=datetime.now(IST)))
        new_history.append(ChatMessage(role="assistant", content=intent.message, timestamp=datetime.now(IST)))

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