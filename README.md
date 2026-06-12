# AppointmentIQ

AI-Powered Smart Appointment Booking System for corporate use.

## Project Structure

```
appointmentiq/
├── backend/          # FastAPI backend
├── frontend/         # Next.js frontend
└── README.md
```

## Getting Started

### Backend Setup

1. Navigate to `backend/` directory
2. Copy `.env.example` to `.env` and fill in your credentials
3. Install dependencies: `pip install -r requirements.txt`
4. Run server: `python run.py`

### Frontend Setup

1. Navigate to `frontend/` directory
2. Copy `.env.local.example` to `.env.local`
3. Install dependencies: `npm install`
4. Run dev server: `npm run dev`

## Technology Stack

- **Backend**: FastAPI, Supabase, OpenRouter API
- **Frontend**: Next.js, TailwindCSS, React Query
- **Database**: PostgreSQL (via Supabase)
- **Real-time**: Supabase Realtime
