import React from 'react';

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
