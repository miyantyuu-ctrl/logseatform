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
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [photoFileName, setPhotoFileName] = useState('');
  const [isPhotoProcessing, setIsPhotoProcessing] = useState(false);

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

  // ---- 写真アップロード：端末負荷とPDFサイズを抑えるため、長辺1280pxに縮小してJPEGに変換 ----
  const handlePhotoSelect = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('画像ファイルを選択してください');
      return;
    }
    setIsPhotoProcessing(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const maxSide = 1280;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        setPhotoDataUrl(canvas.toDataURL('image/jpeg', 0.85));
        setPhotoFileName(file.name);
        setIsPhotoProcessing(false);
      };
      img.onerror = () => {
        showToast('画像の読み込みに失敗しました');
        setIsPhotoProcessing(false);
      };
      img.src = ev.target.result;
    };
    reader.onerror = () => {
      showToast('画像の読み込みに失敗しました');
      setIsPhotoProcessing(false);
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoRemove = () => {
    setPhotoDataUrl('');
    setPhotoFileName('');
  };

  const canProceedStart = userName.trim() && dishId;
  const canProceedQ1 = photoTaken && photoSent && !!photoDataUrl;
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

  // ---- 報告ページ用：内容が長いときに潰さず、複数のA4ページに分割するための切れ目を計算する ----
  // 1) 枠（カード）の途中で切らずに済む場合は、枠と枠のすき間で改ページ
  // 2) 1枚に収まらない長い枠は、行と行のすき間で改ページ（文字の途中では切らない）
  // 切る位置は、画面上の計測値ではなく「描画済み画像の中で文字が一切ない横帯」を探して決める。
  // （html2canvasは行間の広い文字を計測位置より下に描くため、計測値で切ると文字の途中で切れてしまう）
  const A4_W_MM = 210;
  const A4_H_MM = 297;
  const PAGE_MARGIN_MM = 12;

  const snapToWhitespace = (canvas, target, minY, mmPx) => {
    const ctx = canvas.getContext('2d');
    const x0 = Math.round(20 * mmPx);
    const x1 = Math.round(190 * mmPx);
    const w = x1 - x0;
    const searchTop = Math.max(Math.ceil(minY), Math.floor(target - 30 * mmPx));
    const h = Math.floor(target) - searchTop;
    if (h < 8) return target;
    const px = ctx.getImageData(x0, searchTop, w, h).data;
    const MIN_BAND = 6;
    let run = 0;
    for (let r = h - 1; r >= 0; r--) {
      let blank = true;
      const base = r * w * 4;
      for (let c = 0; c < w; c++) {
        const i = base + c * 4;
        if (px[i] < 235 || px[i + 1] < 235 || px[i + 2] < 235) { blank = false; break; }
      }
      if (blank) {
        run++;
      } else {
        if (run >= MIN_BAND) return searchTop + r + 1 + Math.floor(run / 2);
        run = 0;
      }
    }
    if (run >= MIN_BAND) return searchTop + Math.floor(run / 2);
    return target;
  };

  // 下端の余白（白い帯）を除いた「実際に内容がある最下端」を探す
  const findContentBottom = (canvas, mmPx) => {
    const ctx = canvas.getContext('2d');
    const x0 = Math.round(20 * mmPx);
    const w = Math.round(190 * mmPx) - x0;
    const h = Math.min(canvas.height, Math.floor(40 * mmPx));
    const y0 = canvas.height - h;
    const px = ctx.getImageData(x0, y0, w, h).data;
    for (let r = h - 1; r >= 0; r--) {
      const base = r * w * 4;
      for (let c = 0; c < w; c++) {
        const i = base + c * 4;
        if (px[i] < 235 || px[i + 1] < 235 || px[i + 2] < 235) return y0 + r + 1;
      }
    }
    return canvas.height;
  };

  const computePageSlices = (element, canvas) => {
    const rootRect = element.getBoundingClientRect();
    const scale = canvas.width / rootRect.width;
    const mmPx = canvas.width / A4_W_MM;
    const canvasH = canvas.height;
    const fullPageH = A4_H_MM * mmPx;

    // 1枚に収まる場合は従来どおり（余白の削りなし）
    if (canvasH <= fullPageH + 2) {
      return [{ sy: 0, sh: canvasH, dyMm: 0 }];
    }

    // 最後のページが白紙にならないよう、内容の最下端が収まれば、そこを最終ページとする
    const contentBottom = findContentBottom(canvas, mmPx);
    const total = Math.min(canvasH, contentBottom + 6 * mmPx);

    const blocks = Array.from(element.children).map((el) => {
      const r = el.getBoundingClientRect();
      return { top: (r.top - rootRect.top) * scale, bottom: (r.bottom - rootRect.top) * scale };
    });

    const slices = [];
    let start = 0;
    let pageIdx = 0;
    while (start < contentBottom - 2 && pageIdx < 30) {
      const topMargin = pageIdx === 0 ? 0 : PAGE_MARGIN_MM * mmPx;
      const avail = fullPageH - topMargin - PAGE_MARGIN_MM * mmPx;
      const limit = start + avail;
      let end;

      if (limit >= contentBottom) {
        end = total;
      } else {
        const straddle = blocks.find((b) => b.top < limit && b.bottom > limit);
        const freshPageH = fullPageH - 2 * PAGE_MARGIN_MM * mmPx;
        const gapPx = 8 * scale;
        // 枠ごと次ページへ送れるならそのすき間、無理なら上限付近の「文字のない横帯」で切る
        const target = (straddle && straddle.bottom - straddle.top <= freshPageH && straddle.top - gapPx > start + 20 * mmPx)
          ? straddle.top - gapPx
          : limit;
        end = snapToWhitespace(canvas, target, start + 20 * mmPx, mmPx);
        if (end <= start + 10 * mmPx) end = limit;
      }
      slices.push({ sy: start, sh: end - start, dyMm: topMargin / mmPx });
      start = end;
      pageIdx++;
    }
    return slices;
  };

  // pageSpecs: 'id' もしくは { id, paginate: true }（paginate は内容の高さに応じて複数ページに分割）
  const renderPagesToPdf = async (pageSpecs, fileName) => {
    if (!window.html2canvas || !window.jspdf) {
      showToast('PDF生成機能が準備できていません。通信環境を確認し再読み込みしてください。');
      return false;
    }
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const renderScale = isMobile ? 1.5 : 2;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    let pageCount = 0;

    for (let i = 0; i < pageSpecs.length; i++) {
      const spec = typeof pageSpecs[i] === 'string' ? { id: pageSpecs[i] } : pageSpecs[i];
      const element = document.getElementById(spec.id);
      if (!element) continue;
      const canvas = await window.html2canvas(element, {
        scale: renderScale,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      if (!spec.paginate) {
        if (pageCount > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, A4_W_MM, A4_H_MM);
        pageCount++;
      } else {
        const mmPx = canvas.width / A4_W_MM;
        const slices = computePageSlices(element, canvas);
        for (const s of slices) {
          if (pageCount > 0) pdf.addPage();
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = Math.max(1, Math.round(s.sh));
          const ctx = sliceCanvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          ctx.drawImage(canvas, 0, Math.round(s.sy), canvas.width, sliceCanvas.height, 0, 0, canvas.width, sliceCanvas.height);
          // 縦横比を保ったまま貼る（高さは切り出した分だけ）
          pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, s.dyMm, A4_W_MM, sliceCanvas.height / mmPx);
          sliceCanvas.width = 0;
          sliceCanvas.height = 0;
          pageCount++;
        }
      }
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
        ['pdf-cert-page-1', { id: 'pdf-report-page-1', paginate: true }],
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

                  <div className="mt-5 pt-4 border-t border-orange-100">
                    <p className="text-[12px] md:text-[13px] font-black text-[#182349] mb-1">写真をアップロード</p>
                    <p className="text-[10px] md:text-[11px] text-gray-400 mb-3">この写真は報告書PDFに添付されます。</p>

                    {!photoDataUrl ? (
                      <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-orange-200 rounded-2xl py-8 px-4 cursor-pointer bg-white hover:bg-orange-50/40 transition-all">
                        <Camera className="w-7 h-7 text-[#cb563e]" />
                        <span className="text-[12px] md:text-[13px] font-bold text-[#cb563e]">
                          {isPhotoProcessing ? '処理中...' : 'タップして写真を選択（写真フォルダから選べます）'}
                        </span>
                        <input type="file" accept="image/*" onChange={handlePhotoSelect} disabled={isPhotoProcessing} className="hidden" />
                      </label>
                    ) : (
                      <div className="flex items-center gap-3 bg-white rounded-2xl border border-orange-100 p-3">
                        <img src={photoDataUrl} alt="選択した写真" className="w-16 h-16 object-cover rounded-xl border border-gray-100 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-bold text-[#182349] truncate">{photoFileName || '選択済みの写真'}</p>
                          <p className="text-[10px] text-gray-400">アップロード済み</p>
                        </div>
                        <button type="button" onClick={handlePhotoRemove} className="text-[11px] font-bold text-gray-400 hover:text-[#cb563e] flex-shrink-0 px-2 py-1">
                          変更
                        </button>
                      </div>
                    )}
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
                  <div className="mt-2 space-y-2">
                    <ReviewTextBox>
                      {`${photoTaken ? '☑' : '☐'} ${meta.section1.checklist[0]}\n${photoSent ? '☑' : '☐'} ${meta.section1.checklist[1]}`}
                    </ReviewTextBox>
                    {photoDataUrl && (
                      <img src={photoDataUrl} alt="提出写真プレビュー" className="w-full max-w-[220px] rounded-xl border border-gray-100" />
                    )}
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
                  <div style={{ position: 'absolute', left: '28mm', right: '28mm', top: '66mm', bottom: '74mm', display: 'flex', flexDirection: 'column' }}>
                    <h1 style={{ fontSize: '54pt', fontWeight: 900, color: '#1c1c2e', letterSpacing: '0.32em', textAlign: 'center', margin: '0 0 9mm 0', fontFamily: certFontFamily }}>完了証</h1>
                    <p style={{ fontSize: '22pt', fontWeight: 700, color: COLORS.text, textAlign: 'center', margin: '0 0 2mm 0', fontFamily: certFontFamily }}>{meta.certChapterNumber}</p>
                    <p style={{ fontSize: '22pt', fontWeight: 900, color: COLORS.text, textAlign: 'center', margin: '0 0 12mm 0', fontFamily: certFontFamily }}>{meta.certCourseTitle}</p>
                    <p style={{ fontSize: '26pt', fontWeight: 700, color: COLORS.text, textAlign: 'right', margin: '0 0 auto 0', fontFamily: certFontFamily }}>{userName || 'ご入力者'} 殿</p>
                    <p style={{ fontSize: '16pt', lineHeight: 1.9, color: '#334155', textAlign: 'center', margin: '0 0 auto 0', fontFamily: certFontFamily }}>
                      あなたは食のプロフェッショナル養成講座の<br />
                      「{meta.certChapterNumber} {meta.certCourseTitle}」において<br />
                      「{dish?.label}」の調理チャレンジを完了し、<br />
                      完了報告が確認できましたので ここに証します。
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative', top: '21mm' }}>
                      <p style={{ fontSize: '16pt', color: '#334155', margin: 0, fontFamily: certFontFamily }}>{formatReiwaDate()}</p>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '16pt', color: '#334155', margin: '0 0 2px 0', fontFamily: certFontFamily }}>{meta.certIssuerRole}</p>
                        <p style={{ fontSize: '24pt', fontWeight: 700, color: COLORS.text, margin: 0, fontFamily: certFontFamily }}>{meta.certIssuerName}</p>
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
                    <p style={{ fontSize: '15px', fontWeight: 700, color: COLORS.text, margin: 0, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{dish?.label}</p>
                  </div>

                  <div style={{ border: '1px solid #e2e8f0', borderLeft: `6px solid #2563eb`, borderRadius: '10px', padding: '5mm', marginBottom: '4mm' }}>
                    <p style={{ fontSize: '11px', fontWeight: 900, color: COLORS.text, margin: '0 0 2mm 0' }}>{meta.section1.title}</p>
                    <p style={{ fontSize: '12px', color: '#334155', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere', maxWidth: '100%' }}>
                      {`${photoTaken ? '✓' : '×'} ${meta.section1.checklist[0]}　　${photoSent ? '✓' : '×'} ${meta.section1.checklist[1]}`}
                    </p>
                    {photoDataUrl && (
                      <div style={{ marginTop: '3mm' }}>
                        <img
                          src={photoDataUrl}
                          alt="提出写真"
                          style={{ maxWidth: '80mm', maxHeight: '55mm', display: 'block', borderRadius: '4px', border: '1px solid #e2e8f0', objectFit: 'contain' }}
                        />
                      </div>
                    )}
                  </div>

                  <div style={{ border: '1px solid #e2e8f0', borderLeft: `6px solid #2563eb`, borderRadius: '10px', padding: '5mm', marginBottom: '4mm' }}>
                    <p style={{ fontSize: '11px', fontWeight: 900, color: COLORS.text, margin: '0 0 2mm 0' }}>{meta.section2.title}</p>
                    <p style={{ fontSize: '13px', fontWeight: 900, color: '#cb563e', margin: '0 0 2mm 0' }}>{`${meta.section2.scorePrefix}${score}${meta.section2.scoreSuffix}`}</p>
                    <p style={{ fontSize: '12px', color: '#334155', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.7, wordBreak: 'break-word', overflowWrap: 'anywhere', maxWidth: '100%' }}>{scoreReason}</p>
                  </div>

                  <div style={{ border: '1px solid #e2e8f0', borderLeft: `6px solid #2563eb`, borderRadius: '10px', padding: '5mm', flex: 1 }}>
                    <p style={{ fontSize: '11px', fontWeight: 900, color: COLORS.text, margin: '0 0 2mm 0' }}>{meta.section3.title}</p>
                    <p style={{ fontSize: '12px', color: '#334155', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.7, wordBreak: 'break-word', overflowWrap: 'anywhere', maxWidth: '100%' }}>{learnings}</p>
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
