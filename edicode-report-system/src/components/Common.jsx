import React from 'react';
import { COLORS } from '../theme.js';

// 日本語の「」（）を折り返しやすくするための表示用ラッパー
export const ResponsiveText = ({ text }) => {
  if (typeof text !== 'string') return text;
  const safeStr = text
    .replace(/「/g, '「 ')
    .replace(/」/g, ' 」')
    .replace(/（/g, '（ ')
    .replace(/）/g, ' ）')
    .replace(/\(/g, '( ')
    .replace(/\)/g, ' )');
  const parts = safeStr.split(/(\n)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part === '') return null;
        if (part === '\n') return <br key={i} />;
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
};

export const ReviewTextBox = ({ children }) => (
  <div
    className="bg-gray-50 border border-gray-100 rounded-xl p-3 md:p-4 text-[13px] md:text-[14px] leading-relaxed text-gray-700 w-full"
    style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word', maxWidth: '100%', boxSizing: 'border-box' }}
  >
    {typeof children === 'string' ? <ResponsiveText text={children} /> : children || '未入力'}
  </div>
);

// 各ステップ共通の小さな見出し部品
export const SectionHeading = ({ children, accent = false }) => (
  <div className={`flex items-center gap-2 pb-2 border-b w-full ${accent ? 'border-[#cb563e]' : 'border-gray-100'}`}>
    <span className={`w-3 h-3 rounded-full flex-shrink-0 ${accent ? 'bg-[#cb563e]' : 'bg-[#182349]'}`}></span>
    <h3 className="text-[16px] md:text-[18px] font-black text-[#182349]">{children}</h3>
  </div>
);

// 完了証の外枠（金色の二重罫線フレーム）
export const CertBorderFrame = () => (
  <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
    <div style={{ position: 'absolute', inset: '8mm', border: `1.5px solid ${COLORS.goldDark}` }} />
    <div style={{ position: 'absolute', inset: '11mm', border: `1px solid ${COLORS.goldDark}` }} />
  </div>
);
