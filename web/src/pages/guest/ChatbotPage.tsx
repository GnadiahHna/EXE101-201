import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { askChatbot, type ChatMessage } from '../../api/chatbot';
import { sanitizeChatHtml } from '../../utils/sanitize';
import '../../styles/chatbot.css';
import '../../styles/chatbot-page.css';

const TOPIC_QUESTIONS = [
  { icon: '📅', text: 'Hướng dẫn quy trình đặt lịch khám bệnh' },
  { icon: '👨‍⚕️', text: 'Danh sách các bác sĩ và chuyên khoa nổi bật' },
  { icon: '⏰', text: 'Thời gian làm việc và khung giờ khám' },
  { icon: '💳', text: 'Hình thức thanh toán và bảo hiểm y tế' },
  { icon: '🎟️', text: 'Chính sách ưu đãi và voucher giảm giá' },
];

export default function ChatbotPage() {
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
        text: 'Xin lỗi, đã có lỗi kết nối tạm thời đến hệ thống AI. Vui lòng bấm thử lại hoặc liên hệ hotline phòng khám.',
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

  const handleNewChat = () => {
    setMessages([
      {
        id: '1',
        text: 'Xin chào! Tôi là Trợ lý Y tế AI của Nano Clinic. Tôi có thể hỗ trợ bạn tìm kiếm thông tin bác sĩ, giải đáp dịch vụ, tra cứu lịch khám và hỗ trợ đặt lịch hẹn nhanh chóng. Bạn cần tư vấn về vấn đề gì?',
        isUser: false,
        timestamp: new Date(),
      },
    ]);
  };

  return (
    <div className="chatbot-page">
      {/* Topbar */}
      <header className="chatbot-page__topbar">
        <div className="chatbot-page__brand">
          <div className="chatbot-page__brand-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="10" rx="2" />
              <circle cx="12" cy="5" r="2" />
              <path d="M12 7v4" />
              <line x1="8" y1="16" x2="8" y2="16" />
              <line x1="16" y1="16" x2="16" y2="16" />
            </svg>
          </div>
          <div>
            <div className="chatbot-page__brand-title">Trợ Lý Y Tế AI - Nano Clinic</div>
            <div className="chatbot-page__brand-sub">
              <span className="status-live-dot" />
              Trực tuyến sẵn sàng tư vấn
            </div>
          </div>
        </div>

        <div className="chatbot-page__actions">
          <Link to="/" className="chatbot-page__btn-back">
            <span>← Quay lại trang chủ</span>
          </Link>
          <Link to="/appointment" className="chatbot-page__btn-book">
            <span>Đặt lịch khám ngay</span>
          </Link>
        </div>
      </header>

      {/* Main Body */}
      <div className="chatbot-page__body">
        {/* Left Sidebar */}
        <aside className="chatbot-page__sidebar">
          <button
            type="button"
            className="chatbot-page__new-chat-btn"
            onClick={handleNewChat}
          >
            <span>+ Cuộc trò chuyện mới</span>
          </button>

          <div className="chatbot-page__sidebar-card">
            <div className="chatbot-page__sidebar-title">Chủ đề thường gặp</div>
            <div className="chatbot-page__topics-list">
              {TOPIC_QUESTIONS.map((topic, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="chatbot-page__topic-item"
                  onClick={() => sendMessage(topic.text)}
                >
                  <span>{topic.icon}</span>
                  <span>{topic.text}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="chatbot-page__hotline-box">
            <div>Cần hỗ trợ khẩn cấp?</div>
            <div className="chatbot-page__hotline-number">📞 1900 6868</div>
            <div className="mt-1 small text-muted">Hoạt động từ 07:00 - 21:00 hàng ngày</div>
          </div>
        </aside>

        {/* Central Chat Panel */}
        <main className="chatbot-page__main">
          <div className="chatbot-page__messages">
            {messages.length === 1 && (
              <div className="chatbot-page__welcome-box">
                <div className="chatbot-page__welcome-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                </div>
                <h2 className="chatbot-page__welcome-title">Chào bạn! Tôi có thể giúp gì cho bạn?</h2>
                <p className="chatbot-page__welcome-desc">
                  Đặt câu hỏi về bác sĩ, chuyên khoa hoặc dịch vụ của phòng khám. Tôi được huấn luyện để phản hồi nhanh chóng và chính xác.
                </p>
              </div>
            )}

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

          {/* Bottom Input */}
          <div className="chatbot-page__input-container">
            <div className="chatbot-page__input-wrap">
              <input
                ref={inputRef}
                type="text"
                className="chatbot-page__input"
                placeholder="Nhập câu hỏi về sức khỏe, bác sĩ hoặc quy trình khám bệnh..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isLoading}
              />
              <button
                type="button"
                className={`chatbot-page__send-btn ${inputValue.trim() ? 'has-text' : ''}`}
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
                aria-label="Gửi"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
            <div className="chatbot-page__disclaimer">
              * Lưu ý: Trợ lý AI cung cấp thông tin tư vấn tham khảo. Không thay thế chẩn đoán chuyên môn của bác sĩ.
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
