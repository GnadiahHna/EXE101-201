import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { askChatbot, type ChatMessage, type SuggestedSlot } from '../../api/chatbot';
import { useAppt } from '../../contexts/AppointmentContext';
import '../../styles/chatbot.css';
import '../../styles/chatbot-page.css';

const TOPIC_QUESTIONS = [
  { icon: '📅', text: 'Hướng dẫn quy trình đặt lịch khám bệnh' },
  { icon: '👨‍⚕️', text: 'Phòng khám có những chuyên khoa nào?' },
  { icon: '⏰', text: 'Thời gian làm việc của phòng khám' },
  { icon: '💳', text: 'Bảng giá và chi phí khám bệnh' },
  { icon: '🎟️', text: 'Ưu đãi và voucher giảm giá hiện có' },
];

export default function ChatbotPage() {
  const navigate = useNavigate();
  const { dispatch } = useAppt();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      text: 'Xin chào! Tôi là Trợ lý Y tế AI của Nano Clinic. Tôi có thể hỗ trợ bạn tìm kiếm thông tin bác sĩ, giải đáp dịch vụ, tra cứu lịch khám và hỗ trợ đặt lịch hẹn nhanh chóng. Bạn cần tư vấn về vấn đề gì?',
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
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSelectSlot = (slot: SuggestedSlot, specialtyId?: number | null) => {
    // Populate AppointmentContext
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
    dispatch({ type: 'SET_STEP', step: 3 }); // Advance directly to patient info step
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
      // Build lightweight conversation history
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
        text: 'Xin lỗi, đã có lỗi kết nối tạm thời đến hệ thống trợ lý ảo. Vui lòng bấm thử lại hoặc gọi hotline phòng khám.',
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
    <div className="cb-page-wrapper">
      <div className="cb-page-container">
        {/* Header */}
        <div className="cb-header">
          <div className="cb-header-title">
            <span className="cb-header-icon" aria-hidden="true">🩺</span>
            <div>
              <h1>Trợ Lý Y Tế AI - Nano Clinic</h1>
              <p>Tư vấn triệu chứng ban đầu, phân luồng chuyên khoa và thông tin phòng khám</p>
            </div>
          </div>
          <button
            type="button"
            className="cb-header-btn"
            onClick={() => setMessages([messages[0]])}
            title="Bắt đầu hội thoại mới"
          >
            Cuộc trò chuyện mới
          </button>
        </div>

        {/* Chat Area */}
        <div className="cb-chat-area" role="log" aria-live="polite">
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
                {/* Emergency Red Banner */}
                {message.urgency === 'emergency' && (
                  <div className="alert alert-danger d-flex align-items-center mb-2 p-2 rounded shadow-sm border border-danger">
                    <span className="fs-4 me-2">🚨</span>
                    <div className="flex-grow-1">
                      <strong className="d-block text-danger">TÌNH TRẠNG CẤP CỨU Y TẾ!</strong>
                      <span className="small">Vui lòng gọi ngay 115 hoặc đến bệnh viện gần nhất.</span>
                    </div>
                    <a
                      href="tel:115"
                      className="btn btn-danger btn-sm text-white fw-bold px-3 py-1 ms-2"
                    >
                      Gọi 115
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
                    <div className="small fw-bold text-primary mb-2">
                      📅 Lịch khám trống phù hợp với triệu chứng của bạn:
                    </div>
                    <div className="d-flex flex-wrap gap-2">
                      {message.suggestedSlots.map((slot) => (
                        <button
                          key={`${slot.shiftId}-${slot.slotId}`}
                          type="button"
                          className="btn btn-outline-primary btn-sm text-start"
                          onClick={() => handleSelectSlot(slot, message.suggestedSlots?.[0]?.shiftId)}
                        >
                          <div className="fw-bold">{slot.date} | {slot.startTime} - {slot.endTime}</div>
                          <div className="small text-muted">{slot.doctorName}</div>
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

        {/* Quick Topic Chips */}
        <div className="cb-topic-chips" role="group" aria-label="Câu hỏi gợi ý">
          {TOPIC_QUESTIONS.map((topic, i) => (
            <button
              key={i}
              type="button"
              className="cb-chip-btn"
              onClick={() => sendMessage(topic.text)}
              disabled={isLoading}
            >
              <span>{topic.icon}</span> {topic.text}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="cb-input-bar">
          <input
            ref={inputRef}
            type="text"
            className="cb-input-field"
            placeholder="Mô tả triệu chứng hoặc câu hỏi về phòng khám (tối đa 1000 ký tự)..."
            value={inputValue}
            maxLength={1000}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            disabled={isLoading}
            aria-label="Nhập câu hỏi cho trợ lý y tế"
          />
          <button
            type="button"
            className="cb-send-btn"
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            aria-label="Gửi tin nhắn"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>

        {/* Static Disclaimer */}
        <div className="cb-disclaimer text-center py-2 px-3 small text-muted border-top bg-white">
          ⚠️ <strong>Lưu ý quan trọng:</strong> Trợ lý AI chỉ cung cấp thông tin phân luồng và tư vấn sơ bộ, không thay thế chẩn đoán y khoa của bác sĩ. Trong trường hợp nguy kịch, hãy gọi <strong>115</strong> ngay lập tức.
        </div>
      </div>
    </div>
  );
}
