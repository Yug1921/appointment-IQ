import { create } from "zustand";
import { sendChatMessage as sendChatMessageAPI, ChatMessage } from "@/lib/api";

interface ChatStore {
  messages: ChatMessage[];
  isTyping: boolean;
  isOpen: boolean;
  addMessage: (message: ChatMessage) => void;
  setTyping: (typing: boolean) => void;
  toggleChat: () => void;
  clearMessages: () => void;
  sendMessage: (text: string) => Promise<void>;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  isTyping: false,
  isOpen: false,

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  setTyping: (typing) => set({ isTyping: typing }),

  toggleChat: () => set((state) => ({ isOpen: !state.isOpen })),

  clearMessages: () => set({ messages: [] }),

  sendMessage: async (text: string) => {
    const state = get();

    // Add user message
    const userMessage: ChatMessage = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isTyping: true,
    }));

    try {
      const response = await sendChatMessageAPI(text, state.messages);

      // Add assistant message
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: response.reply,
        timestamp: new Date().toISOString(),
      };

      set((state) => ({
        messages: [...state.messages, assistantMessage],
        isTyping: false,
      }));
    } catch (error) {
      console.error("Failed to send chat message:", error);
      set({ isTyping: false });

      // Add error message
      const errorMessage: ChatMessage = {
        role: "assistant",
        content:
          "Sorry, I encountered an error. Please try again in a moment.",
        timestamp: new Date().toISOString(),
      };

      set((state) => ({
        messages: [...state.messages, errorMessage],
      }));
    }
  },
}));
