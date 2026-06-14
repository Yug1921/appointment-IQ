"use client";

import React, { useState } from "react";
import { format, parseISO } from "date-fns";
import {
  CalendarX,
  RotateCcw,
  Trash2,
  AlertTriangle,
  Mail,
  Briefcase,
} from "lucide-react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  Appointment,
  restoreAppointment,
  permanentlyDeleteAppointment,
} from "@/lib/api";

interface CancelledAppointmentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointments: Appointment[];
  onUpdate: () => void;
}

interface RowProps {
  appt: Appointment;
  onUpdate: () => void;
}

function CancelledRow({ appt, onUpdate }: RowProps) {
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const start = parseISO(appt.start_time);
  const end = parseISO(appt.end_time);

  async function handleRestore() {
    setRestoring(true);
    try {
      await restoreAppointment(appt.id);
      toast.success("Appointment restored");
      onUpdate();
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        toast.error("That slot has since been booked by another appointment.");
      } else {
        toast.error("Failed to restore appointment.");
      }
    } finally {
      setRestoring(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await permanentlyDeleteAppointment(appt.id);
      toast.success("Appointment permanently deleted");
      onUpdate();
    } catch {
      toast.error("Failed to delete appointment.");
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div
      className="rounded-lg border p-3.5 flex flex-col gap-3"
      style={{ background: "#1A1A24", borderColor: "#2A2A38" }}
    >
      {/* main row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "#F4F4F6" }}>
            {appt.name}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <Mail size={11} style={{ color: "#5A5A70" }} />
            <p className="text-xs truncate" style={{ color: "#9090A8" }}>
              {appt.email}
            </p>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <Briefcase size={11} style={{ color: "#5A5A70" }} />
            <p className="text-xs truncate" style={{ color: "#9090A8" }}>
              {appt.purpose}
            </p>
          </div>
        </div>

        <div className="text-right shrink-0">
          <p className="text-xs font-medium" style={{ color: "#F4F4F6" }}>
            {format(start, "MMM d, yyyy")}
          </p>
          <p className="text-xs" style={{ color: "#5A5A70" }}>
            {format(start, "h:mm a")} – {format(end, "h:mm a")}
          </p>
        </div>
      </div>

      {/* delete confirm inline */}
      {confirmingDelete ? (
        <div
          className="rounded-md p-3 flex flex-col gap-2"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle size={13} style={{ color: "#EF4444", marginTop: 1, flexShrink: 0 }} />
            <p className="text-xs" style={{ color: "#F4F4F6" }}>
              Permanently delete this appointment? This cannot be undone.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="flex-1"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
            >
              Keep it
            </Button>
            <Button
              size="sm"
              variant="danger"
              className="flex-1"
              loading={deleting}
              onClick={handleDelete}
            >
              Delete permanently
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            loading={restoring}
            disabled={confirmingDelete}
            onClick={handleRestore}
          >
            <RotateCcw size={13} />
            Restore
          </Button>
          <Button
            size="sm"
            variant="danger"
            className="flex-1"
            disabled={restoring}
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 size={13} />
            Delete permanently
          </Button>
        </div>
      )}
    </div>
  );
}

export default function CancelledAppointmentsModal({
  isOpen,
  onClose,
  appointments,
  onUpdate,
}: CancelledAppointmentsModalProps) {
  const sorted = [...appointments].sort(
    (a, b) => parseISO(b.start_time).getTime() - parseISO(a.start_time).getTime()
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cancelled Appointments">
      <div className="flex flex-col gap-3" style={{ maxHeight: 480, overflowY: "auto" }}>
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            <CalendarX size={28} style={{ color: "#3A3A50" }} />
            <p className="text-sm" style={{ color: "#5A5A70" }}>
              No cancelled appointments
            </p>
          </div>
        ) : (
          sorted.map((appt) => (
            <CancelledRow key={appt.id} appt={appt} onUpdate={onUpdate} />
          ))
        )}
      </div>
    </Modal>
  );
}