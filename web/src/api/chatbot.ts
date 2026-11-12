import { http } from './http';

export type UrgencyLevel = 'emergency' | 'urgent' | 'routine' | 'info';

export interface SuggestedSlot {
  shiftId: number;
  slotId: number;
  slotNumber: number;
  date: string;
  startTime: string;
  endTime: string;
  doctorId: number;
  doctorName: string;
  specialtyName?: string;
}

export interface ChatAction {
  type: string;
  label: string;
  value?: string;
}

export interface ChatResponseData {
  answer: string;
  intent: string;
  urgency: UrgencyLevel;
  specialtyId?: number | null;
  suggestedSlots?: SuggestedSlot[];
  actions?: ChatAction[];
  redFlags?: string[];
  needsMoreInfo?: boolean;
}

export interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  isError?: boolean;
  retryText?: string;
  urgency?: UrgencyLevel;
  suggestedSlots?: SuggestedSlot[];
  actions?: ChatAction[];
}

export async function askChatbot(
  message: string,
  history: Array<{ role: string; text: string }> = [],
  sessionId?: string
): Promise<ChatResponseData> {
  try {
    const response = await http.post<{ success: boolean; data: ChatResponseData }>('/chat/ask', {
      message,
      history,
      sessionId,
    });
    return response.data.data;
  } catch (error) {
    console.error('Chatbot API error:', error);
    throw error;
  }
}
