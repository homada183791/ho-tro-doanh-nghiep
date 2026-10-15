import React, { useEffect, useState } from 'react';
import { Hourglass } from 'lucide-react';
import { AI_WAIT_EVENT } from '../services/aiClient';

/** Thông báo nhỏ góc dưới khi app đang chờ hạn mức của nhà cung cấp AI rồi tự gửi lại. */
const AiWaitToast: React.FC = () => {
  const [until, setUntil] = useState<number | null>(null);
  const [reason, setReason] = useState<'rpm' | 'quota'>('quota');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const onWait = (e: Event) => {
      const { seconds, reason } = (e as CustomEvent).detail || {};
      const end = Date.now() + (Number(seconds) || 0) * 1000;
      setUntil((prev) => (prev && prev > end ? prev : end));
      setReason(reason === 'rpm' ? 'rpm' : 'quota');
    };
    window.addEventListener(AI_WAIT_EVENT, onWait);
    return () => window.removeEventListener(AI_WAIT_EVENT, onWait);
  }, []);

  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= until) setUntil(null);
    }, 500);
    return () => clearInterval(t);
  }, [until]);

  if (!until || now >= until) return null;
  const left = Math.max(1, Math.ceil((until - now) / 1000));

  return (
    <div className="fixed bottom-5 right-5 z-40 max-w-sm flex gap-3 items-start bg-amber-50 border border-amber-200 text-amber-900 rounded-xl shadow-lg px-4 py-3">
      <Hourglass className="w-5 h-5 mt-0.5 shrink-0 animate-pulse" />
      <div className="text-sm">
        <p className="font-semibold">Đang chờ {left} giây rồi tự gửi lại…</p>
        <p className="text-amber-800/90">
          {reason === 'rpm'
            ? 'Đang giãn yêu cầu theo "Giới hạn yêu cầu/phút" trong Cài đặt API.'
            : 'Nhà cung cấp AI báo vượt số yêu cầu mỗi phút. Bạn không cần bấm lại.'}
        </p>
      </div>
    </div>
  );
};

export default AiWaitToast;
