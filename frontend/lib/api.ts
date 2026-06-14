// api.ts

import axios, { AxiosInstance } from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use((config) => {
  if (config.url && !config.url.includes("?") && !config.url.endsWith("/")) {
    config.url = config.url + "/";
  }
  return config;
});

// Types
export interface Appointment {
  id: string;
  name: string;
  email: string;
  purpose: string;
  start_time: string;
  end_time: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  duration_minutes: number;
  notes?: string;
  created_at: string;
}

export interface AppointmentCreate {
  name: string;
  email: string;
  purpose: string;
  start_time: string;
  end_time: string;
  duration_minutes?: number;
  notes?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface BookingIntent {
  action: "confirm" | "suggest" | "clarify" | "cancel";
  name?: string;
  email?: string;
  purpose?: string;
  requested_datetime?: string;
  suggested_slots?: string[];
  message: string;
}

export interface ChatResponse {
  reply: string;
  booking_intent?: BookingIntent;
  conversation_history: ChatMessage[];
}

export interface ChatRequest {
  message: string;
  conversation_history?: ChatMessage[];
}

export interface AvailableSlot {
  start_time: string;
  end_time: string;
  duration_minutes: number;
}

export interface SlotsResponse {
  date: string;
  available_slots: AvailableSlot[];
  booked_slots: Appointment[];
}

export interface BlockedSlot {
  id: string;
  start_time: string;
  end_time: string;
  reason?: string;
  created_at: string;
}

// API Functions

export async function getAppointments(
  date?: string,
  status?: string
): Promise<Appointment[]> {
  const params = new URLSearchParams();
  if (date) params.append("date", date);
  if (status) params.append("status", status);

  const response = await apiClient.get(`/appointments?${params.toString()}`);
  return response.data;
}

export async function createAppointment(
  data: AppointmentCreate
): Promise<Appointment> {
  const response = await apiClient.post("/appointments", data);
  return response.data;
}

export async function updateAppointment(
  id: string,
  data: Partial<Appointment>
): Promise<Appointment> {
  const response = await apiClient.patch(`/appointments/${id}`, data);
  return response.data;
}

export async function cancelAppointment(id: string): Promise<void> {
  await apiClient.delete(`/appointments/${id}`);
}

export async function getAvailableSlots(
  date: string,
  duration?: number
): Promise<SlotsResponse> {
  const params = new URLSearchParams({ date });
  if (duration) params.append("duration_minutes", duration.toString());

  const response = await apiClient.get(`/slots/available?${params.toString()}`);
  return response.data;
}

export async function sendChatMessage(
  message: string,
  history: ChatMessage[] = []
): Promise<ChatResponse> {
  const response = await apiClient.post("/chat/message", {
    message,
    conversation_history: history,
  });
  return response.data;
}

export async function blockSlot(
  start: string,
  end: string,
  reason?: string
): Promise<BlockedSlot> {
  const params = new URLSearchParams({
    start_time: start,
    end_time: end,
  });
  if (reason) params.append("reason", reason);

  const response = await apiClient.post(
    `/slots/block?${params.toString()}`
  );
  return response.data;
}

export async function getAppointmentById(id: string): Promise<Appointment> {
  const response = await apiClient.get(`/appointments/${id}`);
  return response.data;
}

