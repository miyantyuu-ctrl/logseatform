import React, { useState, useEffect } from 'react';
import { COLORS } from './theme.js';
import { CheckCircle, BookOpen, AlertCircle, Download, ArrowLeft, RefreshCw, Camera, Award } from './components/Icons.jsx';
import { ReviewTextBox, SectionHeading } from './components/Common.jsx';
import activeReport from './config.js';

const { meta, CATEGORIES, findCategory, findMethod, findDish } = activeReport;

// ---- 完了証に表示する発行日（令和表記） ----
const formatReiwaDate = () => {
  const now = new Date();
  const reiwaYear = now.getFullYear() - 2018;
  return `令和${reiwaYear}年${now.getMonth() + 1}月${now.getDate()}日`;
};

const certFontFamily = "'マティスV', 'Matisse V', serif";

export default function App() {
  // ---- ステップ管理：start(氏名+料理選択) -> q1(写真確認) -> q2(達成度) -> q3(学び) -> review -> complete ----
  const [step, setStep] = useState('start');

  const [userName, setUserName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [methodId, setMethodId] = useState('');
  const [dishId, setDishId] = useState('');

  const [photoTaken, setPhotoTaken] = useState(false);
  const [photoSent, setPhotoSent] = useState(false);

  const [score, setScore] = useState('');
  const [scoreReason, setScoreReason] = useState('');
  const [learnings, setLearnings] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [toast, setToast] = useState('');

  const category = findCategory(categoryId);
  const method = findMethod(categoryId, methodId);
  const dish = findDish(categoryId, methodId, dishId);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // ---- PDF生成ライブラリ（html2canvas / jsPDF）を CDN から読み込む ----
  useEffect(() => {
    const loadScript = (src) => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
    (async () => {
      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      } catch (e) {
        console.error('Library load failed', e);
      }
    })();
  }, []);

  const goTo = (nextStep) => { setStep(nextStep); window.scrollTo(0, 0); };

  const handleSelectCategory = (id) => {
    setCategoryId(id);
    setMethodId('');
    setDishId('');
  };
  const handleSelectMethod = (id) => {
    setMethodId(id);
    setDishId('');
  };

  const canProceedStart = userName.trim() && dishId;
  const canProceedQ1 = photoTaken && photoSent;
  const canProceedQ2 = score !== '' && !Number.isNaN(Number(score)) && Number(score) >= 0 && Number(score) <= 100 && scoreReason.trim();
  const canProceedQ3 = learnings.trim();

  // ---- PDF出力 ----
  const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const renderPagesToPdf = async (pageIds, fileName) => {
    if (!window.html2canvas || !window.jspdf) {
      showToast('PDF生成機能が準備できていません。通信環境を確認し再読み込みしてください。');
      return false;
    }
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const renderScale = isMobile ? 1.5 : 2;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');

    for (let i = 0; i < pageIds.length; i++) {
      const element = document.getElementById(pageIds[i]);
      if (!element) continue;
      if (i > 0) pdf.addPage();
      const canvas = await window.html2canvas(element, {
        scale: renderScale,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.9);
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      canvas.width = 0;
      canvas.height = 0;
    }

    const pdfBlob = pdf.output('blob');
    if (isMobile && navigator.share) {
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
      try {
        await navigator.share({ files: [file], title: fileName });
      } catch (e) {
        downloadBlob(pdfBlob, fileName);
      }
    } else {
      downloadBlob(pdfBlob, fileName);
    }
    return true;
  };

  const handleDownloadPdf = async () => {
    setIsGenerating(true);
    try {
      const cleanUserName = (userName || '').trim() ? userName.trim().replace(/[/\?%*:|"<>\s]/g, '_') : '名前未入力';
      const ok = await renderPagesToPdf(
        ['pdf-cert-page-1', 'pdf-report-page-1'],
        meta.pdfFileName(cleanUserName, dish?.label)
      );
      if (ok) showToast('完了証と報告内容を保存しました');
    } catch (err) {
      console.error('PDF生成エラー:', err);
      showToast(`PDF生成中にエラーが発生しました: ${err.message || '不明なエラー'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const pdfPageContainerStyle = {
    width: '210mm', minHeight: '297mm', padding: '20mm', boxSizing: 'border-box',
    backgroundColor: '#ffffff', color: '#182349', fontFamily: 'sans-serif',
    display: 'flex', flexDirection: 'column', position: 'relative'
  };

  const selectClassName = 'w-full py-4 px-5 border-2 border-gray-100 rounded-[16px] text-[14px] md:text-[16px] font-bold text-[#182349] focus:border-[#c45a43] outline-none shadow-[inset_0_2px_10px_rgba(0,0,0,0.03)] transition-all bg-white appearance-none';

  return (
    <div className="min-h-screen" style={{ background: COLORS.background }}>
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-[#182349] text-white px-5 py-3 rounded-xl shadow-lg text-[13px] font-bold z-[9999] animate-fade-in">
          {toast}
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 pt-6 md:pt-10 pb-16">
        <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 overflow-hidden relative">

          {/* 0. 表紙：氏名 + 料理選択（段階的プルダウン） */}
          {step === 'start' && (
            <div className="animate-fade-in p-4 md:p-6 lg:p-10">
              <div className="h-[14px] w-full absolute top-0 left-0" style={{ background: COLORS.gradientBar }}></div>
              <div className="text-center pt-4 md:pt-6">
                <p className="text-[#cb563e] font-extrabold text-[11px] md:text-[12px] uppercase tracking-wider mb-2">EDICODE</p>
                <h1 className="text-[20px] md:text-[24px] lg:text-[28px] font-[900] text-[#182349] leading-tight mb-2">
                  {meta.formTitle}
                </h1>
                <p className="text-[13px] md:text-[15px] text-gray-500 font-bold mb-6">{meta.chapterLabel}</p>
              </div>

              <div className="bg-[#fffcf9] rounded-2xl border border-orange-100 p-4 md:p-5 mb-8 text-center">
                <p className="text-[13px] md:text-[14px] font-bold text-[#182349] mb-1">{meta.purposeLead}</p>
                <p className="text-[13px] md:text-[14px] text-gray-600 leading-relaxed">{meta.purposeBody}</p>
                <p className="text-[11px] md:text-[12px] text-[#cb563e] font-bold mt-3">{meta.slackNote}</p>
              </div>

              <div className="mb-6">
                <label className="block text-[13px] md:text-[14px] font-black text-[#182349] mb-2">氏名</label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="お名前を入力してください"
                  className="w-full py-4 px-5 border-2 border-gray-50 rounded-[16px] text-[15px] md:text-[16px] font-bold focus:border-[#c45a43] outline-none shadow-[inset_0_2px_10px_rgba(0,0,0,0.03)] placeholder-gray-300 transition-all"
                />
              </div>

              <div className="mb-2">
                <label className="block text-[13px] md:text-[14px] font-black text-[#182349] mb-2">{meta.dishFieldLabel}</label>
                <p className="text-[11px] md:text-[12px] text-gray-400 mb-3">食材カテゴリ→調理法→料理名の順に選んでください。</p>

                <div className="space-y-3">
                  <div>
                    <p className="text-[11px] font-bold text-gray-400 mb-1.5">挑戦する食材カテゴリ</p>
                    <div className="grid grid-cols-3 gap-2">
                      {CATEGORIES.map(c => {
                        const disabled = c.methods.length === 0;
                        const active = categoryId === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => handleSelectCategory(c.id)}
                            className={`py-3 px-1 rounded-xl border-2 font-bold text-center transition-all text-[13px] md:text-[15px] ${
                              active ? 'bg-[#182349] text-white border-[#182349] shadow-md'
                              : disabled ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                              : 'bg-white text-[#182349] border-gray-200 hover:bg-gray-50 hover:text-[#cb563e]'
                            }`}
                          >
                            {c.label}
                            {disabled && <span className="block text-[9px] font-normal mt-0.5">準備中</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {category && category.methods.length > 0 && (
                    <div className="animate-fade-in">
                      <p className="text-[11px] font-bold text-gray-400 mb-1.5">調理法</p>
                      <select value={methodId} onChange={(e) => handleSelectMethod(e.target.value)} className={selectClassName}>
                        <option value="">選択してください</option>
                        {category.methods.map(m => (
                          <option key={m.id} value={m.id}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {method && method.dishes.length > 0 && (
                    <div className="animate-fade-in">
                      <p className="text-[11px] font-bold text-gray-400 mb-1.5">料理名</p>
                      <select value={dishId} onChange={(e) => setDishId(e.target.value)} className={selectClassName}>
                        <option value="">選択してください</option>
                        {method.dishes.map(d => (
                          <option key={d.id} value={d.id}>{d.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-center mt-8">
                <button
                  onClick={() => goTo('q1')}
                  disabled={!canProceedStart}
                  className="w-full md:w-auto px-10 py-4 rounded-[20px] font-black text-white text-[16px] md:text-[18px] shadow-lg transition-all active:scale-95 disabled:opacity-50"
                  style={{ backgroundColor: canProceedStart ? '#cb563e' : '#757575' }}
                >
                  次へ進む
                </button>
              </div>
            </div>
          )}

          {/* 1. 写真提出について */}
          {step === 'q1' && (
            <div className="animate-fade-in p-4 md:p-6 lg:p-10">
              <div className="h-[14px] w-full absolute top-0 left-0" style={{ background: COLORS.gradientBar }}></div>
              <SectionHeading accent>{meta.section1.title}</SectionHeading>
              <div className="mt-6 space-y-4">
                <div className="flex items-start gap-2">
                  <span className="px-2 py-0.5 text-[10px] md:text-[11px] font-black rounded-md bg-[#182349] text-white flex-shrink-0 mt-0.5">{meta.section1.qLabel}</span>
                  <p className="text-[13px] md:text-[15px] leading-relaxed text-[#334155] font-medium">{meta.section1.text}</p>
                </div>
                <div className="bg-[#fffcf9] rounded-2xl border border-orange-100 p-4 md:p-5">
                  <p className="text-[11px] md:text-[12px] font-extrabold text-[#cb563e] mb-3">{meta.section1.answerLabel}</p>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={photoTaken} onChange={(e) => setPhotoTaken(e.target.checked)} className="w-5 h-5 accent-[#cb563e]" />
                      <span className="text-[13px] md:text-[14px] font-bold text-[#182349]">{meta.section1.checklist[0]}</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={photoSent} onChange={(e) => setPhotoSent(e.target.checked)} className="w-5 h-5 accent-[#cb563e]" />
                      <span className="text-[13px] md:text-[14px] font-bold text-[#182349]">{meta.section1.checklist[1]}</span>
                    </label>
                  </div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mt-10">
                <button onClick={() => goTo('start')} className="w-full sm:w-auto px-4 md:px-6 py-3 md:py-4 rounded-[20px] font-bold text-gray-400 hover:text-gray-600 text-[14px] md:text-[16px] transition-all flex items-center justify-center gap-2">
                  <ArrowLeft className="w-4 h-4" /> 戻る
                </button>
                <button onClick={() => goTo('q2')} disabled={!canProceedQ1} className="w-full sm:flex-1 py-3 md:py-4 bg-[#cb563e] text-white rounded-[20px] font-black text-[16px] md:text-[18px] shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50">
                  次へ進む
                </button>
              </div>
            </div>
          )}

          {/* 2. 達成度について */}
          {step === 'q2' && (
            <div className="animate-fade-in p-4 md:p-6 lg:p-10">
              <div className="h-[14px] w-full absolute top-0 left-0" style={{ background: COLORS.gradientBar }}></div>
              <SectionHeading accent>{meta.section2.title}</SectionHeading>

              <div className="mt-6 space-y-3">
                <div className="flex items-start gap-2">
                  <span className="px-2 py-0.5 text-[10px] md:text-[11px] font-black rounded-md bg-[#182349] text-white flex-shrink-0 mt-0.5">{meta.section2.qLabel}</span>
                  <p className="text-[13px] md:text-[15px] leading-relaxed text-[#334155] font-medium">{meta.section2.scoreText}</p>
                </div>
                <div className="bg-[#fffcf9] rounded-2xl border border-orange-100 p-4 md:p-5">
                  <p className="text-[11px] md:text-[12px] font-extrabold text-[#cb563e] mb-3">{meta.section2.scoreAnswerLabel}</p>
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-[13px] md:text-[14px] font-bold text-[#182349]">{meta.section2.scorePrefix}</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={score}
                      onChange={(e) => setScore(e.target.value)}
                      className="w-24 py-2 px-3 border-2 border-gray-100 rounded-xl text-center text-[16px] font-black text-[#182349] focus:border-[#c45a43] outline-none"
                    />
                    <span className="text-[13px] md:text-[14px] font-bold text-[#182349]">{meta.section2.scoreSuffix}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <p className="text-[13px] md:text-[15px] leading-relaxed text-[#334155] font-medium">{meta.section2.reasonText}</p>
                <div>
                  <p className="text-[11px] md:text-[12px] font-extrabold text-[#cb563e] mb-2">{meta.section2.reasonAnswerLabel}</p>
                  <textarea
                    value={scoreReason}
                    onChange={(e) => setScoreReason(e.target.value)}
                    rows={5}
                    placeholder="ご自身の言葉でご記入ください"
                    className="w-full py-3 px-4 border-2 border-gray-100 rounded-xl text-[13px] md:text-[14px] leading-relaxed text-[#182349] focus:border-[#c45a43] outline-none placeholder-gray-300 transition-all"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mt-10">
                <button onClick={() => goTo('q1')} className="w-full sm:w-auto px-4 md:px-6 py-3 md:py-4 rounded-[20px] font-bold text-gray-400 hover:text-gray-600 text-[14px] md:text-[16px] transition-all flex items-center justify-center gap-2">
                  <ArrowLeft className="w-4 h-4" /> 戻る
                </button>
                <button onClick={() => goTo('q3')} disabled={!canProceedQ2} className="w-full sm:flex-1 py-3 md:py-4 bg-[#cb563e] text-white rounded-[20px] font-black text-[16px] md:text-[18px] shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50">
                  次へ進む
                </button>
              </div>
            </div>
          )}

          {/* 3. 目的達成について */}
          {step === 'q3' && (
            <div className="animate-fade-in p-4 md:p-6 lg:p-10">
              <div className="h-[14px] w-full absolute top-0 left-0" style={{ background: COLORS.gradientBar }}></div>
              <SectionHeading accent>{meta.section3.title}</SectionHeading>
              <div className="mt-6 space-y-3">
                <div className="flex items-start gap-2">
                  <span className="px-2 py-0.5 text-[10px] md:text-[11px] font-black rounded-md bg-[#182349] text-white flex-shrink-0 mt-0.5">{meta.section3.qLabel}</span>
                  <p className="text-[13px] md:text-[15px] leading-relaxed text-[#334155] font-medium">{meta.section3.text}</p>
                </div>
                <div>
                  <p className="text-[11px] md:text-[12px] font-extrabold text-[#cb563e] mb-2">{meta.section3.answerLabel}</p>
                  <textarea
                    value={learnings}
                    onChange={(e) => setLearnings(e.target.value)}
                    rows={7}
                    placeholder="ご自身の言葉でご記入ください"
                    className="w-full py-3 px-4 border-2 border-gray-100 rounded-xl text-[13px] md:text-[14px] leading-relaxed text-[#182349] focus:border-[#c45a43] outline-none placeholder-gray-300 transition-all"
                  />
                </div>
              </div>

              <div className="mt-8 bg-gray-50 p-4 md:p-5 rounded-2xl border border-gray-100 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-[#182349] text-[12px] md:text-[13px] mb-1">{meta.footerNoteTitle}</p>
                  <p className="text-[11px] md:text-[12px] text-gray-500 leading-relaxed whitespace-pre-wrap">{meta.footerNoteBody}</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mt-10">
                <button onClick={() => goTo('q2')} className="w-full sm:w-auto px-4 md:px-6 py-3 md:py-4 rounded-[20px] font-bold text-gray-400 hover:text-gray-600 text-[14px] md:text-[16px] transition-all flex items-center justify-center gap-2">
                  <ArrowLeft className="w-4 h-4" /> 戻る
                </button>
                <button onClick={() => goTo('review')} disabled={!canProceedQ3} className="w-full sm:flex-1 py-3 md:py-4 bg-[#cb563e] text-white rounded-[20px] font-black text-[16px] md:text-[18px] shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50">
                  入力内容を確認する
                </button>
              </div>
            </div>
          )}

          {/* 4. 確認画面 */}
          {step === 'review' && (
            <div className="animate-fade-in p-4 md:p-6 lg:p-10">
              <div className="h-[14px] w-full absolute top-0 left-0" style={{ background: COLORS.gradientBar }}></div>
              <h2 className="text-[18px] md:text-[22px] font-black text-center text-[#182349] mb-6 pb-3 border-b border-gray-100">入力内容の確認</h2>

              <div className="space-y-6">
                <div>
                  <SectionHeading>氏名・料理</SectionHeading>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <ReviewTextBox>{userName}</ReviewTextBox>
                    <ReviewTextBox>{dish?.label}</ReviewTextBox>
                  </div>
                </div>

                <div>
                  <SectionHeading>{meta.section1.title}</SectionHeading>
                  <div className="mt-2">
                    <ReviewTextBox>
                      {`${photoTaken ? '☑' : '☐'} ${meta.section1.checklist[0]}\n${photoSent ? '☑' : '☐'} ${meta.section1.checklist[1]}`}
                    </ReviewTextBox>
                  </div>
                </div>

                <div>
                  <SectionHeading>{meta.section2.title}</SectionHeading>
                  <div className="mt-2 space-y-2">
                    <ReviewTextBox>{`${meta.section2.scorePrefix}${score}${meta.section2.scoreSuffix}`}</ReviewTextBox>
                    <ReviewTextBox>{scoreReason}</ReviewTextBox>
                  </div>
                </div>

                <div>
                  <SectionHeading>{meta.section3.title}</SectionHeading>
                  <div className="mt-2">
                    <ReviewTextBox>{learnings}</ReviewTextBox>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mt-10">
                <button onClick={() => goTo('q3')} className="w-full sm:w-auto px-4 md:px-6 py-3 md:py-4 rounded-[20px] font-bold text-gray-400 hover:text-gray-600 text-[14px] md:text-[16px] transition-all flex items-center justify-center gap-2">
                  <ArrowLeft className="w-4 h-4" /> 修正する
                </button>
                <button onClick={() => goTo('complete')} className="w-full sm:flex-1 py-3 md:py-4 bg-[#cb563e] text-white rounded-[20px] font-black text-[16px] md:text-[18px] shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2">
                  <CheckCircle className="w-5 h-5" /> この内容で提出する
                </button>
              </div>
            </div>
          )}

          {/* 5. 完了画面（修了証っぽい演出） */}
          {step === 'complete' && (
            <div className="animate-fade-in p-4 md:p-6 lg:p-10 text-center">
              <div className="h-[14px] w-full absolute top-0 left-0" style={{ background: COLORS.gradientBar }}></div>

              <div className="flex justify-center mb-5 mt-2">
                <div className="w-20 h-20 rounded-full bg-[#fffdf8] border border-orange-100 flex items-center justify-center shadow-sm">
                  <Award className="w-10 h-10 text-[#cb563e]" />
                </div>
              </div>

              <p className="text-[#cb563e] font-extrabold text-[11px] md:text-[12px] uppercase tracking-wider mb-2">EDICODE</p>
              <h2 className="text-[20px] md:text-[24px] font-black text-[#182349] mb-6">{meta.chapterLabel} 完了報告を受け付けました</h2>

              <div className="max-w-md mx-auto rounded-[20px] border p-6 mb-8 relative overflow-hidden" style={{ borderColor: COLORS.goldDark, background: 'linear-gradient(180deg, #fffdf6 0%, #fffaf0 100%)' }}>
                <div style={{ position: 'absolute', inset: '5px', border: `1px solid ${COLORS.goldLight}`, borderRadius: '16px', pointerEvents: 'none' }} />
                <p className="text-[24px] font-black tracking-[0.3em]" style={{ color: '#1c1c2e', fontFamily: certFontFamily }}>完了証</p>
                <p className="text-[13px] font-bold mt-2" style={{ color: COLORS.text }}>{meta.certChapterNumber} {meta.certCourseTitle}</p>
                <p className="text-[15px] font-black mt-4" style={{ color: COLORS.text }}>{userName || 'ご入力者'} 様</p>
                <p className="text-[11px] text-gray-500 mt-3 leading-relaxed">
                  「{dish?.label}」の調理チャレンジを完了し、<br />本フォームによる報告が確認できましたので、ここに証します。
                </p>
                <p className="text-[10px] text-gray-400 mt-4">{formatReiwaDate()}</p>
              </div>

              <p className="text-[12px] md:text-[13px] text-gray-500 mb-6 leading-relaxed">
                下のボタンから、完了証と報告内容をまとめたPDFを保存できます。<br />
                {meta.footerNoteBody}
              </p>

              <button
                onClick={handleDownloadPdf}
                disabled={isGenerating}
                className="w-full sm:w-auto px-10 py-4 bg-[#cb563e] text-white rounded-[20px] font-black text-[16px] md:text-[18px] shadow-lg hover:brightness-110 active:scale-95 transition-all inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isGenerating ? (<><RefreshCw className="w-5 h-5 animate-spin" />PDF生成中...</>) : (<><Download className="w-5 h-5" />完了証・報告書をPDFで保存</>)}
              </button>

              {/* PDF出力用の非表示DOM（完了証1ページ + 報告内容1ページ） */}
              <div style={{ position: 'absolute', left: '-9999px', top: '0', width: '210mm' }}>
                <div
                  id="pdf-cert-page-1"
                  style={{
                    ...pdfPageContainerStyle,
                    height: '297mm',
                    backgroundColor: '#fffdf6',
                    backgroundImage: `url(${import.meta.env.BASE_URL}certificates/cert-bg.png)`,
                    backgroundSize: '100% 100%',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center top',
                    position: 'relative',
                    overflow: 'hidden',
                    padding: 0
                  }}
                >
                  <div style={{ position: 'absolute', left: '28mm', right: '28mm', top: '60mm', bottom: '60mm', display: 'flex', flexDirection: 'column' }}>
                    <h1 style={{ fontSize: '66.7pt', fontWeight: 900, color: '#1c1c2e', letterSpacing: '0.35em', textAlign: 'center', margin: '0 0 12mm 0', fontFamily: certFontFamily }}>完了証</h1>
                    <p style={{ fontSize: '26.9pt', fontWeight: 700, color: COLORS.text, textAlign: 'center', margin: '0 0 3mm 0', fontFamily: certFontFamily }}>{meta.certChapterNumber}</p>
                    <p style={{ fontSize: '26.9pt', fontWeight: 900, color: COLORS.text, textAlign: 'center', margin: '0 0 18mm 0', fontFamily: certFontFamily }}>{meta.certCourseTitle}</p>
                    <p style={{ fontSize: '32.1pt', fontWeight: 700, color: COLORS.text, textAlign: 'right', margin: '0 0 auto 0', fontFamily: certFontFamily }}>{userName || 'ご入力者'} 殿</p>
                    <p style={{ fontSize: '19.5pt', lineHeight: 2.1, color: '#334155', textAlign: 'center', margin: '0 0 auto 0', fontFamily: certFontFamily }}>
                      あなたは食のプロフェッショナル養成講座の「{meta.certChapterNumber} {meta.certCourseTitle}」において<br />
                      「{dish?.label}」の調理チャレンジを完了し、<span style={{ whiteSpace: 'nowrap' }}>完了報告</span>が確認できましたので<br />
                      ここに証します。
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                      <p style={{ fontSize: '19.9pt', color: '#334155', margin: 0, fontFamily: certFontFamily }}>{formatReiwaDate()}</p>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '19.9pt', color: '#334155', margin: '0 0 2px 0', fontFamily: certFontFamily }}>{meta.certIssuerRole}</p>
                        <p style={{ fontSize: '30.1pt', fontWeight: 700, color: COLORS.text, margin: 0, fontFamily: certFontFamily }}>{meta.certIssuerName}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div id="pdf-report-page-1" style={{ ...pdfPageContainerStyle, padding: '16mm' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '3mm' }}>
                    <div>
                      <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '0.02em' }}>COMPLETION REPORT</h2>
                      <p style={{ fontSize: '10px', color: '#94a3b8', margin: '2px 0 0 0' }}>{meta.reportSubtitle}</p>
                    </div>
                    <p style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', margin: 0 }}>{userName || '受講者'} 様</p>
                  </div>
                  <div style={{ height: '5px', width: '100%', background: COLORS.gradientBar, borderRadius: '3px', marginBottom: '6mm' }} />

                  <div style={{ marginBottom: '5mm' }}>
                    <p style={{ fontSize: '11px', fontWeight: 900, color: '#94a3b8', margin: '0 0 2mm 0' }}>{meta.dishFieldLabel}</p>
                    <p style={{ fontSize: '15px', fontWeight: 700, color: COLORS.text, margin: 0 }}>{dish?.label}</p>
                  </div>

                  <div style={{ border: '1px solid #e2e8f0', borderLeft: `6px solid #2563eb`, borderRadius: '10px', padding: '5mm', marginBottom: '4mm' }}>
                    <p style={{ fontSize: '11px', fontWeight: 900, color: COLORS.text, margin: '0 0 2mm 0' }}>{meta.section1.title}</p>
                    <p style={{ fontSize: '12px', color: '#334155', margin: 0, whiteSpace: 'pre-wrap' }}>
                      {`${photoTaken ? '✓' : '×'} ${meta.section1.checklist[0]}　　${photoSent ? '✓' : '×'} ${meta.section1.checklist[1]}`}
                    </p>
                  </div>

                  <div style={{ border: '1px solid #e2e8f0', borderLeft: `6px solid #2563eb`, borderRadius: '10px', padding: '5mm', marginBottom: '4mm' }}>
                    <p style={{ fontSize: '11px', fontWeight: 900, color: COLORS.text, margin: '0 0 2mm 0' }}>{meta.section2.title}</p>
                    <p style={{ fontSize: '13px', fontWeight: 900, color: '#cb563e', margin: '0 0 2mm 0' }}>{`${meta.section2.scorePrefix}${score}${meta.section2.scoreSuffix}`}</p>
                    <p style={{ fontSize: '12px', color: '#334155', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{scoreReason}</p>
                  </div>

                  <div style={{ border: '1px solid #e2e8f0', borderLeft: `6px solid #2563eb`, borderRadius: '10px', padding: '5mm', flex: 1 }}>
                    <p style={{ fontSize: '11px', fontWeight: 900, color: COLORS.text, margin: '0 0 2mm 0' }}>{meta.section3.title}</p>
                    <p style={{ fontSize: '12px', color: '#334155', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{learnings}</p>
                  </div>

                  <p style={{ fontSize: '9px', color: '#cbd5e1', textAlign: 'center', margin: '6mm 0 0 0' }}>{meta.pageFooterLabel}</p>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
