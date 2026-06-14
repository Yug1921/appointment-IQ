"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Search,
  Eye,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useAppointmentStore } from "@/store/appointmentStore";
import { Appointment } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import BookingModal from "@/components/appointments/BookingModal";
import AppointmentDetail from "@/components/appointments/AppointmentDetail";

const STATUS_FILTERS = ["all", "confirmed", "pending", "cancelled", "completed"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const PAGE_SIZE = 10;

export default function AppointmentsPage() {
  const { appointments, fetchAppointments, isLoading } = useAppointmentStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selected, setSelected] = useState<Appointment | null>(null);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  // reset to page 1 on filter change
  useEffect(() => { setPage(1); }, [search, statusFilter, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    return appointments
      .filter((a) => {
        if (statusFilter !== "all" && a.status !== statusFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          if (
            !a.name.toLowerCase().includes(q) &&
            !a.email.toLowerCase().includes(q) &&
            !a.purpose.toLowerCase().includes(q)
          )
            return false;
        }
        if (dateFrom) {
          if (parseISO(a.start_time) < new Date(dateFrom)) return false;
        }
        if (dateTo) {
          if (parseISO(a.start_time) > new Date(dateTo + "T23:59:59")) return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          parseISO(b.start_time).getTime() - parseISO(a.start_time).getTime()
      );
  }, [appointments, search, statusFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <div className="min-h-screen w-full" style={{ background: "#0A0A0F", color: "#F4F4F6" }}>
        <div className="max-w-screen-xl mx-auto px-6 py-8">

          {/* header */}
          <div className="flex items-end justify-between mb-8">
            <div>
              <p style={{ fontSize: 11, color: "#5A5A70", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500 }}>
                Manage
              </p>
              <h1 className="mt-1 font-semibold" style={{ fontSize: 24, letterSpacing: "-0.02em" }}>
                Appointments
                <span className="ml-3 text-base font-normal" style={{ color: "#5A5A70" }}>
                  {filtered.length} total
                </span>
              </h1>
            </div>
            <Button onClick={() => setBookingOpen(true)}>
              <Plus size={16} />
              New Appointment
            </Button>
          </div>

          {/* filters */}
          <div
            className="rounded-lg border p-4 mb-4 flex flex-col gap-3"
            style={{ background: "#111118", borderColor: "#2A2A38" }}
          >
            {/* search + date range */}
            <div className="flex gap-3 flex-wrap">
              {/* search */}
              <div className="relative flex-1 min-w-48">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "#5A5A70" }}
                />
                <input
                  type="text"
                  placeholder="Search by name, email or purpose…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-md border text-sm"
                  style={{
                    background: "#0A0A0F",
                    borderColor: "#2A2A38",
                    color: "#F4F4F6",
                  }}
                />
              </div>

              {/* date from */}
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-2 rounded-md border text-sm"
                style={{
                  background: "#0A0A0F",
                  borderColor: "#2A2A38",
                  color: dateFrom ? "#F4F4F6" : "#5A5A70",
                  colorScheme: "dark",
                }}
              />
              <span className="self-center text-sm" style={{ color: "#5A5A70" }}>to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-2 rounded-md border text-sm"
                style={{
                  background: "#0A0A0F",
                  borderColor: "#2A2A38",
                  color: dateTo ? "#F4F4F6" : "#5A5A70",
                  colorScheme: "dark",
                }}
              />

              {(dateFrom || dateTo || search) && (
                <button
                  onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); }}
                  className="text-xs px-3 py-2 rounded-md border transition-colors"
                  style={{ borderColor: "#2A2A38", color: "#9090A8" }}
                >
                  Clear
                </button>
              )}
            </div>

            {/* status pills */}
            <div className="flex gap-2 flex-wrap">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className="px-3 py-1 rounded-md text-xs font-medium border transition-all capitalize"
                  style={{
                    background: statusFilter === s ? "#6366F1" : "transparent",
                    borderColor: statusFilter === s ? "#6366F1" : "#2A2A38",
                    color: statusFilter === s ? "#fff" : "#9090A8",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* table */}
          <div
            className="rounded-lg border overflow-hidden"
            style={{ background: "#111118", borderColor: "#2A2A38" }}
          >
            {/* table head */}
            <div
              className="grid text-xs font-medium px-4 py-3 border-b"
              style={{
                gridTemplateColumns: "2fr 2fr 2fr 1.5fr 80px 80px 40px",
                color: "#5A5A70",
                borderColor: "#2A2A38",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              <span>Name</span>
              <span>Email</span>
              <span>Purpose</span>
              <span>Date & Time</span>
              <span>Duration</span>
              <span>Status</span>
              <span />
            </div>

            {/* rows */}
            {isLoading ? (
              <div className="flex flex-col">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="h-14 mx-4 my-2 rounded animate-pulse"
                    style={{ background: "#1A1A24" }}
                  />
                ))}
              </div>
            ) : paginated.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <CalendarX size={32} style={{ color: "#3A3A50" }} />
                <p className="text-sm" style={{ color: "#5A5A70" }}>
                  No appointments found
                </p>
              </div>
            ) : (
              paginated.map((appt) => (
                <div
                  key={appt.id}
                  className="grid items-center px-4 py-3.5 border-b cursor-pointer transition-colors"
                  style={{
                    gridTemplateColumns: "2fr 2fr 2fr 1.5fr 80px 80px 40px",
                    borderColor: "#1A1A24",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "#15151E")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                  onClick={() => setSelected(appt)}
                >
                  <span
                    className="text-sm font-medium truncate pr-3"
                    style={{ color: "#F4F4F6" }}
                  >
                    {appt.name}
                  </span>
                  <span
                    className="text-sm truncate pr-3"
                    style={{ color: "#9090A8" }}
                  >
                    {appt.email}
                  </span>
                  <span
                    className="text-sm truncate pr-3"
                    style={{ color: "#9090A8" }}
                  >
                    {appt.purpose}
                  </span>
                  <div className="pr-3">
                    <p className="text-sm font-medium" style={{ color: "#F4F4F6" }}>
                      {format(parseISO(appt.start_time), "MMM d, yyyy")}
                    </p>
                    <p className="text-xs" style={{ color: "#5A5A70" }}>
                      {format(parseISO(appt.start_time), "h:mm a")}
                    </p>
                  </div>
                  <span className="text-sm" style={{ color: "#9090A8" }}>
                    {appt.duration_minutes}m
                  </span>
                  <span>
                    <Badge variant={appt.status}>{appt.status}</Badge>
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelected(appt); }}
                    className="p-1.5 rounded-md transition-colors"
                    style={{ color: "#5A5A70" }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.color = "#6366F1")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.color = "#5A5A70")
                    }
                  >
                    <Eye size={15} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs" style={{ color: "#5A5A70" }}>
                Showing {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-md border transition-colors disabled:opacity-30"
                  style={{ borderColor: "#2A2A38", color: "#9090A8" }}
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="text-sm" style={{ color: "#9090A8" }}>
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-md border transition-colors disabled:opacity-30"
                  style={{ borderColor: "#2A2A38", color: "#9090A8" }}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {bookingOpen && (
        <BookingModal
          isOpen={bookingOpen}
          onClose={() => setBookingOpen(false)}
          onSuccess={() => { setBookingOpen(false); fetchAppointments(); }}
        />
      )}

      {selected && (
        <AppointmentDetail
          appointment={selected}
          onClose={() => setSelected(null)}
          onUpdate={() => fetchAppointments()}
        />
      )}
    </>
  );
}