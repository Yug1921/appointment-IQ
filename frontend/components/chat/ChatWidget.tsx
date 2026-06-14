"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, X, Send, Trash2, CheckCircle, Calendar, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useChatStore } from "@/store/chatStore";
import { useAppointmentStore } from "@/store/appointmentStore";
import { sendChatMessage, ChatResponse, ChatMessage, BookingIntent } from "@/lib/api";
import { cn } from "@/lib/utils";

// ── Typing dots ───────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3 rounded-2xl rounded-bl-sm" style={{ background: "#1A1A24", width: "fit-content" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block rounded-full"
          style={{
            width: 6,
            height: 6,
            background: "#9090A8",
            animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }`}</style>
    </div>
  );
}

// ── Booking confirmed card ────────────────────────────────────────────────────
function BookingConfirmedCard({ intent }: { intent: BookingIntent }) {
  if (!intent?.requested_datetime) return null;
  const dt = parseISO(intent.requested_datetime);
  return (
    <div
      className="mt-2 p-3 rounded-lg border"
      style={{ background: "rgba(34,197,94,0.08)", borderColor: "rgba(34,197,94,0.25)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <CheckCircle size={13} style={{ color: "#22C55E" }} />
        <span className="text-xs font-semibold" style={{ color: "#22C55E" }}>
          Appointment Booked
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {intent.name && (
          <p className="text-xs" style={{ color: "#9090A8" }}>
            <span style={{ color: "#F4F4F6" }}>{intent.name}</span>
            {intent.email && <span> · {intent.email}</span>}
          </p>
        )}
        {intent.purpose && (
          <p className="text-xs" style={{ color: "#9090A8" }}>
            Purpose: <span style={{ color: "#F4F4F6" }}>{intent.purpose}</span>
          </p>
        )}
        <div className="flex items-center gap-3 mt-1">
          <span className="flex items-center gap-1 text-xs" style={{ color: "#9090A8" }}>
            <Calendar size={11} />
            {format(dt, "MMM d, yyyy")}
          </span>
          <span className="flex items-center gap-1 text-xs" style={{ color: "#9090A8" }}>
            <Clock size={11} />
            {format(dt, "h:mm a")}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Suggested slot chips ──────────────────────────────────────────────────────
function SuggestedSlots({
  slots,
  onSelect,
}: {
  slots: string[];
  onSelect: (text: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {slots.map((slot) => {
        const dt = parseISO(slot);
        const label = `${format(dt, "MMM d")} at ${format(dt, "h:mm a")}`;
        return (
          <button
            key={slot}
            onClick={() => onSelect(`Book me ${label}`)}
            className="text-xs px-2.5 py-1 rounded-md border transition-all"
            style={{ background: "rgba(99,102,241,0.12)", borderColor: "#6366F1", color: "#A78BFA" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.22)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.12)")}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({
  msg,
  intent,
  onSlotSelect,
}: {
  msg: ChatMessage;
  intent?: BookingIntent;
  onSlotSelect: (text: string) => void;
}) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
      {!isUser && (
        <div
          className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-1"
          style={{ background: "rgba(99,102,241,0.2)" }}
        >
          <Bot size={12} style={{ color: "#6366F1" }} />
        </div>
      )}
      <div className={cn("max-w-[80%]", isUser ? "items-end" : "items-start") + " flex flex-col"}>
        <div
          className="px-3.5 py-2.5 text-sm leading-relaxed"
          style={{
            background: isUser ? "#6366F1" : "#1A1A24",
            color: "#F4F4F6",
            borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          }}
        >
          {msg.content}
        </div>

        {/* booking confirmed card */}
        {intent?.action === "confirm" && <BookingConfirmedCard intent={intent} />}

        {/* suggested slot chips */}
        {intent?.action === "suggest" && intent?.suggested_slots && intent.suggested_slots.length > 0 && (
          <SuggestedSlots slots={intent.suggested_slots} onSelect={onSlotSelect} />
        )}

        <span className="text-xs mt-1 px-1" style={{ color: "#5A5A70" }}>
          {format(parseISO(msg.timestamp), "h:mm a")}
        </span>
      </div>
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────
export default function ChatWidget() {
  const { messages, isTyping, isOpen, toggleChat, clearMessages } = useChatStore();
  const { fetchAppointments } = useAppointmentStore();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [intentMap, setIntentMap] = useState<Record<number, BookingIntent>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasMessages = messages.length > 0;

  // scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // focus input when chat opens
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 300);
  }, [isOpen]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);

    // add user message immediately
    useChatStore.getState().addMessage({
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    });

    try {
      const response: ChatResponse = await sendChatMessage(text, messages);

      // add assistant message
      const assistantIndex = useChatStore.getState().messages.length;
      useChatStore.getState().addMessage({
        role: "assistant",
        content: response.reply,
        timestamp: new Date().toISOString(),
      });

      // store intent keyed to this assistant message index
      if (response.booking_intent) {
        setIntentMap((prev) => ({ ...prev, [assistantIndex]: response.booking_intent as BookingIntent }));
        if (response.booking_intent.action === "confirm") {
          fetchAppointments();
        }
      }
    } catch {
      useChatStore.getState().addMessage({
        role: "assistant",
        content: "Something went wrong. Please try again.",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSlotSelect(text: string) {
    setInput(text);
    inputRef.current?.focus();
  }

const WELCOME = `Hi! I'm your AppointmentIQ assistant. Tell me when you'd like to book — for example:

"Book a meeting with Ajay on Friday at 2pm for a project review"

Please provide the following details:
• Full Name
• Email Address
• Purpose (e.g., Project Review, Onboarding, Client Meeting)
• Preferred Date
• Duration

I'll check availability and handle the rest.`;

  return (
    <>
      {/* FAB toggle button */}
      <div className="fixed bottom-6 right-6 z-50">
        <AnimatePresence>
          {!isOpen && !hasMessages && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1 -right-1 w-3 h-3 rounded-full"
              style={{ background: "#6366F1", animation: "ping 1.5s ease-in-out infinite" }}
            />
          )}
        </AnimatePresence>
        <style>{`@keyframes ping{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.8);opacity:0}}`}</style>

        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={toggleChat}
          className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
          style={{ background: "#6366F1" }}
        >
          <AnimatePresence mode="wait">
            {isOpen ? (
              <motion.div key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
                <X size={18} color="#fff" />
              </motion.div>
            ) : (
              <motion.div key="bot" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
                <Bot size={18} color="#fff" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="fixed bottom-24 right-6 z-50 flex flex-col rounded-2xl overflow-hidden"
            style={{
              width: 380,
              height: 520,
              background: "#111118",
              border: "1px solid #2A2A38",
              boxShadow: "0 24px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.1)",
            }}
          >
            {/* header */}
            <div
              className="flex items-center justify-between px-4 py-3 shrink-0"
              style={{ borderBottom: "1px solid #2A2A38" }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(99,102,241,0.2)" }}
                >
                  <Bot size={14} style={{ color: "#6366F1" }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#F4F4F6" }}>
                    AI Assistant
                  </p>
                  <p className="text-xs" style={{ color: "#5A5A70" }}>
                    AppointmentIQ · Llama 3.3 70B
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {hasMessages && (
                  <button
                    onClick={clearMessages}
                    className="p-1.5 rounded-md transition-colors"
                    style={{ color: "#5A5A70" }}
                    title="Clear chat"
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#EF4444")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#5A5A70")}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                <button
                  onClick={toggleChat}
                  className="p-1.5 rounded-md transition-colors"
                  style={{ color: "#5A5A70" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#F4F4F6")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#5A5A70")}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
              {/* welcome message */}
              {!hasMessages && (
                <div className="flex gap-2">
                  <div
                    className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-1"
                    style={{ background: "rgba(99,102,241,0.2)" }}
                  >
                    <Bot size={12} style={{ color: "#6366F1" }} />
                  </div>
                  <div
                    className="px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line"
                    style={{
                      background: "#1A1A24",
                      color: "#F4F4F6",
                      borderRadius: "16px 16px 16px 4px",
                      maxWidth: "80%",
                    }}
                  >
                    {WELCOME}
                  </div>
                </div>
              )}

              {/* actual messages */}
              {messages.map((msg, i) => (
                <MessageBubble
                  key={i}
                  msg={msg}
                  intent={intentMap[i]}
                  onSlotSelect={handleSlotSelect}
                />
              ))}

              {/* typing indicator */}
              {(isTyping || sending) && (
                <div className="flex gap-2">
                  <div
                    className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(99,102,241,0.2)" }}
                  >
                    <Bot size={12} style={{ color: "#6366F1" }} />
                  </div>
                  <TypingDots />
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* input */}
            <div
              className="px-3 py-3 shrink-0"
              style={{ borderTop: "1px solid #2A2A38" }}
            >
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-2"
                style={{ background: "#1A1A24", border: "1px solid #2A2A38" }}
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Book Friday at 3pm for Alex…"
                  disabled={sending}
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: "#F4F4F6" }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
                  style={{ background: "#6366F1" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#4F46E5")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "#6366F1")}
                >
                  <Send size={12} color="#fff" />
                </button>
              </div>
              <p className="text-center mt-2 text-xs" style={{ color: "#3A3A50" }}>
                Enter to send · Shift+Enter for newline
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}