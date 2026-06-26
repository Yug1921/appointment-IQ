"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  User,
  Mail,
  Briefcase,
  Clock,
  Calendar,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { updateAppointment, cancelAppointment, Appointment } from "@/lib/api";
import toast from "react-hot-toast";

interface AppointmentDetailProps {
  appointment: Appointment;
  onClose: () => void;
  onUpdate: () => void;
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="mt-0.5 p-1.5 rounded-md shrink-0"
        style={{ background: "#1A1A24", color: "#9090A8" }}
      >
        <Icon size={13} />
      </div>
      <div className="min-w-0">
        <p
          className="text-xs mb-0.5"
          style={{ color: "#5A5A70", letterSpacing: "0.04em" }}
        >
          {label}
        </p>
        <p
          className="text-sm font-medium break-words"
          style={{ color: "#F4F4F6" }}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

export default function AppointmentDetail({
  appointment,
  onClose,
  onUpdate,
}: AppointmentDetailProps) {
  const [confirming, setConfirming] = useState(false);
  const [loadingComplete, setLoadingComplete] = useState(false);
  const [loadingCancel, setLoadingCancel] = useState(false);

  const start = parseISO(appointment.start_time);
  const end = parseISO(appointment.end_time);

  async function handleMarkComplete() {
    setLoadingComplete(true);
    try {
      await updateAppointment(appointment.id, { status: "completed" });
      toast.success("Marked as completed");
      onUpdate();
      onClose();
    } catch {
      toast.error("Failed to update appointment");
    } finally {
      setLoadingComplete(false);
    }
  }

  async function handleCancel() {
    setLoadingCancel(true);
    try {
      await cancelAppointment(appointment.id);
      toast.success("Appointment cancelled");
      onUpdate();
      onClose();
    } catch {
      toast.error("Failed to cancel appointment");
    } finally {
      setLoadingCancel(false);
      setConfirming(false);
    }
  }

  const showActions =
    appointment.status !== "cancelled" && appointment.status !== "completed";

  return (
    <AnimatePresence>
      {/* overlay */}
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.45)" }}
        onClick={onClose}
      />

      {/* panel — full height, flex column, nothing overflows outside */}
      <motion.div
        key="panel"
        initial={{ x: 420, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 420, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed top-0 right-0 z-50 flex flex-col"
        style={{
          width: 400,
          height: "100dvh", // use dynamic viewport height — handles mobile chrome bar
          background: "#111118",
          borderLeft: "1px solid #2A2A38",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── header (shrink-0) ── */}
        <div
          className="shrink-0 flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid #2A2A38" }}
        >
          <div>
            <p
              className="text-xs mb-1 font-medium"
              style={{
                color: "#5A5A70",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Appointment
            </p>
            <h2
              className="font-semibold"
              style={{
                fontSize: 16,
                color: "#F4F4F6",
                letterSpacing: "-0.01em",
              }}
            >
              {appointment.name}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={appointment.status}>{appointment.status}</Badge>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md transition-colors"
              style={{ color: "#9090A8" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "#1A1A24";
                (e.currentTarget as HTMLElement).style.color = "#F4F4F6";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "#9090A8";
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── scrollable body (flex-1 overflow-y-auto) ── */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5 min-h-0">
          <div className="flex flex-col gap-4">
            <DetailRow icon={User} label="Name" value={appointment.name} />
            <DetailRow icon={Mail} label="Email" value={appointment.email} />
            <DetailRow
              icon={Briefcase}
              label="Purpose"
              value={appointment.purpose}
            />
            <DetailRow
              icon={Calendar}
              label="Date"
              value={format(start, "EEEE, MMMM d, yyyy")}
            />
            <DetailRow
              icon={Clock}
              label="Time"
              value={`${format(start, "h:mm a")} – ${format(end, "h:mm a")}`}
            />
            <DetailRow
              icon={Clock}
              label="Duration"
              value={
                appointment.duration_minutes >= 60
                  ? `${Math.floor(appointment.duration_minutes / 60)}h${
                      appointment.duration_minutes % 60 > 0
                        ? ` ${appointment.duration_minutes % 60}m`
                        : ""
                    }`
                  : `${appointment.duration_minutes} min`
              }
            />
            {appointment.notes && (
              <DetailRow
                icon={FileText}
                label="Notes"
                value={appointment.notes}
              />
            )}
          </div>

          <p className="text-xs" style={{ color: "#5A5A70" }}>
            Created{" "}
            {format(parseISO(appointment.created_at), "MMM d, yyyy 'at' h:mm a")}
          </p>
        </div>

        {/* ── footer (shrink-0, always visible) ── */}
        <div
          className="shrink-0 px-5 py-4 flex flex-col gap-2"
          style={{ borderTop: "1px solid #2A2A38" }}
        >
          {/* Cancel confirm — expands inside footer, pushes buttons down */}
          <AnimatePresence>
            {confirming && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div
                  className="rounded-lg p-3.5 flex flex-col gap-3 mb-2"
                  style={{
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.2)",
                  }}
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      size={14}
                      style={{ color: "#EF4444", marginTop: 1, flexShrink: 0 }}
                    />
                    <p className="text-sm" style={{ color: "#F4F4F6" }}>
                      Cancel appointment with{" "}
                      <span className="font-medium">{appointment.name}</span>?
                      This cannot be undone.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1"
                      onClick={() => setConfirming(false)}
                      disabled={loadingCancel}
                    >
                      Keep it
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      className="flex-1"
                      loading={loadingCancel}
                      onClick={handleCancel}
                    >
                      Yes, cancel
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action buttons */}
          {appointment.status === "confirmed" && (
            <Button
              variant="secondary"
              className="w-full"
              loading={loadingComplete}
              onClick={handleMarkComplete}
              disabled={confirming}
            >
              <CheckCircle size={15} />
              Mark as Completed
            </Button>
          )}

          {showActions && !confirming && (
            <Button
              variant="danger"
              className="w-full"
              onClick={() => setConfirming(true)}
              disabled={loadingComplete}
            >
              <XCircle size={15} />
              Cancel Appointment
            </Button>
          )}

          <Button variant="ghost" className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}