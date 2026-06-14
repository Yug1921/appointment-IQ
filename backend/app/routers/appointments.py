from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, date
from typing import List, Optional
import asyncio
import httpx

from app.database import get_supabase
from app.schemas import (
    AppointmentCreate,
    AppointmentUpdate,
    AppointmentResponse,
)
from app.config import get_settings

router = APIRouter(prefix="/appointments", tags=["appointments"])


def send_confirmation_email(appointment: AppointmentResponse):
    """Send confirmation email via Resend API (fire and forget)."""
    try:
        settings = get_settings()
        html_content = f"""
        <h2>Appointment Confirmation</h2>
        <p>Hi {appointment.name},</p>
        <p>Your appointment has been confirmed!</p>
        <ul>
            <li><strong>Date & Time:</strong> {appointment.start_time.strftime('%Y-%m-%d %H:%M')} - {appointment.end_time.strftime('%H:%M')}</li>
            <li><strong>Purpose:</strong> {appointment.purpose}</li>
            <li><strong>Duration:</strong> {appointment.duration_minutes} minutes</li>
        </ul>
        {f'<p><strong>Notes:</strong> {appointment.notes}</p>' if appointment.notes else ''}
        <p>Thank you for booking with AppointmentIQ!</p>
        """
        
        httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={
                "from": "noreply@appointmentiq.com",
                "to": appointment.email,
                "subject": f"Appointment Confirmation - {appointment.purpose}",
                "html": html_content,
            },
            timeout=5,
        )
    except Exception as e:
        print(f"Email sending failed (non-critical): {str(e)}")


def _to_response(apt: dict) -> AppointmentResponse:
    """Convert a raw Supabase row into an AppointmentResponse."""
    return AppointmentResponse(
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


@router.get("/")
async def list_appointments(
    date_filter: Optional[date] = Query(None, alias="date"),
    status: Optional[str] = Query(None),
) -> List[AppointmentResponse]:
    """List all appointments with optional filtering by date and status."""
    supabase = get_supabase()
    
    try:
        query = supabase.table("appointments").select("*")
        
        if date_filter:
            # Filter by date (appointments on that date)
            query = query.gte("start_time", f"{date_filter}T00:00:00").lt(
                "start_time", f"{date_filter}T23:59:59"
            )
        
        if status:
            query = query.eq("status", status)
        
        response = query.execute()
        appointments = response.data
        
        return [_to_response(apt) for apt in appointments]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
async def create_appointment(appointment: AppointmentCreate) -> AppointmentResponse:
    """Create a new appointment after checking for conflicts."""
    supabase = get_supabase()
    
    try:
        # Check for overlapping appointments
        overlaps = supabase.table("appointments").select("*").gte(
            "end_time", appointment.start_time.isoformat()
        ).lte(
            "start_time", appointment.end_time.isoformat()
        ).neq("status", "cancelled").execute()
        
        if overlaps.data:
            raise HTTPException(
                status_code=409,
                detail="Time slot already booked.",
            )
        
        # Insert appointment
        result = supabase.table("appointments").insert({
            "name": appointment.name,
            "email": appointment.email,
            "purpose": appointment.purpose,
            "start_time": appointment.start_time.isoformat(),
            "end_time": appointment.end_time.isoformat(),
            "duration_minutes": appointment.duration_minutes,
            "status": "confirmed",
            "notes": appointment.notes,
        }).execute()
        
        created_appointment = result.data[0]
        apt_response = _to_response(created_appointment)
        
        # Send confirmation email (fire and forget)
        asyncio.create_task(
            asyncio.to_thread(send_confirmation_email, apt_response)
        )
        
        return apt_response
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{id}")
async def get_appointment(id: str) -> AppointmentResponse:
    """Get a single appointment by ID."""
    supabase = get_supabase()
    
    try:
        result = supabase.table("appointments").select("*").eq("id", id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Appointment not found")
        
        return _to_response(result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{id}")
async def update_appointment(id: str, update: AppointmentUpdate) -> AppointmentResponse:
    """Update an appointment."""
    supabase = get_supabase()
    
    try:
        update_data = {}
        if update.status is not None:
            update_data["status"] = update.status
        if update.notes is not None:
            update_data["notes"] = update.notes
        if update.start_time is not None:
            update_data["start_time"] = update.start_time.isoformat()
        if update.end_time is not None:
            update_data["end_time"] = update.end_time.isoformat()
        
        result = supabase.table("appointments").update(update_data).eq("id", id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Appointment not found")
        
        return _to_response(result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{id}/restore")
async def restore_appointment(id: str) -> AppointmentResponse:
    """
    Restore a cancelled appointment back to 'confirmed'.
    Checks that the original slot hasn't been taken by another
    appointment in the meantime — returns 409 if it has.
    """
    supabase = get_supabase()

    try:
        result = supabase.table("appointments").select("*").eq("id", id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Appointment not found")

        apt = result.data[0]

        if apt["status"] != "cancelled":
            raise HTTPException(status_code=400, detail="Only cancelled appointments can be restored.")

        # Check for conflicts with any other non-cancelled appointment in the same slot
        overlaps = (
            supabase.table("appointments")
            .select("id")
            .neq("id", id)
            .gte("end_time", apt["start_time"])
            .lte("start_time", apt["end_time"])
            .neq("status", "cancelled")
            .execute()
        )

        if overlaps.data:
            raise HTTPException(
                status_code=409,
                detail="This time slot has since been booked by another appointment.",
            )

        updated = (
            supabase.table("appointments")
            .update({"status": "confirmed"})
            .eq("id", id)
            .execute()
        )

        if not updated.data:
            raise HTTPException(status_code=404, detail="Appointment not found")

        return _to_response(updated.data[0])

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{id}/permanent")
async def permanently_delete_appointment(id: str) -> dict:
    """Permanently remove an appointment row from the database. Cannot be undone."""
    supabase = get_supabase()

    try:
        result = supabase.table("appointments").delete().eq("id", id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Appointment not found")

        return {"message": "Appointment permanently deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{id}")
async def delete_appointment(id: str) -> dict:
    """Soft delete an appointment by setting status to CANCELLED."""
    supabase = get_supabase()
    
    try:
        result = supabase.table("appointments").update({"status": "cancelled"}).eq("id", id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Appointment not found")
        
        return {"message": "Appointment cancelled"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))