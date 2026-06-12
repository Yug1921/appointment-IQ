from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, date, timedelta
from typing import List, Tuple

from app.database import get_supabase
from app.schemas import (
    SlotCheckRequest,
    AvailableSlot,
    SlotsResponse,
    AppointmentResponse,
)

router = APIRouter(prefix="/slots", tags=["slots"])

BUSINESS_START_HOUR = 9
BUSINESS_END_HOUR = 18  # 6 PM


def get_available_slots_for_date(
    target_date: date, duration_minutes: int
) -> Tuple[List[AvailableSlot], List[AppointmentResponse]]:
    """
    Generate available slots for a given date and duration.
    Returns (available_slots, booked_appointments)
    """
    supabase = get_supabase()
    
    # Business hours: 9 AM to 6 PM
    day_start = datetime.combine(target_date, datetime.min.time()).replace(
        hour=BUSINESS_START_HOUR, minute=0, second=0
    )
    day_end = datetime.combine(target_date, datetime.min.time()).replace(
        hour=BUSINESS_END_HOUR, minute=0, second=0
    )
    
    # Query booked appointments for the date (excluding cancelled)
    booked_result = supabase.table("appointments").select("*").gte(
        "start_time", day_start.isoformat()
    ).lt(
        "start_time", day_end.isoformat()
    ).neq("status", "cancelled").execute()
    
    booked_appointments = booked_result.data or []
    
    # Query blocked slots for the date
    blocked_result = supabase.table("blocked_slots").select("*").gte(
        "start_time", day_start.isoformat()
    ).lt(
        "start_time", day_end.isoformat()
    ).execute()
    
    blocked_slots = blocked_result.data or []
    
    # Generate all possible slots
    available_slots = []
    current_time = day_start
    
    while current_time + timedelta(minutes=duration_minutes) <= day_end:
        slot_end = current_time + timedelta(minutes=duration_minutes)
        is_available = True
        
        # Check for overlap with booked appointments
        for apt in booked_appointments:
            apt_start = datetime.fromisoformat(apt["start_time"].replace("Z", "+00:00"))
            apt_end = datetime.fromisoformat(apt["end_time"].replace("Z", "+00:00"))
            
            # Check overlap
            if current_time < apt_end and slot_end > apt_start:
                is_available = False
                break
        
        # Check for overlap with blocked slots
        if is_available:
            for blocked in blocked_slots:
                blocked_start = datetime.fromisoformat(blocked["start_time"].replace("Z", "+00:00"))
                blocked_end = datetime.fromisoformat(blocked["end_time"].replace("Z", "+00:00"))
                
                # Check overlap
                if current_time < blocked_end and slot_end > blocked_start:
                    is_available = False
                    break
        
        if is_available:
            available_slots.append(
                AvailableSlot(
                    start_time=current_time,
                    end_time=slot_end,
                    duration_minutes=duration_minutes,
                )
            )
        
        current_time += timedelta(minutes=30)  # Increment by 30 min to check every 30 min slot
    
    # Convert booked appointments to response format
    booked_responses = []
    for apt in booked_appointments:
        booked_responses.append(
            AppointmentResponse(
                id=apt["id"],
                name=apt["name"],
                email=apt["email"],
                purpose=apt["purpose"],
                start_time=datetime.fromisoformat(apt["start_time"].replace("Z", "+00:00")),
                end_time=datetime.fromisoformat(apt["end_time"].replace("Z", "+00:00")),
                status=apt["status"],
                duration_minutes=apt["duration_minutes"],
                notes=apt.get("notes"),
                created_at=datetime.fromisoformat(apt["created_at"].replace("Z", "+00:00")),
            )
        )
    
    return available_slots, booked_responses


@router.get("/available")
async def get_available_slots(
    date: date = Query(..., description="Date to check availability"),
    duration_minutes: int = Query(30, description="Duration in minutes"),
) -> SlotsResponse:
    """Get available slots for a given date and duration."""
    try:
        available_slots, booked_slots = get_available_slots_for_date(date, duration_minutes)
        
        return SlotsResponse(
            date=date,
            available_slots=available_slots,
            booked_slots=booked_slots,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/block")
async def block_slot(
    start_time: datetime = Query(...),
    end_time: datetime = Query(...),
    reason: str = Query(None),
) -> dict:
    """Block a time slot (e.g., for lunch, meetings, etc.)."""
    supabase = get_supabase()
    
    try:
        result = supabase.table("blocked_slots").insert({
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "reason": reason,
        }).execute()
        
        blocked = result.data[0]
        return {
            "id": blocked["id"],
            "start_time": blocked["start_time"],
            "end_time": blocked["end_time"],
            "reason": blocked.get("reason"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/block/{id}")
async def delete_blocked_slot(id: str) -> dict:
    """Delete a blocked slot."""
    supabase = get_supabase()
    
    try:
        result = supabase.table("blocked_slots").delete().eq("id", id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Blocked slot not found")
        
        return {"message": "Blocked slot deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
