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

export const SpacedText = ({ text, spacing, style, className }) => (
  <div style={{ display: 'flex', gap: spacing, ...style }} className={className}>
    {text.split('').map((char, i) => (
      <span key={i} style={{ whiteSpace: 'pre' }}>{char}</span>
    ))}
  </div>
);

export const ReviewTextBox = ({ children }) => (
  <div
    className="bg-gray-50 border border-gray-100 rounded-xl p-3 md:p-4 text-[13px] md:text-[14px] leading-relaxed text-gray-700 w-full"
    style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word', maxWidth: '100%', boxSizing: 'border-box' }}
  >
    {typeof children === 'string' ? <ResponsiveText text={children} /> : children || '未入力'}
  </div>
);

// 前提情報（ゴール／レシピ／味見した印象）ページで共通利用する小さな見出し部品
export const SectionHeading = ({ children, accent = false }) => (
  <div className={`flex items-center gap-2 pb-2 border-b w-full ${accent ? 'border-[#cb563e]' : 'border-gray-100'}`}>
    <span className={`w-3 h-3 rounded-full flex-shrink-0 ${accent ? 'bg-[#cb563e]' : 'bg-[#182349]'}`}></span>
    <h3 className="text-[16px] md:text-[18px] font-black text-[#182349]">{children}</h3>
  </div>
);

// 合格証の四隅に配置する装飾コーナー（アールデコ風の二重線＋ノット）
const CertCorner = ({ style }) => (
  <svg viewBox="0 0 120 120" width="72" height="72" style={{ position: 'absolute', ...style }}>
    <path d="M6,60 L6,6 L60,6" stroke={COLORS.goldDark} strokeWidth="2.5" fill="none" />
    <path d="M16,66 L16,16 L66,16" stroke={COLORS.goldLight} strokeWidth="2" fill="none" />
    <circle cx="11" cy="11" r="7" stroke={COLORS.goldDark} strokeWidth="2.5" fill="none" />
    <path d="M11,22 L11,40 M0,11 L18,11" stroke={COLORS.goldLight} strokeWidth="1.5" />
    <ellipse cx="46" cy="10" rx="10" ry="4" fill={COLORS.goldLight} stroke={COLORS.goldDark} strokeWidth="1" transform="rotate(20 46 10)" />
    <ellipse cx="10" cy="46" rx="10" ry="4" fill={COLORS.goldLight} stroke={COLORS.goldDark} strokeWidth="1" transform="rotate(70 10 46)" />
  </svg>
);

// 中央上下の小さな飾り罫（波線＋菱形）
const CertCenterOrnament = () => (
  <svg viewBox="0 0 260 40" width="220" height="34">
    <path d="M0,20 C40,0 60,40 100,20 C120,10 140,10 160,20 C200,40 220,0 260,20" stroke={COLORS.goldDark} strokeWidth="1.5" fill="none" />
    <rect x="120" y="8" width="20" height="20" fill={COLORS.goldLight} stroke={COLORS.goldDark} strokeWidth="1.5" transform="rotate(45 130 18)" />
  </svg>
);

// 合格証PDFの外枠装飾（四隅のコーナー＋左右の縦罫＋上下の飾り罫）
export const CertOrnamentFrame = () => (
  <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
    <CertCorner style={{ top: 14, left: 14 }} />
    <CertCorner style={{ top: 14, right: 14, transform: 'scaleX(-1)' }} />
    <CertCorner style={{ bottom: 14, left: 14, transform: 'scaleY(-1)' }} />
    <CertCorner style={{ bottom: 14, right: 14, transform: 'scale(-1,-1)' }} />
    <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)' }}><CertCenterOrnament /></div>
    <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)' }}><CertCenterOrnament /></div>
    <div style={{ position: 'absolute', top: 110, bottom: 130, left: 34, width: 1.5, backgroundColor: COLORS.goldDark, opacity: 0.6 }} />
    <div style={{ position: 'absolute', top: 110, bottom: 130, right: 34, width: 1.5, backgroundColor: COLORS.goldDark, opacity: 0.6 }} />
  </div>
);

export const GoodMoreList = ({ good = [], more = [] }) => (
  <>
    <div className="space-y-2 w-full">
      <div className="flex items-center gap-2">
        <span className="px-2 py-0.5 text-[10px] md:text-[11px] font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">GOOD</span>
      </div>
      <ul className="text-[12px] md:text-[13px] leading-relaxed text-gray-700 space-y-1 list-disc pl-5">
        {good.map((line, i) => <li key={i}>{line}</li>)}
      </ul>
    </div>
    <div className="space-y-2 pt-2 border-t border-gray-50 w-full">
      <div className="flex items-center gap-2">
        <span className="px-2 py-0.5 text-[10px] md:text-[11px] font-bold rounded-md bg-amber-50 text-amber-700 border border-amber-200">MORE</span>
      </div>
      <ul className="text-[12px] md:text-[13px] leading-relaxed text-gray-700 space-y-1 list-disc pl-5">
        {more.map((line, i) => <li key={i}>{line}</li>)}
      </ul>
    </div>
  </>
);
