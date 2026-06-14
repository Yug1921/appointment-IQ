// appointmentStore.ts
import { create } from "zustand";
import {
  getAppointments as fetchAppointmentsAPI,
  Appointment,
} from "@/lib/api";
import { subscribeToAppointments } from "@/lib/supabase";

export type ViewType = "day" | "week" | "month";

interface AppointmentStore {
  appointments: Appointment[];
  isLoading: boolean;
  selectedDate: Date;
  view: ViewType;
  setAppointments: (appointments: Appointment[]) => void;
  addAppointment: (appointment: Appointment) => void;
  updateAppointment: (id: string, appointment: Partial<Appointment>) => void;
  removeAppointment: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setSelectedDate: (date: Date) => void;
  setView: (view: ViewType) => void;
  fetchAppointments: (date?: string) => Promise<void>;
}

export const useAppointmentStore = create<AppointmentStore>((set) => {
  // Subscribe to realtime appointments
  const unsubscribe = subscribeToAppointments((appointment) => {
    set((state) => {
      const exists = state.appointments.find((a) => a.id === appointment.id);
      if (exists) {
        return {
          appointments: state.appointments.map((a) =>
            a.id === appointment.id ? appointment : a
          ),
        };
      }
      return {
        appointments: [...state.appointments, appointment],
      };
    });
  });

  return {
    appointments: [],
    isLoading: false,
    selectedDate: new Date(),
    view: "week",

    setAppointments: (appointments) => set({ appointments }),

    addAppointment: (appointment) =>
      set((state) => ({
        appointments: [...state.appointments, appointment],
      })),

    updateAppointment: (id, appointment) =>
      set((state) => ({
        appointments: state.appointments.map((a) =>
          a.id === id ? { ...a, ...appointment } : a
        ),
      })),

    removeAppointment: (id) =>
      set((state) => ({
        appointments: state.appointments.filter((a) => a.id !== id),
      })),

    setLoading: (loading) => set({ isLoading: loading }),

    setSelectedDate: (date) => set({ selectedDate: date }),

    setView: (view) => set({ view }),

    fetchAppointments: async (date?: string) => {
      set({ isLoading: true });
      try {
        const appointments = await fetchAppointmentsAPI(date);
        set({ appointments });
      } catch (error) {
        console.error("Failed to fetch appointments:", error);
      } finally {
        set({ isLoading: false });
      }
    },
  };
});
