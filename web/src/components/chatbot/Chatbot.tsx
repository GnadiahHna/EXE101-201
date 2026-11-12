import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { askChatbot, type ChatMessage, type SuggestedSlot } from '../../api/chatbot';
import { useAppt } from '../../contexts/AppointmentContext';
import '../../styles/chatbot.css';

const QUICK_PROMPTS = [
  { icon: '🩺', text: 'Hướng dẫn quy trình đặt lịch khám bệnh' },
  { icon: '👨‍⚕️', text: 'Phòng khám có những chuyên khoa nào?' },
  { icon: '⏰', text: 'Thời gian làm việc của phòng khám' },
  { icon: '🎟️', text: 'Ưu đãi và voucher hiện có' },
];

export default function Chatbot() {
  const navigate = useNavigate();
  const { dispatch } = useAppt();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showTooltip, setShowTooltip] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      text: 'Xin chào! Tôi là trợ lý ảo y tế của Nano Clinic. Tôi có thể hỗ trợ phân luồng triệu chứng ban đầu và cung cấp thông tin lịch khám. Bạn cần hỗ trợ gì hôm nay?',
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
    if (specialtyId) {
      dispatch({ type: 'SET_SPECIALTY', id: specialtyId, name: slot.specialtyName });
    }
    dispatch({
      type: 'SET_DOCTOR',
      id: slot.doctorId,
      fullName: slot.doctorName,
    });
    dispatch({ type: 'SET_DATE', value: slot.date });
    dispatch({
      type: 'SET_SHIFT',
      id: slot.shiftId,
      slotId: slot.slotId,
      slotStartTime: slot.startTime,
      slotEndTime: slot.endTime,
      slotNumber: slot.slotNumber,
    });
    dispatch({ type: 'SET_STEP', step: 3 });
    setIsOpen(false);
    navigate('/booking');
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

  return (
    <>
      {/* Floating Trigger Button */}
      {!isOpen && (
        <div className="cb-trigger-container">
          {showTooltip && (
            <div className="cb-tooltip" role="tooltip">
              <span className="cb-tooltip-text">Tư vấn triệu chứng & thông tin khám bệnh 🩺</span>
              <button
                type="button"
                className="cb-tooltip-close"
                onClick={() => setShowTooltip(false)}
                aria-label="Đóng gợi ý"
              >
                ✕
              </button>
            </div>
          )}
          <button
            type="button"
            className="cb-floating-btn"
            onClick={() => {
              setIsOpen(true);
              setIsMinimized(false);
              setShowTooltip(false);
            }}
            aria-label="Mở khung chat tư vấn y tế"
          >
            <span className="cb-btn-icon" aria-hidden="true">💬</span>
            <span className="cb-btn-pulse"></span>
          </button>
        </div>
      )}

      {/* Floating Chat Modal */}
      {isOpen && (
        <div
          className={`cb-widget ${isMinimized ? 'cb-widget-minimized' : ''}`}
          role="dialog"
          aria-label="Hộp thoại tư vấn y tế Nano Clinic"
        >
          {/* Header */}
          <div className="cb-widget-header">
            <div className="cb-header-left">
              <span className="cb-header-avatar" aria-hidden="true">🩺</span>
              <div>
                <h3 className="cb-header-name">Trợ Lý Y Tế AI</h3>
                <span className="cb-header-status">Phân luồng & Hướng dẫn</span>
              </div>
            </div>
            <div className="cb-header-actions">
              <button
                type="button"
                className="cb-action-btn"
                onClick={() => setIsMinimized(!isMinimized)}
                title={isMinimized ? 'Mở rộng' : 'Thu nhỏ'}
                aria-label={isMinimized ? 'Mở rộng' : 'Thu nhỏ'}
              >
                {isMinimized ? '□' : '—'}
              </button>
              <button
                type="button"
                className="cb-action-btn"
                onClick={() => setIsOpen(false)}
                title="Đóng chat"
                aria-label="Đóng hộp thoại chat"
              >
                ✕
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Message History */}
              <div className="cb-widget-body" role="log" aria-live="polite">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`cb-msg-row ${message.isUser ? 'cb-msg-user' : 'cb-msg-bot'}`}
                  >
                    {!message.isUser && (
                      <div className="cb-avatar" aria-hidden="true">
                        {message.urgency === 'emergency' ? '🚨' : '🤖'}
                      </div>
                    )}
                    <div className="cb-bubble-wrapper">
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

                      <div className={`cb-bubble ${message.urgency === 'emergency' ? 'border border-danger' : ''}`}>
                        {message.isUser ? (
                          message.text
                        ) : (
                          <div className="cb-markdown-content">
                            <Markdown rehypePlugins={[rehypeSanitize]}>{message.text}</Markdown>
                          </div>
                        )}
                      </div>

                      {/* Suggested Slots */}
                      {message.suggestedSlots && message.suggestedSlots.length > 0 && (
                        <div className="mt-2 p-2 bg-light rounded border">
                          <div className="small fw-bold text-primary mb-1">📅 Khung giờ khám còn trống:</div>
                          <div className="d-flex flex-column gap-1">
                            {message.suggestedSlots.map((slot) => (
                              <button
                                key={`${slot.shiftId}-${slot.slotId}`}
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
                        <button
                          type="button"
                          className="cb-retry-btn"
                          onClick={() => sendMessage(message.retryText!)}
                        >
                          🔄 Thử lại
                        </button>
                      )}
                      <span className="cb-timestamp">
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="cb-msg-row cb-msg-bot">
                    <div className="cb-avatar" aria-hidden="true">🤖</div>
                    <div className="cb-bubble-wrapper">
                      <div className="cb-typing-indicator" aria-label="Trợ lý đang phản hồi">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Prompts */}
              <div className="cb-quick-prompts">
                {QUICK_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    type="button"
                    className="cb-quick-btn"
                    onClick={() => sendMessage(prompt.text)}
                    disabled={isLoading}
                  >
                    <span>{prompt.icon}</span> {prompt.text}
                  </button>
                ))}
              </div>

              {/* Footer Input */}
              <div className="cb-widget-footer">
                <input
                  ref={inputRef}
                  type="text"
                  className="cb-input"
                  placeholder="Nhập triệu chứng hoặc câu hỏi..."
                  value={inputValue}
                  maxLength={1000}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyPress}
                  disabled={isLoading}
                  aria-label="Nhập câu hỏi"
                />
                <button
                  type="button"
                  className="cb-send-action-btn"
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isLoading}
                  aria-label="Gửi"
                >
                  ➤
                </button>
              </div>

              <div className="cb-disclaimer-tiny text-center p-1 text-muted bg-white border-top">
                Thông tin tham khảo, không thay thế chẩn đoán bác sĩ.
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
