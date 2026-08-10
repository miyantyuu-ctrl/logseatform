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

// 合格証PDFの背景に敷く月桂樹の装飾（SVG）
export const LaurelWreathSVG = () => {
  const numLeaves = 10;
  const leftPoints = [];
  const rightPoints = [];

  const Leaf = ({ length, width }) => {
    const outlinePath = `M 0,0 C ${length * 0.4},${width} ${length * 0.7},${width * 0.9} ${length},0 C ${length * 0.7},${-width * 0.9} ${length * 0.4},${-width} 0,0 Z`;
    const veinPath = `M 0,0 Q ${length * 0.5},${width * 0.15} ${length * 0.85},0`;
    return (
      <g>
        <path d={outlinePath} fill={COLORS.goldLight} stroke={COLORS.goldDark} strokeWidth="1" />
        <path d={veinPath} fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
      </g>
    );
  };

  const leaves = Array.from({ length: numLeaves }).map((_, i) => {
    const t = i / (numLeaves - 1);
    const a = (t * 140 + 10) * Math.PI / 180;
    const lx = 250 - 180 * Math.sin(a);
    const ly = 260 + 180 * Math.cos(a);
    leftPoints.push({ x: lx, y: ly });
    const lAngle = Math.atan2(-180 * Math.sin(a), -180 * Math.cos(a)) * 180 / Math.PI;
    const rx = 250 + 180 * Math.sin(a);
    const ry = 260 + 180 * Math.cos(a);
    rightPoints.push({ x: rx, y: ry });
    const rAngle = Math.atan2(-180 * Math.sin(a), 180 * Math.cos(a)) * 180 / Math.PI;
    const scale = 0.7;
    return (
      <React.Fragment key={i}>
        <g transform={`translate(${lx}, ${ly}) scale(${scale}) rotate(${lAngle})`}><Leaf length={60} width={18} /></g>
        <g transform={`translate(${rx}, ${ry}) scale(${scale}) rotate(${rAngle})`}><Leaf length={60} width={18} /></g>
      </React.Fragment>
    );
  });

  const leftStemPath = `M 270,460 C 260,450 250,440 ${leftPoints[0].x},${leftPoints[0].y} L ` + leftPoints.map(p => `${p.x},${p.y}`).join(' L ');
  const rightStemPath = `M 230,460 C 240,450 250,440 ${rightPoints[0].x},${rightPoints[0].y} L ` + rightPoints.map(p => `${p.x},${p.y}`).join(' L ');

  return (
    <svg width="100%" height="100%" viewBox="0 0 500 500" style={{ position: 'absolute', inset: 0, margin: 'auto', zIndex: 0 }}>
      <path d={leftStemPath} fill="none" stroke={COLORS.goldDark} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d={rightStemPath} fill="none" stroke={COLORS.goldDark} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {leaves}
    </svg>
  );
};

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
