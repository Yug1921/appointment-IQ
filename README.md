# AppointmentIQ

**An AI-Powered Smart Appointment Booking System**

AppointmentIQ is a full-stack appointment scheduling platform built for teams and businesses. It combines a traditional booking interface with a conversational AI assistant — both writing to the same database and reflected on a real-time calendar with zero page refreshes.

**Live demo:** https://appointment-iq.vercel.app/

---

## Preview

| Dashboard | 
|---|
| <img width="1918" height="922" alt="image" src="https://github.com/user-attachments/assets/70f1e939-cf47-4e22-922d-cd6c5faf7530" />
 | <img width="1918" height="930" alt="image" src="https://github.com/user-attachments/assets/af0a6834-021d-490a-b2eb-41263d0b737d" />
 |

| AI Assistant |  
|---|
| <img width="1918" height="923" alt="image" src="https://github.com/user-attachments/assets/9925aa53-aadb-4c43-bbf0-bde4f9e106a0" />
 | <img width="1918" height="927" alt="image" src="https://github.com/user-attachments/assets/ceeb7c6b-17c4-42d7-ae46-3b1aa1e56b12" />
 |

| Delete & Retrival |  
|---|
<img width="1918" height="925" alt="image" src="https://github.com/user-attachments/assets/10fac9e7-308c-469f-8ca3-3656894ee523" />

---

## Features

- **Conversational AI booking assistant** — describe your appointment in plain English (date, time, purpose, attendee details) and the assistant extracts the details, checks availability, and books it for you
- **Conflict detection & smart suggestions** — if a requested slot is taken, the assistant suggests the nearest available alternatives as clickable options
- **Multi-turn memory** — the assistant remembers earlier details in the conversation, so picking a suggested time slot completes the booking without re-asking for your name, email, or purpose
- **Conversational cancellation** — cancel an appointment by simply telling the assistant the email it was booked under
- **Manual booking form** — a full booking modal with live availability checking, duration presets, and validation
- **Interactive calendar** — day, week, and month views showing booked, available, and blocked slots
- **Real-time sync** — any booking made via chat or the form appears instantly across all open sessions (Supabase Realtime)
- **Double-booking prevention** — all writes pass through a single backend validation layer that checks for overlaps
- **Cancelled appointment management** — restore or permanently delete cancelled appointments from a dedicated view
- **Dashboard** — at-a-glance stats for total, confirmed, pending, and cancelled appointments, plus today's schedule

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| State management | Zustand |
| UI / animation | Framer Motion, Lucide Icons |
| Calendar | React Big Calendar |
| Backend | FastAPI (Python) |
| Database | Supabase (PostgreSQL + Realtime) |
| AI / LLM | OpenRouter (free-tier models: Gemma, Llama 3.3, Qwen) |
| Email (optional) | Resend |
| Hosting | Vercel (frontend), Render (backend) |

This project is built entirely on **free tiers** across every service — Vercel, Render, Supabase, and OpenRouter's free models. As a result:

- The backend may take 15–30 seconds to respond on the first request after inactivity (Render free-tier cold start)
- The AI assistant occasionally hits rate limits on free models — if it doesn't respond, wait a few seconds and try again
- This has been tested end-to-end and works reliably under normal use; occasional delays are a free-tier limitation, not a functional issue

---

## Project Structure

```
appointmentiq/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entrypoint
│   │   ├── config.py            # Settings / environment config
│   │   ├── database.py          # Supabase client
│   │   ├── models.py            # Pydantic models
│   │   ├── schemas.py           # Request/response schemas
│   │   └── routers/
│   │       ├── appointments.py  # CRUD, restore, permanent delete
│   │       ├── slots.py         # Availability & blocked slots
│   │       └── chat.py          # AI assistant endpoint
│   ├── requirements.txt
│   ├── run.py
│   └── SUPABASE_SETUP.sql       # Database schema
└── frontend/
    ├── app/                     # Pages (dashboard, calendar, appointments, settings)
    ├── components/              # UI, chat, calendar, appointment components
    ├── store/                   # Zustand stores
    └── lib/                     # API client, Supabase client, utilities
```

---

## Running Locally

### Prerequisites

- Node.js 18+
- Python 3.11+
- A free [Supabase](https://supabase.com) account
- A free [OpenRouter](https://openrouter.ai) account (for the AI assistant)
- (Optional) A free [Resend](https://resend.com) account for email confirmations

### 1. Clone the repository

```bash
git clone https://github.com/Yug1921/appointment-IQ.git
cd appointment-IQ
```

### 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Open the **SQL Editor** and run the contents of `backend/SUPABASE_SETUP.sql` — this creates the `appointments` and `blocked_slots` tables, enables Row Level Security, and turns on Realtime
3. Go to **Project Settings → API** and copy your **Project URL**, **anon key**, and **service role key**

### 3. Backend setup

```bash
cd backend
cp .env.example .env
```

Fill in `.env`:

```dotenv
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
OPENROUTER_API_KEY=your_openrouter_api_key
RESEND_API_KEY=your_resend_api_key
FRONTEND_URL=http://localhost:3000
APP_NAME=AppointmentIQ
SLOT_DURATION_DEFAULT=30
```

Install dependencies and run:

```bash
pip install -r requirements.txt
python run.py
```

The backend runs at **http://localhost:8000**.

### 4. Frontend setup

In a new terminal:

```bash
cd frontend
cp .env.local.example .env.local
```

Fill in `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_NAME=AppointmentIQ
```

Install dependencies and run:

```bash
npm install
npm run dev
```

The frontend runs at **http://localhost:3000**.

---

## Using the App

### Manual booking
Click **New Appointment** on the dashboard or appointments page, fill in the details, pick an available time slot, and confirm.

### AI assistant
Click the **bot icon** in the bottom-right corner of the screen to open the chat assistant. Try:

- *"Book a meeting with Alex Johnson (alex@company.com) on Friday at 2pm for a project review"*
- *"What slots are free this Thursday?"*
- *"Cancel my appointment, my email is alex@company.com"*

If a slot is unavailable, the assistant suggests alternatives — click any suggestion to complete the booking with the details already provided.

### Managing cancellations
Click the **Cancelled** stat card on the dashboard to view all cancelled appointments, where you can restore them (subject to availability) or delete them permanently.

---

## Notes

- AI responses use a cascade of free OpenRouter models (Gemma 4, Llama 3.3 70B, Qwen3) with automatic retries — if all models are rate-limited at once, the assistant will ask you to try again shortly.
- Email confirmations via Resend are optional and run as a non-blocking background task — bookings succeed regardless of email delivery status.
