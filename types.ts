
export interface ChatMessage {
  timestamp: string;
  sender: string;
  text: string;
  isMe?: boolean;
  mediaUrl?: string;
  isViewOnce?: boolean;
}

export interface LocalStats {
  totalMessages: number;
  participants: { [name: string]: number };
  mediaCount: number;
  wordCount: number;
  topWords: [string, number][];
}

export interface ChatState {
  rawText: string;
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  stats: LocalStats | null;
}
