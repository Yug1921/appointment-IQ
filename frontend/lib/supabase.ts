import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase credentials. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export type Appointment = {
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
};

export function subscribeToAppointments(
  callback: (appointment: Appointment) => void
) {
  const subscription = supabase
    .channel("appointments-channel")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "appointments",
      },
      (payload) => {
        const newRecord = payload.new as Appointment;
        callback(newRecord);
      }
    )
    .subscribe();

  return () => {
    subscription.unsubscribe();
  };
}
