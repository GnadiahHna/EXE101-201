import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { askChatbot, type ChatMessage, type SuggestedSlot } from '../../api/chatbot';
import { useAppt } from '../../contexts/AppointmentContext';
import '../../styles/chatbot.css';

const QUICK_PROMPTS = [
  { icon: '🩺', text: 'Đặt lịch khám nhanh thế nào?' },
  { icon: '👨‍⚕️', text: 'Bác sĩ chuyên khoa nổi bật' },
  { icon: '⏰', text: 'Giờ làm việc của phòng khám' },
  { icon: '🎟️', text: 'Ưu đãi và voucher hiện có' },
];

export default function Chatbot() {
  const navigate = useNavigate();
  const apptContext = useAppt();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showTooltip, setShowTooltip] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      text: 'Xin chào! Tôi là trợ lý ảo của Nano Clinic. Tôi có thể hỗ trợ phân luồng triệu chứng y tế ban đầu và cung cấp thông tin lịch khám. Bạn cần hỗ trợ gì hôm nay?',
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

  const handleSelectSlot = (slot: SuggestedSlot, specialtyId?: number | null) => {
    if (apptContext?.dispatch) {
      if (specialtyId) {
        apptContext.dispatch({ type: 'SET_SPECIALTY', id: specialtyId, name: slot.specialtyName });
      }
      apptContext.dispatch({
        type: 'SET_DOCTOR',
        id: slot.doctorId,
        fullName: slot.doctorName,
      });
      apptContext.dispatch({ type: 'SET_DATE', value: slot.date });
      apptContext.dispatch({
        type: 'SET_SHIFT',
        id: slot.shiftId,
        slotId: slot.slotId,
        slotStartTime: slot.startTime,
        slotEndTime: slot.endTime,
        slotNumber: slot.slotNumber,
      });
      apptContext.dispatch({ type: 'SET_STEP', step: 3 });
    }
    setIsOpen(false);
    navigate('/appointment');
  };

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
      const history = messages.slice(-4).map((m) => ({
        role: m.isUser ? 'user' : 'model',
        text: m.text,
      }));

      const res = await askChatbot(userMessage.text, history);
      const botMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: res.answer,
        isUser: false,
        timestamp: new Date(),
        urgency: res.urgency,
        suggestedSlots: res.suggestedSlots,
        actions: res.actions,
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: 'Xin lỗi, đã có lỗi kết nối tạm thời. Vui lòng bấm thử lại hoặc gọi hotline phòng khám.',
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

      {/* Floating Chat Button (Nguyên bản của dự án) */}
      <button
        type="button"
        className={`chatbot-button ${isOpen ? 'chatbot-button--hidden' : ''}`}
        onClick={handleToggle}
        aria-label="Mở trợ lý ảo Nano Clinic"
      >
        <span className="chatbot-btn-online-badge" />
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      {/* Floating Chat Modal (Nguyên bản của dự án) */}
      {isOpen && (
        <div
          className={`chatbot-modal ${isMinimized ? 'chatbot-modal--minimized' : ''}`}
          role="dialog"
          aria-label="Trợ lý ảo Nano Clinic"
        >
          {/* Header */}
          <div className="chatbot-header">
            <div className="chatbot-header__info">
              <div className="chatbot-header__avatar" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </div>
              <div>
                <div className="chatbot-header__title">Trợ lý ảo Nano Clinic</div>
                <div className="chatbot-header__status">
                  <span className="status-live-dot" />
                  Trực tuyến 24/7 (AI Triage)
                </div>
              </div>
            </div>
            <div className="chatbot-header__actions">
              <button
                type="button"
                className="chatbot-header__btn"
                onClick={() => setIsMinimized(!isMinimized)}
                title={isMinimized ? 'Mở rộng' : 'Thu nhỏ'}
                aria-label={isMinimized ? 'Mở rộng' : 'Thu nhỏ'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              <button
                type="button"
                className="chatbot-header__btn"
                onClick={handleClose}
                title="Đóng chat"
                aria-label="Đóng chat"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Message List */}
              <div className="chatbot-messages">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`chatbot-message ${message.isUser ? 'chatbot-message--user' : 'chatbot-message--bot'}`}
                  >
                    {!message.isUser && (
                      <div className="chatbot-bot-avatar-mini" aria-hidden="true">
                        {message.urgency === 'emergency' ? '🚨' : 'AI'}
                      </div>
                    )}
                    <div className="chatbot-message__bubble-container">
                      {/* Emergency Warning Banner */}
                      {message.urgency === 'emergency' && (
                        <div className="alert alert-danger p-2 mb-2 rounded border border-danger small">
                          <strong className="d-block text-danger">⚠️ TÌNH TRẠNG CẤP CỨU!</strong>
                          <span>Gọi ngay 115 hoặc đến khoa Cấp cứu gần nhất.</span>
                          <a href="tel:115" className="btn btn-danger btn-sm text-white d-block mt-1 fw-bold">
                            Gọi 115 ngay
                          </a>
                        </div>
                      )}

                      <div
                        className={`chatbot-message__content ${
                          message.isError ? 'chatbot-message__content--error' : ''
                        } ${message.urgency === 'emergency' ? 'border border-danger' : ''}`}
                      >
                        {message.isUser ? (
                          message.text
                        ) : (
                          <div className="chatbot-markdown">
                            <Markdown rehypePlugins={[rehypeSanitize]}>{message.text}</Markdown>
                          </div>
                        )}
                      </div>

                      {/* Suggested Slots */}
                      {message.suggestedSlots && message.suggestedSlots.length > 0 && (
                        <div className="mt-2 p-2 bg-light rounded border">
                          <div className="small fw-bold text-primary mb-1">📅 Khung giờ khám gợi ý:</div>
                          <div className="d-flex flex-column gap-1">
                            {message.suggestedSlots.map((slot) => (
                              <button
                                key={slot.shiftId}
                                type="button"
                                className="btn btn-outline-primary btn-sm text-start py-1"
                                onClick={() => handleSelectSlot(slot, message.suggestedSlots?.[0]?.shiftId)}
                              >
                                <strong>{slot.date} ({slot.startTime} - {slot.endTime})</strong>
                                <div className="text-muted small">{slot.doctorName}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

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
                          <a href="tel:19001234" className="chatbot-hotline-btn">
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
                  maxLength={1000}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyPress}
                  disabled={isLoading}
                  aria-label="Nhập câu hỏi"
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

              <div className="text-center p-1 text-muted bg-white border-top small" style={{ fontSize: '11px' }}>
                Thông tin tham khảo, không thay thế chẩn đoán bác sĩ.
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
