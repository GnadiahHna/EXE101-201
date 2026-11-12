import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { askChatbot, type ChatMessage } from '../../api/chatbot';
import { sanitizeChatHtml } from '../../utils/sanitize';
import '../../styles/chatbot.css';

const QUICK_PROMPTS = [
  { icon: '🩺', text: 'Đặt lịch khám nhanh thế nào?' },
  { icon: '👨‍⚕️', text: 'Bác sĩ chuyên khoa nổi bật' },
  { icon: '⏰', text: 'Giờ làm việc của phòng khám' },
  { icon: '🎟️', text: 'Ưu đãi và voucher hiện có' },
];

export default function Chatbot() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showTooltip, setShowTooltip] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      text: 'Xin chào! Tôi là trợ lý ảo của Nano Clinic. Tôi có thể giúp bạn tìm thông tin về bác sĩ, chuyên khoa, lịch khám và dịch vụ y tế. Bạn cần hỗ trợ gì hôm nay?',
      isUser: false,
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowTooltip(false);
    }, 7000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      scrollToBottom();
      setTimeout(() => {
        inputRef.current?.focus();
      }, 120);
    }
  }, [messages, isOpen, isMinimized]);

  const sendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      text: textToSend.trim(),
      isUser: true,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await askChatbot(userMessage.text);
      const isUnavailable = response.includes('Xin lỗi bạn, trợ lý AI hiện');
      const botMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: response,
        isUser: false,
        timestamp: new Date(),
        isError: isUnavailable,
        retryText: isUnavailable ? userMessage.text : undefined,
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: 'Xin lỗi, đã có lỗi kết nối tạm thời. Vui lòng bấm thử lại hoặc liên hệ hotline phòng khám.',
        isUser: false,
        timestamp: new Date(),
        isError: true,
        retryText: userMessage.text,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    sendMessage(inputValue);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePromptClick = (promptText: string) => {
    sendMessage(promptText);
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: '1',
        text: 'Xin chào! Tôi là trợ lý ảo của Nano Clinic. Tôi có thể giúp bạn tìm thông tin về bác sĩ, chuyên khoa, lịch khám và dịch vụ y tế. Bạn cần hỗ trợ gì hôm nay?',
        isUser: false,
        timestamp: new Date(),
      },
    ]);
  };

  const handleToggle = () => {
    if (isOpen) {
      setIsMinimized(!isMinimized);
    } else {
      setIsOpen(true);
      setIsMinimized(false);
      setShowTooltip(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setIsMinimized(false);
  };

  const handleExpandFullscreen = () => {
    setIsOpen(false);
    navigate('/chatbot');
  };

  return (
    <>
      {/* Tooltip mời trò chuyện */}
      {showTooltip && !isOpen && (
        <div className="chatbot-floating-tooltip">
          <span>👋 Cần tư vấn y tế hoặc đặt lịch? Nhắn tin với tôi nhé!</span>
          <button
            type="button"
            className="chatbot-tooltip-close"
            onClick={(e) => {
              e.stopPropagation();
              setShowTooltip(false);
            }}
            aria-label="Đóng gợi ý"
          >
            ✕
          </button>
        </div>
      )}

      {/* Floating Chat Button */}
      <button
        className={`chatbot-button ${isOpen ? 'chatbot-button--hidden' : ''}`}
        onClick={handleToggle}
        aria-label="Mở trợ lý ảo AI"
      >
        <span className="chatbot-btn-online-badge" />
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <path d="M12 7v2" />
          <path d="M12 13v.01" />
        </svg>
      </button>

      {/* Chatbot Modal */}
      {isOpen && (
        <div className={`chatbot-modal ${isMinimized ? 'chatbot-modal--minimized' : ''}`}>
          {/* Header */}
          <div className="chatbot-header">
            <div className="chatbot-header__info">
              <div className="chatbot-header__avatar">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <circle cx="12" cy="5" r="2" />
                  <path d="M12 7v4" />
                  <line x1="8" y1="16" x2="8" y2="16" />
                  <line x1="16" y1="16" x2="16" y2="16" />
                </svg>
              </div>
              <div>
                <div className="chatbot-header__title">Nano Clinic AI</div>
                <div className="chatbot-header__status">
                  <span className="status-live-dot" />
                  Trực tuyến 24/7
                </div>
              </div>
            </div>

            <div className="chatbot-header__actions">
              {/* Nút Clear Chat */}
              <button
                type="button"
                className="chatbot-header__btn"
                onClick={handleClearChat}
                title="Làm mới cuộc trò chuyện"
                aria-label="Làm mới"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
              </button>

              {/* Nút Toàn màn hình */}
              <button
                type="button"
                className="chatbot-header__btn"
                onClick={handleExpandFullscreen}
                title="Mở rộng toàn trang"
                aria-label="Mở toàn màn hình"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>

              {/* Nút Thu nhỏ */}
              <button
                type="button"
                className="chatbot-header__btn"
                onClick={handleToggle}
                title={isMinimized ? "Phóng to" : "Thu nhỏ"}
                aria-label="Thu nhỏ"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>

              {/* Nút Đóng */}
              <button
                type="button"
                className="chatbot-header__btn"
                onClick={handleClose}
                title="Đóng chat"
                aria-label="Đóng"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages Area */}
          {!isMinimized && (
            <>
              <div className="chatbot-messages">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`chatbot-message ${message.isUser ? 'chatbot-message--user' : 'chatbot-message--bot'}`}
                  >
                    {!message.isUser && (
                      <div className="chatbot-bot-avatar-mini" aria-hidden="true">
                        AI
                      </div>
                    )}
                    <div className="chatbot-message-bubble-wrapper">
                      <div
                        className={`chatbot-message__content ${message.isError ? 'chatbot-message__content--error' : ''}`}
                        dangerouslySetInnerHTML={{ __html: sanitizeChatHtml(message.text) }}
                      />
                      {message.isError && message.retryText && (
                        <div className="chatbot-message__error-actions">
                          <button
                            type="button"
                            className="chatbot-retry-btn"
                            onClick={() => sendMessage(message.retryText!)}
                            disabled={isLoading}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="1 4 1 10 7 10" />
                              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                            </svg>
                            Thử lại
                          </button>
                          <a
                            href="tel:19001234"
                            className="chatbot-hotline-btn"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                            </svg>
                            Hotline
                          </a>
                        </div>
                      )}
                      <div className="chatbot-message__time">
                        {new Date(message.timestamp).toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Quick Prompts Chips khi cuộc hội thoại mới bắt đầu */}
                {messages.length === 1 && !isLoading && (
                  <div className="chatbot-quick-prompts">
                    <div className="chatbot-quick-prompts-title">Gợi ý câu hỏi thường gặp:</div>
                    <div className="chatbot-chips-grid">
                      {QUICK_PROMPTS.map((p, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className="chatbot-prompt-chip"
                          onClick={() => handlePromptClick(p.text)}
                        >
                          <span className="chip-icon">{p.icon}</span>
                          <span>{p.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Loading indicator */}
                {isLoading && (
                  <div className="chatbot-message chatbot-message--bot">
                    <div className="chatbot-bot-avatar-mini" aria-hidden="true">
                      AI
                    </div>
                    <div className="chatbot-message__content chatbot-typing-bubble">
                      <div className="chatbot-typing-dots">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="chatbot-input-area">
                <input
                  ref={inputRef}
                  type="text"
                  className="chatbot-input"
                  placeholder="Nhập câu hỏi y tế hoặc đặt khám..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className={`chatbot-send-btn ${inputValue.trim() ? 'has-text' : ''}`}
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isLoading}
                  aria-label="Gửi tin nhắn"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
