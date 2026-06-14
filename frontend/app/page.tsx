"use client";

import { useEffect, useState, useMemo } from "react";
import {
  CalendarCheck,
  CheckCircle,
  XCircle,
  AlertCircle,
  CalendarX,
  Plus,
  ChevronRight,
  Clock,
  TrendingUp,
} from "lucide-react";
import { format, isToday, parseISO, isSameDay } from "date-fns";
import { useAppointmentStore } from "@/store/appointmentStore";
import { Appointment } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import BookingModal from "@/components/appointments/BookingModal";
import AppointmentDetail from "@/components/appointments/AppointmentDetail";
import CancelledAppointmentsModal from "@/components/appointments/CancelledAppointmentsModal";

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: string;
  sublabel?: string;
}

function StatCard({ label, value, icon, accent, sublabel }: StatCardProps) {
  return (
    <div
      className="relative rounded-lg border p-5 overflow-hidden group transition-colors duration-200"
      style={{
        background: "#111118",
        borderColor: "#2A2A38",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#3A3A50")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2A2A38")}
    >
      {/* left accent bar */}
      <div
        className="absolute left-0 top-4 bottom-4 w-0.5 rounded-full"
        style={{ background: accent }}
      />
      <div className="flex items-start justify-between">
        <div>
          <p
            className="font-caps mb-3"
            style={{
              color: "#5A5A70",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {label}
          </p>
          <p
            className="font-semibold leading-none"
            style={{ fontSize: 32, color: "#F4F4F6", letterSpacing: "-0.02em" }}
          >
            {value}
          </p>
          {sublabel && (
            <p className="mt-1.5 text-xs" style={{ color: "#5A5A70" }}>
              {sublabel}
            </p>
          )}
        </div>
        <div
          className="p-2 rounded-md"
          style={{ background: `${accent}18`, color: accent }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

// ─── Upcoming Row ─────────────────────────────────────────────────────────────

function AppointmentRow({
  appt,
  onClick,
}: {
  appt: Appointment;
  onClick: () => void;
}) {
  const start = parseISO(appt.start_time);

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 px-4 py-3.5 rounded-lg border cursor-pointer transition-all duration-150 group"
      style={{ background: "#111118", borderColor: "#2A2A38" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#3A3A50";
        e.currentTarget.style.background = "#15151E";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#2A2A38";
        e.currentTarget.style.background = "#111118";
      }}
    >
      {/* time block */}
      <div className="shrink-0 text-right" style={{ minWidth: 72 }}>
        <p className="text-sm font-semibold" style={{ color: "#F4F4F6" }}>
          {format(start, "h:mm a")}
        </p>
        <p className="text-xs" style={{ color: "#5A5A70" }}>
          {isToday(start) ? "Today" : format(start, "MMM d")}
        </p>
      </div>

      {/* divider */}
      <div className="w-px self-stretch" style={{ background: "#2A2A38" }} />

      {/* info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium truncate"
          style={{ color: "#F4F4F6" }}
        >
          {appt.name}
        </p>
        <p className="text-xs truncate" style={{ color: "#9090A8" }}>
          {appt.purpose}
        </p>
      </div>

      {/* duration */}
      <div
        className="shrink-0 flex items-center gap-1"
        style={{ color: "#5A5A70" }}
      >
        <Clock size={12} />
        <span className="text-xs">{appt.duration_minutes}m</span>
      </div>

      {/* badge */}
      <div className="shrink-0">
        <Badge variant={appt.status}>{appt.status}</Badge>
      </div>

      {/* arrow */}
      <ChevronRight
        size={14}
        className="shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
        style={{ color: "#5A5A70" }}
      />
    </div>
  );
}

// ─── Today Timeline ───────────────────────────────────────────────────────────

function TodayTimeline({
  appointments,
  onBook,
}: {
  appointments: Appointment[];
  onBook: () => void;
}) {
  const todayAppts = useMemo(
    () =>
      appointments
        .filter(
          (a) =>
            isSameDay(parseISO(a.start_time), new Date()) &&
            a.status !== "cancelled",
        )
        .sort(
          (a, b) =>
            parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime(),
        ),
    [appointments],
  );

  const statusColor: Record<string, string> = {
    confirmed: "#6366F1",
    pending: "#F59E0B",
    completed: "#22C55E",
    cancelled: "#5A5A70",
  };

  return (
    <div
      className="rounded-lg border flex flex-col"
      style={{ background: "#111118", borderColor: "#2A2A38" }}
    >
      {/* header */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b"
        style={{ borderColor: "#2A2A38" }}
      >
        <div>
          <p
            style={{
              fontSize: 11,
              color: "#5A5A70",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            Today
          </p>
          <p
            className="text-sm font-semibold mt-0.5"
            style={{ color: "#F4F4F6" }}
          >
            {format(new Date(), "EEEE, MMMM d")}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={onBook}>
          <Plus size={14} />
          Book
        </Button>
      </div>

      {/* timeline */}
      <div className="flex-1 overflow-y-auto p-4" style={{ maxHeight: 340 }}>
        {todayAppts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <CalendarX size={28} style={{ color: "#3A3A50" }} />
            <p className="text-sm" style={{ color: "#5A5A70" }}>
              No appointments today
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {todayAppts.map((appt) => {
              const color = statusColor[appt.status] ?? "#6366F1";
              return (
                <div
                  key={appt.id}
                  className="flex gap-3 p-3 rounded-md border-l-2"
                  style={{
                    background: "#1A1A24",
                    borderLeftColor: color,
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: "#F4F4F6" }}
                    >
                      {appt.name}
                    </p>
                    <p
                      className="text-xs truncate"
                      style={{ color: "#9090A8" }}
                    >
                      {appt.purpose}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className="text-xs font-medium"
                      style={{ color: "#F4F4F6" }}
                    >
                      {format(parseISO(appt.start_time), "h:mm a")}
                    </p>
                    <p className="text-xs" style={{ color: "#5A5A70" }}>
                      {appt.duration_minutes}m
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { appointments, fetchAppointments, isLoading } = useAppointmentStore();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [cancelledModalOpen, setCancelledModalOpen] = useState(false);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  // Stats — current month
  const monthAppts = useMemo(() => {
    const now = new Date();
    return appointments.filter((a) => {
      const d = parseISO(a.start_time);
      return (
        d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      );
    });
  }, [appointments]);

  const stats = useMemo(
    () => ({
      total: monthAppts.length,
      confirmed: monthAppts.filter((a) => a.status === "confirmed").length,
      pending: monthAppts.filter((a) => a.status === "pending").length,
      cancelled: monthAppts.filter((a) => a.status === "cancelled").length,
    }),
    [monthAppts],
  );

  const cancelledAppointments = useMemo(
    () =>
      appointments
        .filter((a) => a.status === "cancelled")
        .sort(
          (a, b) =>
            parseISO(b.start_time).getTime() - parseISO(a.start_time).getTime(),
        ),
    [appointments],
  );

  // Upcoming — next 5 non-cancelled from now
  const upcoming = useMemo(
    () =>
      appointments
        .filter(
          (a) =>
            a.status !== "cancelled" &&
            parseISO(a.start_time).getTime() >= Date.now(),
        )
        .sort(
          (a, b) =>
            parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime(),
        )
        .slice(0, 5),
    [appointments],
  );

  return (
    <>
      {/* ── page wrapper ── */}
      <div
        className="min-h-screen w-full"
        style={{ background: "#0A0A0F", color: "#F4F4F6" }}
      >
        <div className="max-w-screen-xl mx-auto px-6 py-8">
          {/* ── page header ── */}
          <div className="flex items-end justify-between mb-8">
            <div>
              <p
                style={{
                  fontSize: 11,
                  color: "#5A5A70",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  fontWeight: 500,
                }}
              >
                {format(new Date(), "EEEE, MMMM d · yyyy")}
              </p>
              <h1
                className="mt-1 font-semibold"
                style={{
                  fontSize: 24,
                  letterSpacing: "-0.02em",
                  color: "#F4F4F6",
                }}
              >
                Dashboard
              </h1>
            </div>
            <Button onClick={() => setBookingOpen(true)}>
              <Plus size={16} />
              New Appointment
            </Button>
          </div>

          {/* ── stats row ── */}
          <div className="grid grid-cols-2 gap-3 mb-8 lg:grid-cols-4">
            <StatCard
              label="This month"
              value={stats.total}
              icon={<CalendarCheck size={18} />}
              accent="#6366F1"
              sublabel="total bookings"
            />
            <StatCard
              label="Confirmed"
              value={stats.confirmed}
              icon={<CheckCircle size={18} />}
              accent="#22C55E"
              sublabel="ready to go"
            />
            <StatCard
              label="Pending"
              value={stats.pending}
              icon={<AlertCircle size={18} />}
              accent="#F59E0B"
              sublabel="awaiting confirmation"
            />
            <div
              onClick={() => setCancelledModalOpen(true)}
              className="cursor-pointer"
            >
              <StatCard
                label="Cancelled"
                value={stats.cancelled}
                icon={<XCircle size={18} />}
                accent="#EF4444"
                sublabel="click to manage"
              />
            </div>
          </div>

          {/* ── main grid ── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            {/* ── upcoming ── (3/5) */}
            <div className="lg:col-span-3 flex flex-col gap-3">
              {/* section header */}
              <div className="flex items-center justify-between">
                <p
                  style={{
                    fontSize: 11,
                    color: "#5A5A70",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    fontWeight: 500,
                  }}
                >
                  Upcoming
                </p>
                <a
                  href="/appointments"
                  className="text-xs font-medium flex items-center gap-1 transition-colors duration-150"
                  style={{ color: "#6366F1" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = "#A78BFA")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = "#6366F1")
                  }
                >
                  View all
                  <ChevronRight size={12} />
                </a>
              </div>

              {/* list */}
              {isLoading ? (
                <div className="flex flex-col gap-2">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="rounded-lg border px-4 py-3.5 animate-pulse"
                      style={{
                        background: "#111118",
                        borderColor: "#2A2A38",
                        height: 64,
                      }}
                    />
                  ))}
                </div>
              ) : upcoming.length === 0 ? (
                <div
                  className="rounded-lg border flex flex-col items-center justify-center gap-3 py-16"
                  style={{ background: "#111118", borderColor: "#2A2A38" }}
                >
                  <CalendarX size={32} style={{ color: "#3A3A50" }} />
                  <div className="text-center">
                    <p
                      className="text-sm font-medium"
                      style={{ color: "#9090A8" }}
                    >
                      No upcoming appointments
                    </p>
                    <p className="text-xs mt-1" style={{ color: "#5A5A70" }}>
                      Book one to get started
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setBookingOpen(true)}>
                    <Plus size={14} />
                    Book now
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {upcoming.map((appt) => (
                    <AppointmentRow
                      key={appt.id}
                      appt={appt}
                      onClick={() => setSelectedAppt(appt)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── today ── (2/5) */}
            <div className="lg:col-span-2">
              <TodayTimeline
                appointments={appointments}
                onBook={() => setBookingOpen(true)}
              />

              {/* quick insight card */}
              {stats.total > 0 && (
                <div
                  className="mt-4 rounded-lg border p-4 flex items-center gap-3"
                  style={{ background: "#111118", borderColor: "#2A2A38" }}
                >
                  <div
                    className="p-2 rounded-md shrink-0"
                    style={{
                      background: "rgba(99,102,241,0.12)",
                      color: "#6366F1",
                    }}
                  >
                    <TrendingUp size={16} />
                  </div>
                  <div className="min-w-0">
                    <p
                      className="text-xs font-medium"
                      style={{ color: "#F4F4F6" }}
                    >
                      {Math.round((stats.confirmed / stats.total) * 100)}%
                      confirmation rate
                    </p>
                    <p className="text-xs" style={{ color: "#5A5A70" }}>
                      {stats.confirmed} of {stats.total} appointments confirmed
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── modals ── */}
      {bookingOpen && (
        <BookingModal
          isOpen={bookingOpen}
          onClose={() => setBookingOpen(false)}
          onSuccess={() => {
            setBookingOpen(false);
            fetchAppointments();
          }}
        />
      )}

      {selectedAppt && (
        <AppointmentDetail
          appointment={selectedAppt}
          onClose={() => setSelectedAppt(null)}
          onUpdate={() => fetchAppointments()}
        />
      )}
      
      <CancelledAppointmentsModal
        isOpen={cancelledModalOpen}
        onClose={() => setCancelledModalOpen(false)}
        appointments={cancelledAppointments}
        onUpdate={() => {
          fetchAppointments();
        }}
      />
    </>
  );
}
