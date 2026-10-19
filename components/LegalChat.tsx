import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage } from '../types';
import { createLegalChat } from '../services/gemini';
import { Send, User, Loader2, Scale } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { ChatSession as Chat } from '../services/aiClient';
import { AI_SETTINGS_EVENT } from '../services/aiSettings';

const SUGGESTIONS = [
  'Thành lập công ty TNHH 1 thành viên cần những giấy tờ gì?',
  'Chuyển trụ sở sang tỉnh khác thì làm thủ tục thế nào?',
  'Hộ kinh doanh có phải nộp lệ phí môn bài không?',
  'Tăng vốn điều lệ phải thông báo trong bao lâu?',
];

const LegalChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      text: 'Xin chào! Tôi là trợ lý pháp lý AI. Tôi có thể giúp gì cho bạn về thủ tục thành lập doanh nghiệp hoặc các vấn đề pháp lý liên quan?',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatSession = useRef<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Tạo phiên chat khi mở; nếu chưa có key thì để tạo lúc gửi tin nhắn đầu tiên
    try {
      chatSession.current = createLegalChat();
    } catch {
      chatSession.current = null;
    }
    // Đổi API key / model trong "Cài đặt API" -> tạo phiên chat mới với cấu hình mới
    const reset = () => { chatSession.current = null; };
    window.addEventListener(AI_SETTINGS_EVENT, reset);
    return () => window.removeEventListener(AI_SETTINGS_EVENT, reset);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (preset?: string) => {
    const question = (preset ?? input).trim();
    if (!question || loading) return;
    if (!chatSession.current) {
      try {
        chatSession.current = createLegalChat();
      } catch (e: any) {
        setMessages(prev => [...prev, { role: 'model', text: `**Không gửi được câu hỏi.** ${e?.message || e}`, timestamp: new Date() }]);
        return;
      }
    }

    const userMsg: ChatMessage = {
      role: 'user',
      text: question,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const result = await chatSession.current!.sendMessage({ message: userMsg.text });
      const modelMsg: ChatMessage = {
        role: 'model',
        text: result.text || 'Xin lỗi, tôi không thể trả lời lúc này.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, modelMsg]);
    } catch (error: any) {
      console.error("Chat error:", error);
      const errorMsg: ChatMessage = {
        role: 'model',
        text: error?.message
          ? `**Không nhận được câu trả lời.** ${error.message}`
          : 'Đã xảy ra lỗi kết nối. Vui lòng thử lại sau.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100dvh-88px)] sm:h-[calc(100dvh-104px)] lg:h-[calc(100dvh-64px)] flex flex-col">
       <header className="mb-6 flex-shrink-0">
        <h2 className="text-3xl font-bold text-slate-800">Trợ lý pháp lý AI</h2>
        <p className="text-slate-500 mt-2">Hỏi đáp trực tiếp về Luật Doanh nghiệp, thuế và thủ tục hành chính.</p>
      </header>

      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
          {messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            return (
              <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex gap-3 max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isUser ? 'bg-slate-700' : 'bg-blue-50 border border-blue-200'}`}>
                    {isUser ? <User className="w-4 h-4 text-white" /> : <Scale className="w-4 h-4 text-blue-700" />}
                  </div>
                  <div className={`p-4 rounded-2xl shadow-sm ${isUser ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border border-slate-200'}`}>
                    <div className={`prose ${isUser ? 'prose-invert' : 'prose-slate'} max-w-none text-sm`}>
                       <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                    <span className={`text-[10px] mt-2 block opacity-70 ${isUser ? 'text-blue-100' : 'text-slate-400'}`}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {messages.length === 1 && !loading && (
            <div className="pl-11">
              <p className="text-sm text-slate-500 mb-2">Câu hỏi thường gặp</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    className="text-left text-sm px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-blue-400 hover:text-blue-800 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {loading && (
            <div className="flex justify-start">
               <div className="flex gap-3 max-w-[80%]">
                  <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
                    <Scale className="w-4 h-4 text-blue-700" />
                  </div>
                  <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-slate-200 shadow-sm flex items-center gap-2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce delay-0"></div>
                      <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce delay-150"></div>
                      <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce delay-300"></div>
                    </div>
                  </div>
               </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-slate-200">
          <div className="relative flex items-center gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nhập câu hỏi của bạn..."
              className="w-full p-3 pr-12 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none max-h-32 min-h-[50px] custom-scrollbar"
              rows={1}
            />
            <button
              onClick={() => handleSend()}
              aria-label="Gửi câu hỏi"
              disabled={loading || !input.trim()}
              className="absolute right-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-xs text-center text-slate-400 mt-2">
            AI có thể mắc lỗi. Vui lòng kiểm tra lại thông tin quan trọng.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LegalChat;