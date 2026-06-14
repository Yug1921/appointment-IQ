"use client";

import React, { useState, useEffect } from "react";
import { User, Mail, Briefcase, FileText, Clock, Calendar } from "lucide-react";
import { format, addMinutes, parseISO } from "date-fns";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  createAppointment,
  getAvailableSlots,
  AvailableSlot,
  AppointmentCreate,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  prefillDate?: Date;
}

const DURATION_OPTIONS = [
  { label: "30 min", value: 30 },
  { label: "60 min", value: 60 },
  { label: "Custom", value: 0 },
];

interface FormErrors {
  name?: string;
  email?: string;
  purpose?: string;
  date?: string;
  time?: string;
  customDuration?: string;
}

export default function BookingModal({
  isOpen,
  onClose,
  onSuccess,
  prefillDate,
}: BookingModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(
    prefillDate ? format(prefillDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")
  );
  const [time, setTime] = useState("");
  const [durationMode, setDurationMode] = useState<30 | 60 | 0>(30);
  const [customDuration, setCustomDuration] = useState("45");
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const effectiveDuration = durationMode === 0 ? parseInt(customDuration) || 30 : durationMode;

  // fetch available slots when date or duration changes
  useEffect(() => {
    if (!date) return;
    const fetch = async () => {
      setLoadingSlots(true);
      try {
        const res = await getAvailableSlots(date, effectiveDuration);
        setAvailableSlots(res.available_slots);
      } catch {
        setAvailableSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    };
    fetch();
  }, [date, effectiveDuration]);

  function validate(): boolean {
    const e: FormErrors = {};
    if (!name.trim()) e.name = "Name is required";
    if (!email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Invalid email address";
    if (!purpose.trim()) e.purpose = "Purpose is required";
    if (!date) e.date = "Date is required";
    if (!time) e.time = "Please select a time slot";
    if (durationMode === 0) {
      const d = parseInt(customDuration);
      if (isNaN(d) || d < 15 || d > 480) e.customDuration = "Enter a duration between 15–480 min";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const [hours, minutes] = time.split(":").map(Number);
      const startDate = new Date(date);
      startDate.setHours(hours, minutes, 0, 0);
      const endDate = addMinutes(startDate, effectiveDuration);

      const payload: AppointmentCreate = {
        name: name.trim(),
        email: email.trim(),
        purpose: purpose.trim(),
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        duration_minutes: effectiveDuration,
        notes: notes.trim() || undefined,
      };

      await createAppointment(payload);
      toast.success("Appointment booked successfully");
      onSuccess();
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setErrors({ time: "This slot is already booked. Please choose another time." });
      } else {
        toast.error("Failed to book appointment. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setName(""); setEmail(""); setPurpose(""); setNotes("");
    setDate(format(new Date(), "yyyy-MM-dd")); setTime("");
    setDurationMode(30); setCustomDuration("45");
    setErrors({});
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="New Appointment">
      <div className="flex flex-col gap-4">
        {/* name + email */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Full name"
            placeholder="Alex Johnson"
            icon={User}
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
          />
          <Input
            label="Email"
            type="email"
            placeholder="alex@company.com"
            icon={Mail}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
          />
        </div>

        {/* purpose */}
        <Input
          label="Purpose"
          placeholder="e.g. Project review, Onboarding, Client meeting"
          icon={Briefcase}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          error={errors.purpose}
        />

        {/* date + duration */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "#F4F4F6" }}>
              Date
            </label>
            <div className="relative">
              <Calendar
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                size={16}
                style={{ color: "#9090A8" }}
              />
              <input
                type="date"
                value={date}
                min={format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => { setDate(e.target.value); setTime(""); }}
                className="w-full pl-9 pr-3 py-2 rounded-md border text-sm transition-colors"
                style={{
                  background: "#111118",
                  borderColor: errors.date ? "#EF4444" : "#2A2A38",
                  color: "#F4F4F6",
                  colorScheme: "dark",
                }}
              />
            </div>
            {errors.date && <p className="mt-1 text-xs" style={{ color: "#EF4444" }}>{errors.date}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "#F4F4F6" }}>
              Duration
            </label>
            <div className="flex gap-1.5 h-[38px]">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDurationMode(opt.value as 30 | 60 | 0)}
                  className="flex-1 text-xs font-medium rounded-md border transition-all"
                  style={{
                    background: durationMode === opt.value ? "#6366F1" : "#111118",
                    borderColor: durationMode === opt.value ? "#6366F1" : "#2A2A38",
                    color: durationMode === opt.value ? "#fff" : "#9090A8",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {durationMode === 0 && (
              <input
                type="number"
                value={customDuration}
                min={15}
                max={480}
                onChange={(e) => setCustomDuration(e.target.value)}
                placeholder="Minutes"
                className="mt-2 w-full px-3 py-1.5 rounded-md border text-sm"
                style={{
                  background: "#111118",
                  borderColor: errors.customDuration ? "#EF4444" : "#2A2A38",
                  color: "#F4F4F6",
                  colorScheme: "dark",
                }}
              />
            )}
            {errors.customDuration && <p className="mt-1 text-xs" style={{ color: "#EF4444" }}>{errors.customDuration}</p>}
          </div>
        </div>

        {/* time slot picker */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium" style={{ color: "#F4F4F6" }}>
              Available slots
            </label>
            {time && (
              <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: "rgba(99,102,241,0.15)", color: "#A78BFA" }}>
                {time} selected
              </span>
            )}
          </div>

          {loadingSlots ? (
            <div className="flex gap-2 flex-wrap">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="h-8 w-20 rounded-md animate-pulse"
                  style={{ background: "#1A1A24" }}
                />
              ))}
            </div>
          ) : availableSlots.length === 0 ? (
            <p className="text-sm py-3" style={{ color: "#5A5A70" }}>
              No available slots for this date. Try another day.
            </p>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {availableSlots.map((slot) => {
                const slotTime = format(parseISO(slot.start_time), "HH:mm");
                const selected = time === slotTime;
                return (
                  <button
                    key={slot.start_time}
                    type="button"
                    onClick={() => { setTime(slotTime); setErrors((e) => ({ ...e, time: undefined })); }}
                    className="px-3 py-1.5 rounded-md text-xs font-medium border transition-all"
                    style={{
                      background: selected ? "#6366F1" : "#1A1A24",
                      borderColor: selected ? "#6366F1" : "#2A2A38",
                      color: selected ? "#fff" : "#9090A8",
                    }}
                  >
                    {format(parseISO(slot.start_time), "h:mm a")}
                  </button>
                );
              })}
            </div>
          )}
          {errors.time && <p className="mt-1.5 text-xs" style={{ color: "#EF4444" }}>{errors.time}</p>}
        </div>

        {/* notes */}
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: "#F4F4F6" }}>
            Notes <span style={{ color: "#5A5A70" }}>(optional)</span>
          </label>
          <div className="relative">
            <FileText
              className="absolute left-3 top-3 pointer-events-none"
              size={16}
              style={{ color: "#9090A8" }}
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional context..."
              className="w-full pl-9 pr-3 py-2 rounded-md border text-sm resize-none transition-colors"
              style={{
                background: "#111118",
                borderColor: "#2A2A38",
                color: "#F4F4F6",
              }}
            />
          </div>
        </div>

        {/* actions */}
        <div className="flex gap-2 pt-1">
          <Button variant="ghost" className="flex-1" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button className="flex-1" loading={submitting} onClick={handleSubmit}>
            Book Appointment
          </Button>
        </div>
      </div>
    </Modal>
  );
}