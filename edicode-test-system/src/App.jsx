import React, { useState, useEffect, useCallback, useRef } from 'react';
import { doc, setDoc, collection, onSnapshot, deleteDoc } from 'firebase/firestore';

import { auth, db, appId, initAuth, watchAuth } from './firebase.js';
import { COLORS } from './theme.js';
import {
  CheckCircle, BookOpen, AlertCircle, Download, ArrowLeft, Save, ChevronDown, RefreshCw
} from './components/Icons.jsx';
import { ReviewTextBox, SectionHeading, GoodMoreList } from './components/Common.jsx';
import activeTest from './config.js';

const { meta, questions, demoAnswers, graphs } = activeTest;

const DRAFTS_KEY = `edicode_${meta.id}_drafts_v1`;
const LIVE_SESSION_KEY = `edicode_${meta.id}_live_session_v1`;

// ---- 採点エンジン（問題ごとの score() があればそちらを優先。無ければ type ごとの既定ルール） ----
const getQuestionScore = (q, data) => {
  const ua = data[q.id];
  if (!ua) return 0;
  try {
    if (typeof q.score === 'function') return q.score(ua);

    if (q.type === 'radio') return q.correctAnswer === ua ? q.points : 0;

    if (q.type === 'checkbox') {
      return (Array.isArray(ua) && ua.length === q.correctAnswers.length && q.correctAnswers.every(v => ua.includes(v)))
        ? q.points
        : 0;
    }

    if (q.type === 'mixed') {
      const totalInputs = q.inputs?.length || 0;
      if (!totalInputs) return 0;
      const weight = q.points / totalInputs;
      let pts = 0;
      q.correctAnswers.forEach((correct, i) => {
        const given = ua[i + 1];
        if (Array.isArray(correct)) {
          if (correct.includes(given)) pts += weight;
        } else if (given === correct) {
          pts += weight;
        }
      });
      return Math.round(pts);
    }
  } catch (e) {
    return 0;
  }
  return 0;
};

const getDisplayValues = (q, ua) => {
  let displayAnswer = '(未回答)', displayCorrect = '';
  if (!ua) return { displayAnswer, displayCorrect };
  try {
    if (q.type === 'radio') {
      displayAnswer = String(ua);
      displayCorrect = String(q.correctAnswer);
    } else if (q.type === 'checkbox') {
      displayAnswer = ua.join('・');
      displayCorrect = q.correctAnswers.join('・');
    } else if (q.type === 'mixed') {
      const aArr = [], cArr = [];
      for (let i = 1; i <= (q.inputs?.length || 0); i++) {
        aArr.push(`(${i}) ${ua[i] || '(空)'}`);
        const cv = q.displayAnswers
          ? q.displayAnswers[i - 1]
          : (Array.isArray(q.correctAnswers[i - 1]) ? q.correctAnswers[i - 1].join(' または ') : q.correctAnswers[i - 1]);
        cArr.push(`(${i}) ${cv}`);
      }
      displayAnswer = aArr.join(' / ');
      displayCorrect = cArr.join(' / ');
    }
  } catch (e) {
    displayAnswer = 'エラー';
  }
  return { displayAnswer, displayCorrect };
};

export default function App() {
  const [step, setStep] = useState('start');
  const [userName, setUserName] = useState('');
  const [answers, setAnswers] = useState({});
  const [score, setScore] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [targetQuestionIds, setTargetQuestionIds] = useState([]);
  const [quizPage, setQuizPage] = useState(1);
  const [premiseTab, setPremiseTab] = useState('goal');
  const [quickPremiseTab, setQuickPremiseTab] = useState(null);

  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const [showMobilePremise, setShowMobilePremise] = useState(false);
  const saveMenuRef = useRef(null);

  const [answer1, setAnswer1] = useState({ part: '', symptom: '', reason: '' });
  const [answer2, setAnswer2] = useState({ doActions: '', okCriteria: '', nextAction: '' });

  // meta.worksheet を使う汎用の記述式ワークシート（例: test4-nikuの「問題10」設計課題）
  const [worksheetAnswers, setWorksheetAnswers] = useState({});
  const handleWorksheetChange = (key, val) => {
    setWorksheetAnswers(p => ({ ...p, [key]: val }));
  };

  const [currentDraftId, setCurrentDraftId] = useState(null);
  const [currentDraftName, setCurrentDraftName] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showDraftListModal, setShowDraftListModal] = useState(false);
  const [saveModalMode, setSaveModalMode] = useState('overwrite');
  const [draftNameInput, setDraftNameInput] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);

  const [user, setUser] = useState(null);
  const [draftsSnapshot, setDraftsSnapshot] = useState([]);
  const [liveSessionSnapshot, setLiveSessionSnapshot] = useState(null);

  // Firebase 認証（未設定なら auth が null なので何もしない）
  useEffect(() => {
    if (!auth) return;
    initAuth();
    const unsubscribe = watchAuth(setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;

    const draftsCol = collection(db, 'artifacts', appId, 'users', user.uid, 'drafts');
    const unsubscribeDrafts = onSnapshot(draftsCol, (snapshot) => {
      setDraftsSnapshot(snapshot.docs.map(d => d.data()));
    }, (error) => console.error('Drafts sync error', error));

    const liveDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'session', 'live');
    const unsubscribeLive = onSnapshot(liveDocRef, (snap) => {
      setLiveSessionSnapshot(snap.exists() ? snap.data() : null);
    }, (error) => console.error('Live session sync error', error));

    return () => {
      unsubscribeDrafts();
      unsubscribeLive();
    };
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (saveMenuRef.current && !saveMenuRef.current.contains(event.target)) {
        setShowSaveMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getAllDraftsSafe = () => {
    try {
      const data = localStorage.getItem(DRAFTS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Draft fetch failed', e);
      return [];
    }
  };

  const getMergedDrafts = () => {
    const localDrafts = getAllDraftsSafe();
    const merged = [...localDrafts];
    draftsSnapshot.forEach(cloudDraft => {
      const idx = merged.findIndex(d => d.draftId === cloudDraft.draftId);
      if (idx > -1) {
        const cloudTime = new Date(cloudDraft.updatedAt).getTime();
        const localTime = new Date(merged[idx].updatedAt).getTime();
        if (cloudTime > localTime) merged[idx] = cloudDraft;
      } else {
        merged.push(cloudDraft);
      }
    });
    return merged.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  };

  const getLatestLiveSession = () => {
    let localSession = null;
    try {
      const raw = localStorage.getItem(LIVE_SESSION_KEY);
      localSession = raw ? JSON.parse(raw) : null;
    } catch (e) { /* noop */ }

    if (!liveSessionSnapshot) return localSession;
    if (!localSession) return liveSessionSnapshot;

    const cloudTime = new Date(liveSessionSnapshot.updatedAt).getTime();
    const localTime = new Date(localSession.updatedAt).getTime();
    return cloudTime > localTime ? liveSessionSnapshot : localSession;
  };

  const hasAnySavedData = () => getMergedDrafts().length > 0 || !!getLatestLiveSession();

  // PDF生成ライブラリ（html2canvas / jsPDF）を CDN から読み込む
  const [isLibraryLoaded, setIsLibraryLoaded] = useState(false);
  useEffect(() => {
    const loadScripts = async () => {
      const loadScript = (src) => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
      });
      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        setIsLibraryLoaded(true);
      } catch (e) {
        console.error('Library load failed', e);
      }
    };
    loadScripts();
    setIsLoaded(true);
  }, []);

  const createDraftId = () => 'draft_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

  const createDefaultDraftName = (name) => {
    const cleanName = name?.trim() || '名前未入力';
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${meta.draftNamePrefix}_${cleanName}_${yyyy}${mm}${dd}`;
  };

  const buildDraftData = (id, name, timeStamp) => ({
    draftId: id,
    draftName: name,
    updatedAt: timeStamp || new Date().toLocaleString('ja-JP'),
    userName, step, premiseTab, answer1, answer2, worksheetAnswers, answers, score, targetQuestionIds, quizPage
  });

  const saveDraftToLocalStore = (newDraft) => {
    const drafts = getAllDraftsSafe();
    const idx = drafts.findIndex(d => d.draftId === newDraft.draftId);
    if (idx > -1) drafts[idx] = newDraft; else drafts.push(newDraft);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  };

  const saveDraftById = async (id, name) => {
    const timeStamp = new Date().toLocaleString('ja-JP');
    const newDraft = buildDraftData(id, name, timeStamp);

    if (user && db) {
      try {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'drafts', id), newDraft);
        showToast('クラウドに保存しました');
      } catch (e) {
        console.error('Cloud Save error', e);
        saveDraftToLocalStore(newDraft);
        showToast('ローカルに保存しました（クラウド接続エラー）');
      }
    } else {
      saveDraftToLocalStore(newDraft);
      showToast('ローカルに保存しました（オフライン）');
    }

    setCurrentDraftId(id);
    setCurrentDraftName(name);
    setLastSavedAt(timeStamp);
  };

  const renameCurrentDraft = async (id, newName) => {
    const existingDraft = getMergedDrafts().find(d => d.draftId === id);
    if (!existingDraft) return;
    existingDraft.draftName = newName;
    existingDraft.updatedAt = new Date().toLocaleString('ja-JP');

    if (user && db) {
      try {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'drafts', id), existingDraft);
        showToast('保存名を変更しました');
      } catch (e) {
        console.error('Cloud Rename error', e);
        saveDraftToLocalStore(existingDraft);
        showToast('ローカルの保存名を変更しました');
      }
    } else {
      saveDraftToLocalStore(existingDraft);
      showToast('ローカルの保存名を変更しました');
    }

    setCurrentDraftName(newName);
    setLastSavedAt(existingDraft.updatedAt);
  };

  const deleteDraft = async (id) => {
    if (user && db) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'drafts', id));
      } catch (e) {
        console.error('Delete error', e);
      }
    }
    let drafts = getAllDraftsSafe().filter(d => d.draftId !== id);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));

    if (currentDraftId === id) {
      setCurrentDraftId(null);
      setCurrentDraftName('');
      setLastSavedAt('');
    }
    showToast('保存データを削除しました');
  };

  const restoreDraft = (draftData) => {
    if (!draftData) return;
    setUserName(draftData.userName || '');
    setStep(draftData.step || 'start');
    setPremiseTab(draftData.premiseTab || 'goal');
    setAnswer1(draftData.answer1 || { part: '', symptom: '', reason: '' });
    setAnswer2(draftData.answer2 || { doActions: '', okCriteria: '', nextAction: '' });
    setWorksheetAnswers(draftData.worksheetAnswers || {});
    setAnswers(draftData.answers || {});
    setScore(draftData.score || 0);
    setTargetQuestionIds(draftData.targetQuestionIds || []);
    setQuizPage(draftData.quizPage || 1);
    setCurrentDraftId(draftData.draftId || null);
    setCurrentDraftName(draftData.draftName || '');
    setLastSavedAt(draftData.updatedAt || draftData.lastSavedAt || '');
    showToast('保存データを復元しました');
    setShowDraftListModal(false);
  };

  const saveLiveSession = async () => {
    const currentData = {
      userName, step, premiseTab, answer1, answer2, worksheetAnswers, answers, score, targetQuestionIds, quizPage,
      currentDraftId, currentDraftName, lastSavedAt,
      updatedAt: new Date().toLocaleString('ja-JP')
    };
    localStorage.setItem(LIVE_SESSION_KEY, JSON.stringify(currentData));
    if (user && db) {
      try {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'session', 'live'), currentData);
      } catch (e) {
        console.error('Live save error', e);
      }
    }
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  };

  const handleQuickSave = () => {
    if (currentDraftId) saveDraftById(currentDraftId, currentDraftName);
    else handleOpenSaveModal('new');
  };

  const handleOpenSaveModal = (mode) => {
    setSaveModalMode(mode);
    setDraftNameInput(mode === 'rename' ? currentDraftName : createDefaultDraftName(userName));
    setShowSaveModal(true);
  };

  const handleSaveConfirm = () => {
    if (!draftNameInput.trim()) return;
    if (saveModalMode === 'new') saveDraftById(createDraftId(), draftNameInput);
    else if (saveModalMode === 'rename') renameCurrentDraft(currentDraftId, draftNameInput);
    else saveDraftById(currentDraftId, draftNameInput);
    setShowSaveModal(false);
  };

  useEffect(() => {
    if (!isLoaded) return;
    const t = setTimeout(saveLiveSession, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userName, step, premiseTab, answer1, answer2, worksheetAnswers, answers, score, targetQuestionIds, quizPage, currentDraftId, currentDraftName, lastSavedAt, isLoaded, user]);

  const handleStart = () => {
    if (!userName.trim()) return;
    if (userName.trim() === 'テスト') {
      setAnswers(demoAnswers);
      setScore(100);
      setStep('result');
      window.scrollTo(0, 0);
      return;
    }
    setStep('intro1');
    window.scrollTo(0, 0);
  };

  const handleStartQuiz = () => {
    setTargetQuestionIds(questions.map(q => q.id));
    setAnswers({});
    setQuizPage(1);
    setStep('quiz');
    window.scrollTo(0, 0);
  };

  const handleRetryIncorrect = () => {
    const incorrectIds = questions.filter(q => getQuestionScore(q, answers) < q.points).map(q => q.id);
    const newAnswers = { ...answers };
    incorrectIds.forEach(id => { delete newAnswers[id]; });
    setAnswers(newAnswers);
    setTargetQuestionIds(incorrectIds);
    setQuizPage(1);
    setStep('quiz');
    window.scrollTo(0, 0);
  };

  const handleRetryAll = () => {
    setAnswers({});
    setTargetQuestionIds(questions.map(q => q.id));
    setQuizPage(1);
    setStep('quiz');
    window.scrollTo(0, 0);
  };

  const handleAnswerChange = (qId, val, idx = null) => {
    setAnswers(p => {
      if (idx !== null) return { ...p, [qId]: { ...(p[qId] || {}), [idx]: val } };
      return { ...p, [qId]: val };
    });
  };

  const handleCheckboxChange = (qId, val) => {
    setAnswers(p => {
      const cur = p[qId] || [];
      return { ...p, [qId]: cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val] };
    });
  };

  const handleTotalScoreAndGo = () => {
    let s = 0;
    questions.forEach(q => { s += getQuestionScore(q, answers); });
    setScore(s);
    setStep('result');
    window.scrollTo(0, 0);
  };

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
        backgroundColor: '#ffffff',
        ignoreElements: (node) => {
          if (node.tagName) {
            const tag = node.tagName.toLowerCase();
            if (tag === 'img' || tag === 'iframe') return true;
          }
          return false;
        }
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

  const saveAnswerReviewPdf = async () => {
    setIsGenerating(true);
    try {
      const cleanUserName = (userName || '').trim() ? userName.trim().replace(/[/\?%*:|"<>\s]/g, '_') : '名前未入力';
      const ok = await renderPagesToPdf(
        ['pdf-review-page-1', 'pdf-review-page-2', 'pdf-review-page-3'],
        meta.pdfReviewFileName(cleanUserName)
      );
      setIsGenerating(false);
      if (ok) showToast('入力レポートを保存しました');
    } catch (err) {
      console.error('PDF生成エラー:', err);
      setIsGenerating(false);
      showToast(`PDF生成中にエラーが発生しました: ${err.message || '不明なエラー'}`);
    }
  };

  const saveWorksheetPdf = async () => {
    setIsGenerating(true);
    try {
      const cleanUserName = (userName || '').trim() ? userName.trim().replace(/[/\?%*:|"<>\s]/g, '_') : '名前未入力';
      const stepPageCount = Math.ceil((meta.worksheet?.steps?.length || 0) / 2);
      const pageIds = Array.from({ length: stepPageCount + 1 }, (_, i) => `pdf-worksheet-page-${i + 1}`);
      const ok = await renderPagesToPdf(pageIds, meta.pdfWorksheetFileName(cleanUserName));
      setIsGenerating(false);
      if (ok) showToast('設計課題レポートを保存しました');
    } catch (err) {
      console.error('PDF生成エラー:', err);
      setIsGenerating(false);
      showToast(`PDF生成中にエラーが発生しました: ${err.message || '不明なエラー'}`);
    }
  };

  // 合格証＋回答レポートのPDF化。解説文が長い設問があるため、1ページ＝1問とし、
  // 1ページ目に合格証を差し込む。
  const certReviewPageIds = questions.map((_, i) => `pdf-cert-review-page-${i + 1}`);

  const saveToPdf = async () => {
    try {
      const pageIds = ['pdf-cert-page-1', ...certReviewPageIds];
      const ok = await renderPagesToPdf(pageIds, meta.pdfCertFileName(userName));
      setIsGenerating(false);
      if (ok) showToast('合格証とレポートを保存しました');
    } catch (err) {
      console.error('PDF生成エラー:', err);
      setIsGenerating(false);
      showToast(`PDF生成中にエラーが発生しました: ${err.message || '不明なエラー'}`);
    }
  };

  const handleToggleSaveMenu = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowSaveMenu(prev => !prev);
  }, []);

  const handleAction = useCallback((actionFn) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    actionFn();
    setShowSaveMenu(false);
  }, []);

  const pdfPageContainerStyle = {
    width: '210mm', minHeight: '297mm', padding: '20mm', boxSizing: 'border-box',
    backgroundColor: '#ffffff', color: '#182349', fontFamily: 'sans-serif',
    display: 'flex', flexDirection: 'column', position: 'relative'
  };

  // 合格証に表示する章番号・講座名・発行者情報（meta側で上書きできるが、未指定ならテスト名から組み立てる）
  const certChapterNumber = meta.certChapterNumber || (meta.chapterLabel || '').split(' ')[0] || '';
  const certCourseTitle = meta.certCourseTitle || meta.testCodeSub || '';
  const certIssuerRole = meta.certIssuerRole || 'EDICODE講師';
  const certIssuerName = meta.certIssuerName || '辻岡靖明';
  const reportSubtitle = meta.reportSubtitle || `${meta.testCode} -${meta.testCodeSub}-`;
  const certFontFamily = "'マティスV', 'Matisse V', serif";

  // 発行日を「令和◯年◯月◯日」形式で返す
  const formatReiwaDate = () => {
    const now = new Date();
    const reiwaYear = now.getFullYear() - 2018;
    return `令和${reiwaYear}年${now.getMonth() + 1}月${now.getDate()}日`;
  };

  const premiseTabs = [
    { id: 'goal', label: '料理のゴール' },
    { id: 'recipe', label: 'レシピ' },
    { id: 'tasting', label: '味見した印象' }
  ];

  const renderGoalContent = () => {
    const g = meta.premise.goal;
    return (
      <div className="space-y-6 animate-fade-in w-full box-border min-w-0 break-words">
        <SectionHeading accent>料理のゴール</SectionHeading>
        <div className="bg-gray-50 p-3 md:p-4 rounded-xl space-y-2 w-full box-border min-w-0">
          <h4 className="text-[13px] md:text-[14px] font-extrabold text-[#cb563e]">想定シチュエーション</h4>
          <div className="text-[13px] md:text-[14px] leading-relaxed text-gray-700 whitespace-pre-wrap">{g.scenario}</div>
        </div>
        <div className="bg-gray-50 p-3 md:p-4 rounded-xl space-y-2 w-full box-border min-w-0">
          <h4 className="text-[13px] md:text-[14px] font-extrabold text-[#cb563e]">食べ手の期待</h4>
          <ul className="text-[13px] md:text-[14px] leading-relaxed text-gray-700 space-y-1.5 list-disc pl-5">
            {g.expectations.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
        <div className="bg-white border border-gray-100 p-3 md:p-4 rounded-xl space-y-4 shadow-sm w-full box-border min-w-0">
          <h4 className="text-[14px] md:text-[15px] font-black text-[#182349] pb-1 border-b border-gray-100">美味しさの3軸の整理</h4>
          <div className="space-y-2 w-full min-w-0">
            <h5 className="text-[13px] md:text-[14px] font-extrabold text-[#182349]">▼ らしさ</h5>
            <p className="text-[13px] md:text-[14px] leading-relaxed text-gray-700 whitespace-pre-wrap">{g.rashisa}</p>
            <div className="grid grid-cols-2 gap-2 pt-2 w-full">
              {g.rashisaParts.map((part, i) => (
                <div key={i} className={`p-2 rounded-lg text-center text-[11px] md:text-[12px] font-bold min-w-0 border ${i === 0 ? 'bg-orange-50 border-orange-100' : 'bg-indigo-50 border-indigo-100'}`}>
                  <span className={i === 0 ? 'text-[#cb563e]' : 'text-[#182349]'}>{part.label}</span><br />
                  {part.items.map((it, j) => <span key={j} className="block truncate">{it}</span>)}
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-1 w-full">
            <h5 className="text-[13px] md:text-[14px] font-extrabold text-[#182349]">▼ コク</h5>
            <p className="text-[13px] md:text-[14px] leading-relaxed text-gray-700 whitespace-pre-wrap">{g.koku}</p>
          </div>
          <div className="space-y-2 w-full min-w-0">
            <h5 className="text-[13px] md:text-[14px] font-extrabold text-[#182349]">▼ コントラスト</h5>
            <div className="text-[12px] md:text-[13px] leading-relaxed text-gray-700 space-y-1.5 pl-2 border-l-2 border-indigo-100 w-full box-border">
              {Object.entries(g.contrast).map(([key, val]) => (
                <p key={key}><strong>{key}:</strong> {val}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderRecipeContent = () => {
    const r = meta.premise.recipe;
    return (
      <div className="space-y-6 animate-fade-in w-full box-border min-w-0 break-words">
        <SectionHeading accent>レシピ</SectionHeading>
        <div className="bg-gray-50 p-3 md:p-4 rounded-xl space-y-3 w-full box-border min-w-0">
          <h4 className="text-[13px] md:text-[14px] font-extrabold text-[#cb563e]">材料・分量</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[12px] md:text-[13px] text-gray-700 w-full">
            {r.ingredientGroups.map((group, i) => (
              <div key={i} className={`space-y-1 bg-white p-2.5 rounded-lg border border-gray-100 shadow-sm w-full box-border min-w-0 ${group.wide ? 'md:col-span-2' : ''}`}>
                <p className="font-extrabold text-[#182349] border-b pb-1">{group.title}</p>
                {group.lines.map((line, j) => <p key={j}>・{line}</p>)}
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white border border-gray-100 p-3 md:p-4 rounded-xl space-y-4 shadow-sm w-full box-border min-w-0">
          <h4 className="text-[14px] md:text-[15px] font-black text-[#182349] pb-1 border-b border-gray-100">調理工程</h4>
          <div className="space-y-3.5 w-full">
            {r.steps.map((proc, idx) => (
              <div key={idx} className="flex gap-3 text-[12px] md:text-[13.5px] leading-relaxed text-gray-700 border-b border-gray-50 pb-2.5 last:border-b-0 last:pb-0 w-full min-w-0">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 text-[#cb563e] flex items-center justify-center font-bold text-[12px]">{idx + 1}</span>
                <p className="pt-0.5 flex-1 min-w-0">{proc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderTastingContent = () => {
    const t = meta.premise.tasting;
    const sections = [
      { title: 'らしさ', data: t.rashisa },
      { title: 'コク', data: t.koku },
      { title: 'コントラスト', data: t.contrast }
    ];
    return (
      <div className="space-y-6 animate-fade-in w-full box-border min-w-0 break-words">
        <SectionHeading accent>味見した印象</SectionHeading>
        {sections.map((s, i) => (
          <div key={i} className="bg-white border border-gray-100 p-3 md:p-4 rounded-xl space-y-3 shadow-sm w-full box-border min-w-0">
            <h4 className="text-[13px] md:text-[14px] font-black text-[#182349] border-l-4 border-indigo-600 pl-2">{s.title}</h4>
            <GoodMoreList good={s.data.good} more={s.data.more} />
          </div>
        ))}
      </div>
    );
  };

  const renderPremiseTabContent = (tab) => {
    if (tab === 'goal') return renderGoalContent();
    if (tab === 'recipe') return renderRecipeContent();
    if (tab === 'tasting') return renderTastingContent();
    return null;
  };

  const renderQuickPremiseReview = () => (
    <div className="bg-[#fffdf8] border border-orange-100 rounded-2xl p-3 md:p-4 lg:p-5 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div>
          <p className="text-[11px] md:text-[12px] font-extrabold text-[#cb563e] flex items-center gap-1.5">
            <BookOpen className="w-4 h-4" />
            前提情報を再確認
          </p>
          <p className="text-[11px] md:text-[12px] text-gray-500 mt-1 leading-relaxed">
            回答中も、必要に応じて「料理のゴール」「レシピ」「味見した印象」を確認できます。
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {premiseTabs.map(btn => (
          <button
            key={btn.id}
            type="button"
            onClick={() => setQuickPremiseTab(p => p === btn.id ? null : btn.id)}
            className={`py-2 px-1 md:py-2.5 rounded-xl border-2 font-bold text-center transition-all text-[11px] md:text-[13px] ${
              quickPremiseTab === btn.id
                ? 'bg-[#182349] text-white border-[#182349] shadow-md'
                : 'bg-white text-[#182349] border-orange-100 hover:bg-orange-50 hover:text-[#cb563e]'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>
      {quickPremiseTab && (
        <div className="bg-white border border-orange-100 rounded-2xl p-3 md:p-4 max-h-[38vh] overflow-y-auto text-[12px] md:text-[13px] leading-relaxed text-gray-700 space-y-4" style={{ scrollbarGutter: 'stable' }}>
          {renderPremiseTabContent(quickPremiseTab)}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen relative pb-12" style={{ backgroundColor: COLORS.background, color: COLORS.text, fontFamily: 'sans-serif' }}>

      {toastMessage && (
        <div className="fixed top-4 right-4 bg-[#182349] text-white px-4 md:px-6 py-2 md:py-3 rounded-xl shadow-2xl font-bold flex items-center gap-2 pointer-events-auto" style={{ zIndex: 99999 }}>
          <CheckCircle className="w-5 h-5 text-green-400" />
          {toastMessage}
        </div>
      )}

      {['premise', 'answer1', 'answer2', 'review', 'quiz', 'result', 'worksheet', 'worksheetReview'].includes(step) && (
        <div className="sticky top-0 z-[50] pt-4 px-2 md:px-4 pointer-events-none">
          <div className="bg-white/95 backdrop-blur-md border border-gray-200 px-4 py-3 shadow-lg flex flex-row justify-between items-center gap-3 rounded-2xl pointer-events-auto relative">
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-[10px] font-bold text-gray-400">現在の保存ステータス</span>
              <span className="text-[12px] font-black text-[#182349] truncate">保存名: {currentDraftName || '未保存 (自動保存中)'}</span>
              <span className="text-[10px] text-gray-500">最終保存: {lastSavedAt || '未保存'}</span>
            </div>
            <div className="relative" style={{ zIndex: 60 }} ref={saveMenuRef}>
              <button
                type="button"
                onClick={handleToggleSaveMenu}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-[#182349] rounded-xl text-xs font-bold transition-all cursor-pointer pointer-events-auto"
              >
                <Save className="w-4 h-4 pointer-events-none" />
                <span className="pointer-events-none">メニュー</span>
                <ChevronDown className="w-3 h-3 pointer-events-none" />
              </button>
              {showSaveMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden flex flex-col" style={{ zIndex: 70 }}>
                  <button type="button" onClick={handleAction(handleQuickSave)} className="px-4 py-3 text-left text-sm font-bold text-[#182349] hover:bg-gray-50 border-b border-gray-100 w-full cursor-pointer pointer-events-auto">上書き保存</button>
                  <button type="button" onClick={handleAction(() => handleOpenSaveModal('new'))} className="px-4 py-3 text-left text-sm font-bold text-[#182349] hover:bg-gray-50 border-b border-gray-100 w-full cursor-pointer pointer-events-auto">別名で保存</button>
                  {currentDraftId && (
                    <button type="button" onClick={handleAction(() => handleOpenSaveModal('rename'))} className="px-4 py-3 text-left text-sm font-bold text-[#182349] hover:bg-gray-50 border-b border-gray-100 w-full cursor-pointer pointer-events-auto">名前変更</button>
                  )}
                  <button type="button" onClick={handleAction(() => setShowDraftListModal(true))} className="px-4 py-3 text-left text-sm font-bold text-[#cb563e] hover:bg-orange-50 bg-orange-50/50 w-full cursor-pointer pointer-events-auto">保存データ一覧</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className={`max-w-3xl mx-auto px-4 ${['start', 'intro1', 'intro2'].includes(step) ? 'pt-6 md:pt-10' : 'pt-6'}`}>
        <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 overflow-hidden relative">

          {/* 1. 表紙 */}
          {step === 'start' && (
            <div className="animate-fade-in pb-12">
              <div className="h-[14px] w-full" style={{ background: COLORS.gradientBar }}></div>
              <div className="px-4 md:px-6 lg:px-12 pt-8 md:pt-10 text-center">
                <p className="text-[#cb563e] font-extrabold text-[11px] md:text-[12px] uppercase tracking-wider mb-2">EDICODE</p>
                <h1 className="text-[20px] md:text-[24px] lg:text-[28px] font-[900] text-[#182349] leading-tight mb-4">
                  {meta.testCode}<br />{meta.testCodeSub}
                </h1>
                <p className="text-[13px] md:text-[15px] lg:text-[16px] text-gray-500 font-bold mb-6 md:mb-8">
                  {meta.chapterLabel}<br />{meta.themeLabel}
                </p>
                <div className="relative mb-6 mt-6">
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="お名前を入力してください"
                    className="w-full py-5 px-6 border-2 border-gray-50 rounded-[20px] text-center text-[16px] md:text-[19px] font-bold focus:border-[#c45a43] outline-none shadow-[inset_0_2px_10px_rgba(0,0,0,0.03)] placeholder-gray-300 transition-all"
                  />
                </div>
                <button
                  onClick={handleStart}
                  disabled={!userName.trim()}
                  className="w-full md:w-auto px-10 py-5 rounded-[20px] font-black text-white text-[21px] shadow-lg transition-all active:scale-95 disabled:opacity-50"
                  style={{ backgroundColor: userName.trim() ? '#cb563e' : '#757575' }}
                >
                  次へ進む
                </button>
                {hasAnySavedData() && (
                  <button
                    onClick={() => setShowDraftListModal(true)}
                    className="w-full md:w-auto mt-6 px-6 py-4 bg-indigo-50 border border-indigo-100 text-[#182349] hover:bg-indigo-100 rounded-[20px] font-bold text-[14px] md:text-[15px] shadow-sm transition-all flex items-center justify-center gap-2 mx-auto"
                  >
                    <BookOpen className="w-5 h-5 text-[#cb563e]" />
                    保存データから編集を再開する
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 2. 説明ページ1 */}
          {step === 'intro1' && (
            <div className="animate-fade-in p-4 md:p-6 lg:p-10 relative">
              <div className="h-[14px] w-full absolute top-0 left-0" style={{ background: COLORS.gradientBar }}></div>
              <div className="flex justify-center mb-4 md:mb-6 mt-2">
                <div className="w-20 h-20 rounded-full bg-[#fffdf8] border border-orange-100 flex items-center justify-center shadow-sm">
                  <BookOpen className="w-10 h-10 text-[#cb563e]" />
                </div>
              </div>
              <h2 className="text-[18px] md:text-[24px] font-black text-center text-[#182349] pb-4 border-b border-gray-100">
                {meta.intro1.heading}
              </h2>
              <div className="mt-8 space-y-6 text-[14px] md:text-[15px] leading-[1.8] text-[#475569] font-medium max-h-[60vh] overflow-y-auto px-2 md:px-4">
                <p>{meta.intro1.lead.map((line, i) => <React.Fragment key={i}>{line}<br /></React.Fragment>)}</p>
                <p>{meta.intro1.bulletsIntro}</p>
                <div className="pl-4 md:pl-6 space-y-2.5">
                  {meta.intro1.bullets.map((b, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-[#cb563e] font-black mt-0.5">•</span>
                      <span className="font-bold text-[#cb563e] tracking-wide">{b}</span>
                    </div>
                  ))}
                </div>
                <p>{meta.intro1.bulletsOutro}</p>
                <div className="mt-8 bg-[#fffcf9] p-5 rounded-2xl border border-[#fed7aa] shadow-sm flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-[#cb563e] flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-[#182349] text-[14px] md:text-[15px] mb-1">{meta.intro1.noteTitle}</p>
                    <p className="text-[12px] md:text-[13px] text-gray-600 leading-relaxed font-medium">{meta.intro1.noteBody}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-10">
                <button onClick={() => { setStep('start'); window.scrollTo(0, 0); }} className="w-full sm:w-auto px-4 md:px-6 py-3 md:py-4 rounded-[20px] font-bold text-gray-400 hover:text-gray-600 hover:bg-gray-50 text-[14px] md:text-[16px] transition-all flex items-center justify-center gap-2">
                  <ArrowLeft className="w-5 h-5" /> 戻る
                </button>
                <button onClick={() => { setStep('intro2'); window.scrollTo(0, 0); }} className="w-full sm:flex-1 max-w-[400px] py-3 md:py-4 bg-[#cb563e] text-white rounded-[20px] font-black text-[16px] md:text-[18px] shadow-lg shadow-[#cb563e]/20 hover:brightness-110 active:scale-95 transition-all">
                  受講の流れを確認する
                </button>
              </div>
            </div>
          )}

          {/* 3. 説明ページ2 */}
          {step === 'intro2' && (
            <div className="animate-fade-in p-4 md:p-6 lg:p-10">
              <div className="h-[14px] w-full absolute top-0 left-0" style={{ background: COLORS.gradientBar }}></div>
              <h2 className="text-[18px] md:text-[22px] font-black text-center text-[#182349] mb-6 pb-3 border-b border-gray-100">
                {meta.intro2.heading}
              </h2>
              <div className="space-y-8 max-h-[58vh] overflow-y-auto pr-1">
                <div className="bg-[#fffcf9] rounded-[24px] border border-orange-100 p-4 md:p-6 shadow-sm">
                  <h3 className="font-black text-[#cb563e] text-[14px] md:text-[16px] mb-2 flex items-center gap-2 pb-2 border-b border-orange-100">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#cb563e] inline-block"></span>
                    {meta.intro2.flowTitle}
                  </h3>
                  <p className="text-[12px] md:text-[13px] text-gray-400 mb-5 leading-relaxed font-medium">{meta.intro2.flowLead}</p>
                  <div className="space-y-4">
                    {meta.intro2.flowSteps.map((stepText, idx) => (
                      <div key={idx} className="flex gap-4 items-start pb-3.5 last:pb-0 last:border-b-0 border-b border-gray-100">
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-orange-50 text-[#cb563e] flex items-center justify-center font-black text-[13px] md:text-[14px] border border-orange-100 shadow-sm">{idx + 1}</div>
                        <p className="text-[13px] md:text-[14px] leading-[1.6] text-gray-700 font-bold pt-0.5 whitespace-pre-wrap">{stepText}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-[24px] border border-gray-200 p-4 md:p-6 shadow-inner">
                  <h3 className="font-black text-[#182349] text-[14px] md:text-[16px] mb-3 flex items-center gap-2 pb-2 border-b border-gray-200">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#182349] inline-block"></span>
                    {meta.intro2.noteTitle}
                  </h3>
                  <p className="text-[12px] md:text-[13px] text-gray-500 leading-relaxed mb-4">{meta.intro2.noteLead}</p>
                  <p className="text-[13px] md:text-[14px] text-gray-700 font-medium leading-relaxed mb-5">{meta.intro2.noteBody}</p>
                  <div className="bg-white p-4 rounded-2xl border border-gray-100 mb-5 shadow-sm">
                    <p className="text-[10px] md:text-[11px] text-gray-400 font-extrabold mb-2.5 tracking-wider">{meta.intro2.exampleLabel}</p>
                    <div className="flex flex-wrap gap-2">
                      {meta.intro2.examples.map((tagText, idx) => (
                        <span key={idx} className="bg-orange-50 text-[#cb563e] px-3 py-1.5 rounded-xl text-[11px] md:text-[12px] font-bold border border-orange-100 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#cb563e]"></span>
                          {tagText}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-[13px] md:text-[14px] text-gray-700 leading-relaxed font-bold border-l-[4px] border-[#cb563e] pl-4 py-2 bg-white rounded-r-xl shadow-sm">
                    {meta.intro2.emphasis.map((line, i) => <React.Fragment key={i}>{line}<br /></React.Fragment>)}
                  </div>
                </div>

                <div className="bg-[#f4f7fc] rounded-[24px] border border-indigo-100 p-4 md:p-6 shadow-sm">
                  <h3 className="font-black text-[#182349] text-[14px] md:text-[16px] mb-4 flex items-center gap-2 pb-2 border-b border-indigo-100">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#182349] inline-block"></span>
                    {meta.intro2.checklistTitle}
                  </h3>
                  <div className="space-y-3.5">
                    {meta.intro2.checklist.map((text, idx) => (
                      <div key={idx} className="flex gap-2.5 items-start">
                        <span className="text-[#182349] mt-1 flex-shrink-0"><CheckCircle className="w-4 h-4" /></span>
                        <p className="text-[13px] md:text-[14px] leading-[1.6] text-gray-700 font-bold">{text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mt-8">
                <button onClick={() => { setStep('intro1'); window.scrollTo(0, 0); }} className="w-full sm:w-auto px-4 md:px-6 py-3 md:py-4 rounded-[20px] font-bold text-gray-400 hover:text-gray-600 text-[14px] md:text-[16px] transition-all flex items-center justify-center gap-2">
                  <ArrowLeft className="w-4 h-4" /> 戻る
                </button>
                <button
                  onClick={() => {
                    if (meta.premise) {
                      setStep('premise');
                      setPremiseTab('goal');
                    } else {
                      handleStartQuiz();
                    }
                    window.scrollTo(0, 0);
                  }}
                  className="w-full sm:flex-1 py-3 md:py-4 bg-[#cb563e] text-white rounded-[20px] font-black text-[16px] md:text-[18px] shadow-lg hover:brightness-110 active:scale-95 transition-all"
                >
                  {meta.premise ? '前提情報の確認へ進む' : '問題に進む'}
                </button>
              </div>
            </div>
          )}

          {/* 4. 前提情報の確認 */}
          {step === 'premise' && (
            <div className="animate-fade-in p-4 md:p-6 lg:p-8">
              <div className="h-[14px] w-full absolute top-0 left-0" style={{ background: COLORS.gradientBar }}></div>
              <h2 className="text-[18px] md:text-[22px] font-black text-center text-[#182349] mb-3 pb-3 border-b border-gray-100">前提情報の確認</h2>
              <p className="text-[13px] md:text-[14px] text-gray-600 text-center mb-6 leading-relaxed">
                まずは、今回扱う料理の情報を確認してください。<br />このページでは、以下の3つを確認してください。
              </p>
              <div className="grid grid-cols-3 gap-2 md:gap-3 mb-8 w-full">
                {premiseTabs.map(btn => (
                  <button
                    key={btn.id}
                    onClick={() => setPremiseTab(p => p === btn.id ? null : btn.id)}
                    className={`py-3 px-1 rounded-xl border-2 font-bold text-center transition-all text-[11px] sm:text-[12px] md:text-[15px] ${
                      premiseTab === btn.id
                        ? 'bg-[#182349] text-white border-[#182349] shadow-md'
                        : 'bg-white text-[#182349] border-gray-200 hover:bg-gray-50 hover:text-[#cb563e]'
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
              <div className="max-h-[50vh] overflow-y-auto overflow-x-hidden pr-3 md:pr-4 space-y-6 mb-8 border-t border-gray-100 pt-4 w-full box-border min-w-0" style={{ scrollbarGutter: 'stable' }}>
                {premiseTab ? renderPremiseTabContent(premiseTab) : (
                  <div className="text-center py-12 text-gray-400 font-bold w-full">上のボタンを押して内容を展開してください。</div>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mt-4 w-full">
                <button onClick={() => { setStep('intro2'); window.scrollTo(0, 0); }} className="w-full sm:w-auto px-4 md:px-6 py-3 md:py-4 rounded-[20px] font-bold text-gray-400 hover:text-gray-600 text-[14px] md:text-[16px] transition-all flex items-center justify-center gap-2">
                  <ArrowLeft className="w-4 h-4" /> 戻る
                </button>
                <button onClick={() => { setStep('answer1'); window.scrollTo(0, 0); }} className="w-full sm:flex-1 py-3 md:py-4 bg-[#cb563e] text-white rounded-[20px] font-black text-[16px] md:text-[18px] shadow-lg hover:brightness-110 active:scale-95 transition-all">
                  問題に進む
                </button>
              </div>
            </div>
          )}

          {/* 5. 回答入力ページ① */}
          {step === 'answer1' && (
            <div className="animate-fade-in p-4 md:p-6 lg:p-8">
              <div className="h-[14px] w-full absolute top-0 left-0" style={{ background: COLORS.gradientBar }}></div>
              <div className="hidden md:block">{renderQuickPremiseReview()}</div>
              <div className="md:hidden mb-4 md:mb-6 mt-2">
                <button type="button" onClick={() => setShowMobilePremise(!showMobilePremise)} className="w-full py-3 px-4 bg-white border-2 border-[#182349] text-[#182349] rounded-xl font-bold text-[13px] md:text-[14px] transition-all flex justify-center items-center gap-2 shadow-sm">
                  <BookOpen className="w-4 h-4" /> 前提情報を再確認する {showMobilePremise ? '▲' : '▼'}
                </button>
                {showMobilePremise && <div className="mt-4 animate-fade-in">{renderQuickPremiseReview()}</div>}
              </div>

              <h2 className="text-[18px] md:text-[22px] font-black text-[#182349] mb-4 md:mb-6 pb-2 border-b border-gray-100 flex items-center gap-2">
                <span className="w-2.5 h-6 rounded-md bg-[#cb563e] inline-block"></span>
                {meta.answer1.heading1}
              </h2>
              <p className="text-[12px] md:text-[13px] text-gray-500 leading-relaxed mb-4 md:mb-6">{meta.answer1.lead1}</p>

              <div className="bg-gray-50 p-4 md:p-5 rounded-2xl border border-gray-100 space-y-4 mb-6 md:mb-8">
                <div className="space-y-1.5">
                  <label className="block text-[13px] md:text-[14px] font-black text-[#182349]">
                    {meta.answer1.partLabel} <span className="text-[#cb563e] text-[11px] font-bold bg-orange-50 px-1.5 py-0.5 rounded-md ml-1 border border-orange-100">必須</span>
                  </label>
                  <select value={answer1.part} onChange={(e) => setAnswer1(p => ({ ...p, part: e.target.value }))} className="w-full p-3 md:p-3.5 border-2 border-gray-200 rounded-xl bg-white font-bold text-[13px] md:text-[14px] text-[#182349] outline-none focus:border-[#cb563e] transition-all">
                    <option value="">選択してください</option>
                    {meta.answer1.partOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[13px] md:text-[14px] font-black text-[#182349]">
                    {meta.answer1.symptomLabel} <span className="text-[#cb563e] text-[11px] font-bold bg-orange-50 px-1.5 py-0.5 rounded-md ml-1 border border-orange-100">必須</span>
                  </label>
                  <select value={answer1.symptom} onChange={(e) => setAnswer1(p => ({ ...p, symptom: e.target.value }))} className="w-full p-3 md:p-3.5 border-2 border-gray-200 rounded-xl bg-white font-bold text-[13px] md:text-[14px] text-[#182349] outline-none focus:border-[#cb563e] transition-all">
                    <option value="">選択してください</option>
                    {meta.answer1.symptomOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              </div>

              <h2 className="text-[18px] md:text-[22px] font-black text-[#182349] mb-4 md:mb-6 pb-2 border-b border-gray-100 flex items-center gap-2">
                <span className="w-2.5 h-6 rounded-md bg-[#cb563e] inline-block"></span>
                {meta.answer1.heading2}
              </h2>
              <p className="text-[12px] md:text-[13px] text-gray-500 leading-relaxed mb-4">{meta.answer1.lead2}</p>

              <div className="relative mb-4 md:mb-6">
                <textarea
                  value={answer1.reason}
                  onChange={(e) => { if (e.target.value.length <= 500) setAnswer1(p => ({ ...p, reason: e.target.value })); }}
                  className="w-full h-32 md:h-40 p-3 md:p-4 border-2 border-gray-200 rounded-2xl bg-white text-[13px] md:text-[14px] leading-relaxed outline-none focus:border-[#cb563e] resize-none transition-all placeholder-gray-300 whitespace-pre-wrap break-all"
                />
                <div className="text-right text-[11px] md:text-[12px] text-gray-400 font-bold mt-1">{answer1.reason.length} / 500 文字</div>
              </div>

              <div className="bg-[#fffdf8] border border-orange-100 p-3 md:p-4 rounded-xl mb-6 md:mb-8 shadow-sm">
                <p className="font-extrabold text-[#cb563e] text-[11px] md:text-[12px] mb-1 flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" /> 考えるヒント：</p>
                <ul className="text-[11px] md:text-[12px] text-gray-600 space-y-1 list-disc pl-4 leading-relaxed">
                  {meta.answer1.hints.map((h, i) => <li key={i}>{h}</li>)}
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center w-full">
                <button onClick={() => { setStep('premise'); window.scrollTo(0, 0); }} className="w-full sm:w-auto px-4 md:px-6 py-3 md:py-4 rounded-[20px] font-bold text-gray-400 hover:text-gray-600 text-[14px] md:text-[16px] transition-all flex items-center justify-center gap-2">
                  <ArrowLeft className="w-4 h-4" /> 戻る
                </button>
                <button
                  onClick={() => { setStep('answer2'); window.scrollTo(0, 0); }}
                  disabled={!answer1.part || !answer1.symptom || !answer1.reason.trim()}
                  className="w-full sm:flex-1 py-3 md:py-4 text-white rounded-[20px] font-black text-[16px] md:text-[18px] shadow-lg transition-all active:scale-95 disabled:opacity-50"
                  style={{ backgroundColor: (answer1.part && answer1.symptom && answer1.reason.trim()) ? '#cb563e' : '#757575' }}
                >
                  次へ進む
                </button>
              </div>
            </div>
          )}

          {/* 6. 回答入力ページ② */}
          {step === 'answer2' && (
            <div className="animate-fade-in p-4 md:p-6 lg:p-8">
              <div className="h-[14px] w-full absolute top-0 left-0" style={{ background: COLORS.gradientBar }}></div>
              <div className="hidden md:block">{renderQuickPremiseReview()}</div>
              <div className="md:hidden mb-4 md:mb-6 mt-2">
                <button type="button" onClick={() => setShowMobilePremise(!showMobilePremise)} className="w-full py-3 px-4 bg-white border-2 border-[#182349] text-[#182349] rounded-xl font-bold text-[13px] md:text-[14px] transition-all flex justify-center items-center gap-2 shadow-sm">
                  <BookOpen className="w-4 h-4" /> 前提情報を再確認する {showMobilePremise ? '▲' : '▼'}
                </button>
                {showMobilePremise && <div className="mt-4 animate-fade-in">{renderQuickPremiseReview()}</div>}
              </div>

              <div className="max-h-[66vh] overflow-y-auto pr-2 space-y-6 md:space-y-8 pb-4" style={{ scrollbarGutter: 'stable' }}>
                <div className="bg-gray-50 p-4 md:p-5 rounded-2xl border border-gray-100 space-y-4">
                  <h2 className="text-[18px] md:text-[22px] font-black text-[#182349] border-b pb-2 flex items-center gap-2">
                    <span className="w-2.5 h-6 rounded-md bg-[#cb563e] inline-block"></span>
                    {meta.answer2.heading3}
                  </h2>
                  <p className="text-[12px] md:text-[13px] text-gray-500 leading-relaxed whitespace-pre-wrap">{meta.answer2.lead3}</p>
                  <div className="space-y-1.5">
                    <label className="block text-[13px] md:text-[14px] font-black text-[#182349]">
                      {meta.answer2.doActionsLabel} <span className="text-[#cb563e] text-[10px] md:text-[11px] font-bold bg-orange-50 px-1.5 py-0.5 rounded-md ml-1 border border-orange-100">必須</span>
                    </label>
                    <p className="text-[11px] md:text-[12px] text-gray-400">{meta.answer2.doActionsHint}</p>
                    <textarea
                      value={answer2.doActions}
                      onChange={(e) => { if (e.target.value.length <= 500) setAnswer2(p => ({ ...p, doActions: e.target.value })); }}
                      className="w-full h-24 p-2.5 md:p-3 border-2 border-gray-200 rounded-xl bg-white text-[13px] md:text-[14px] leading-relaxed outline-none focus:border-[#cb563e] resize-none transition-all placeholder-gray-300 whitespace-pre-wrap break-all"
                    />
                    <div className="text-right text-[10px] md:text-[11px] text-gray-400 font-bold">{answer2.doActions.length} / 500</div>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 md:p-5 rounded-2xl border border-gray-100 space-y-4">
                  <h2 className="text-[18px] md:text-[22px] font-black text-[#182349] border-b pb-2 flex items-center gap-2">
                    <span className="w-2.5 h-6 rounded-md bg-[#cb563e] inline-block"></span>
                    {meta.answer2.heading4}
                  </h2>
                  <p className="text-[12px] md:text-[13px] text-gray-500 leading-relaxed whitespace-pre-wrap">{meta.answer2.lead4}</p>
                  <div className="space-y-1.5">
                    <label className="block text-[13px] md:text-[14px] font-black text-[#182349]">
                      {meta.answer2.okCriteriaLabel} <span className="text-[#cb563e] text-[10px] md:text-[11px] font-bold bg-orange-50 px-1.5 py-0.5 rounded-md ml-1 border border-orange-100">必須</span>
                    </label>
                    <textarea
                      value={answer2.okCriteria}
                      onChange={(e) => { if (e.target.value.length <= 500) setAnswer2(p => ({ ...p, okCriteria: e.target.value })); }}
                      className="w-full h-28 p-2.5 md:p-3 border-2 border-gray-200 rounded-xl bg-white text-[13px] md:text-[14px] leading-relaxed outline-none focus:border-[#cb563e] resize-none transition-all placeholder-gray-300 whitespace-pre-wrap break-all"
                    />
                    <div className="text-right text-[10px] md:text-[11px] text-gray-400 font-bold">{answer2.okCriteria.length} / 500</div>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 md:p-5 rounded-2xl border border-gray-100 space-y-4">
                  <h2 className="text-[18px] md:text-[22px] font-black text-[#182349] border-b pb-2 flex items-center gap-2">
                    <span className="w-2.5 h-6 rounded-md bg-[#cb563e] inline-block"></span>
                    {meta.answer2.heading5}
                  </h2>
                  <p className="text-[12px] md:text-[13px] text-gray-500 leading-relaxed whitespace-pre-wrap">{meta.answer2.lead5}</p>
                  <div className="space-y-1.5">
                    <label className="block text-[13px] md:text-[14px] font-black text-[#182349]">
                      {meta.answer2.nextActionLabel} <span className="text-[#cb563e] text-[10px] md:text-[11px] font-bold bg-orange-50 px-1.5 py-0.5 rounded-md ml-1 border border-orange-100">必須</span>
                    </label>
                    <textarea
                      value={answer2.nextAction}
                      onChange={(e) => { if (e.target.value.length <= 500) setAnswer2(p => ({ ...p, nextAction: e.target.value })); }}
                      className="w-full h-28 p-2.5 md:p-3 border-2 border-gray-200 rounded-xl bg-white text-[13px] md:text-[14px] leading-relaxed outline-none focus:border-[#cb563e] resize-none transition-all placeholder-gray-300 whitespace-pre-wrap break-all"
                    />
                    <div className="text-right text-[10px] md:text-[11px] text-gray-400 font-bold">{answer2.nextAction.length} / 500</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center w-full mt-6">
                <button onClick={() => { setStep('answer1'); window.scrollTo(0, 0); }} className="w-full sm:w-auto px-4 md:px-6 py-3 md:py-4 rounded-[20px] font-bold text-gray-400 hover:text-gray-600 text-[14px] md:text-[16px] transition-all flex items-center justify-center gap-2">
                  <ArrowLeft className="w-4 h-4" /> 戻る
                </button>
                <button
                  onClick={() => { setStep('review'); window.scrollTo(0, 0); }}
                  disabled={!answer2.doActions.trim() || !answer2.okCriteria.trim() || !answer2.nextAction.trim()}
                  className="w-full sm:flex-1 py-3 md:py-4 text-white rounded-[20px] font-black text-[16px] md:text-[18px] shadow-lg transition-all active:scale-95 disabled:opacity-50"
                  style={{ backgroundColor: (answer2.doActions.trim() && answer2.okCriteria.trim() && answer2.nextAction.trim()) ? '#cb563e' : '#757575' }}
                >
                  入力内容を確認する
                </button>
              </div>
            </div>
          )}

          {/* 7. 確認画面 */}
          {step === 'review' && (
            <div className="animate-fade-in p-4 md:p-6 lg:p-8">
              <div className="h-[14px] w-full absolute top-0 left-0" style={{ background: COLORS.gradientBar }}></div>
              <h2 className="text-[18px] md:text-[22px] font-black text-center text-[#182349] mb-4 md:mb-6 pb-3 border-b border-gray-100">入力内容の確認</h2>
              <p className="text-[12px] md:text-[13px] text-gray-500 text-center mb-4 md:mb-6 leading-relaxed">
                記入内容を確認してください。<br />修正したい場合は「戻る」から前のページに戻れます。<br />内容に問題なければ、PDFとして保存してください。
              </p>

              <div className="bg-white p-4 md:p-6 lg:p-8 rounded-2xl border border-gray-100 space-y-4 md:space-y-6 mb-6 md:mb-8 text-[#182349] w-full max-w-full box-border">
                <div className="text-center border-b pb-4 md:pb-6 border-gray-100">
                  <p className="text-[#cb563e] font-extrabold text-[11px] md:text-[12px] uppercase tracking-wider mb-1">{meta.reviewPdfHeaderNote}</p>
                  <h1 className="text-[18px] md:text-[20px] lg:text-[24px] font-[900] text-[#182349] leading-tight">
                    {meta.chapterLabel}<br />{meta.themeLabel}
                  </h1>
                  <p className="text-[13px] md:text-sm font-bold text-[#cb563e] mt-3">【記入者名】 {userName || '（未入力）'}</p>
                  <p className="text-[10px] md:text-[11px] text-gray-400 mt-1">保存日: {new Date().toLocaleDateString('ja-JP')}</p>
                </div>
                <div className="space-y-2">
                  <h3 className="text-[13px] md:text-sm font-black text-[#cb563e] flex items-center gap-1.5 border-b pb-1 border-gray-100">
                    <span className="w-1.5 h-4 bg-[#cb563e] rounded-sm"></span>{meta.answer1.heading1}
                  </h3>
                  <div className="bg-gray-50 p-3 md:p-3.5 rounded-xl border border-gray-100 space-y-2 text-[12px] md:text-sm w-full">
                    <p><strong>{meta.answer1.partLabel}:</strong> {answer1.part || '（未選択）'}</p>
                    <p><strong>{meta.answer1.symptomLabel}:</strong> {answer1.symptom || '（未選択）'}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-[13px] md:text-sm font-black text-[#cb563e] flex items-center gap-1.5 border-b pb-1 border-gray-100">
                    <span className="w-1.5 h-4 bg-[#cb563e] rounded-sm"></span>{meta.answer1.heading2}
                  </h3>
                  <ReviewTextBox>{answer1.reason}</ReviewTextBox>
                </div>
                <div className="space-y-2">
                  <h3 className="text-[13px] md:text-sm font-black text-[#cb563e] flex items-center gap-1.5 border-b pb-1 border-gray-100">
                    <span className="w-1.5 h-4 bg-[#cb563e] rounded-sm"></span>{meta.answer2.heading3}
                  </h3>
                  <div className="bg-gray-50 p-3 md:p-4 rounded-xl border border-gray-100 space-y-4 text-[12px] md:text-sm leading-relaxed w-full">
                    <div>
                      <p className="font-extrabold text-[#182349] text-[10px] md:text-[11px] mb-1">【{meta.answer2.doActionsLabel}】</p>
                      <div className="whitespace-pre-wrap break-all">{answer2.doActions || '未入力'}</div>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-[13px] md:text-sm font-black text-[#cb563e] flex items-center gap-1.5 border-b pb-1 border-gray-100">
                    <span className="w-1.5 h-4 bg-[#cb563e] rounded-sm"></span>{meta.answer2.heading4}
                  </h3>
                  <ReviewTextBox>{answer2.okCriteria}</ReviewTextBox>
                </div>
                <div className="space-y-2">
                  <h3 className="text-[13px] md:text-sm font-black text-[#cb563e] flex items-center gap-1.5 border-b pb-1 border-gray-100">
                    <span className="w-1.5 h-4 bg-[#cb563e] rounded-sm"></span>{meta.answer2.heading5}
                  </h3>
                  <ReviewTextBox>{answer2.nextAction}</ReviewTextBox>
                </div>
              </div>

              {/* PDF出力用の非表示DOM */}
              <div style={{ position: 'absolute', left: '-9999px', top: '0', width: '210mm' }}>
                <div id="pdf-review-page-1" style={pdfPageContainerStyle}>
                  <div className="text-center border-b pb-6 border-gray-200 mb-8">
                    <p style={{ color: COLORS.accent, fontWeight: '900', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>{meta.reviewPdfHeaderNote}</p>
                    <h1 style={{ fontSize: '24px', fontWeight: '900', color: COLORS.text, lineHeight: '1.3', margin: '0 0 12px 0' }}>{meta.chapterLabel}<br />{meta.themeLabel}</h1>
                    <p style={{ fontSize: '15px', fontWeight: 'bold', color: COLORS.accent, margin: '6px 0 0 0' }}>【記入者名】 {userName || '（名前未入力）'}</p>
                    <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0 0' }}>保存日: {new Date().toLocaleDateString('ja-JP')}</p>
                  </div>
                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: '900', color: COLORS.accent, borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '6px', height: '16px', backgroundColor: COLORS.accent, borderRadius: '2px', display: 'inline-block' }}></span>{meta.answer1.heading1}
                    </h3>
                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', fontSize: '13px', lineHeight: '1.6' }}>
                      <p style={{ margin: '0 0 6px 0' }}><strong>{meta.answer1.partLabel}:</strong> {answer1.part || '（未選択）'}</p>
                      <p style={{ margin: 0 }}><strong>{meta.answer1.symptomLabel}:</strong> {answer1.symptom || '（未選択）'}</p>
                    </div>
                  </div>
                  <div>
                    <h3 style={{ fontSize: '14px', fontWeight: '900', color: COLORS.accent, borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '6px', height: '16px', backgroundColor: COLORS.accent, borderRadius: '2px', display: 'inline-block' }}></span>{meta.answer1.heading2}
                    </h3>
                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 16px', fontSize: '12px', lineHeight: '1.5', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                      {answer1.reason || '未入力'}
                    </div>
                  </div>
                </div>

                <div id="pdf-review-page-2" style={pdfPageContainerStyle}>
                  <div style={{ marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                    <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0 }}>{meta.reviewPdfFooterNote}</p>
                  </div>
                  <div style={{ marginTop: '10px' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: '900', color: COLORS.accent, borderBottom: '1px solid #e2e8f0', paddingBottom: '2px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '6px', height: '14px', backgroundColor: COLORS.accent, borderRadius: '2px', display: 'inline-block' }}></span>{meta.answer2.heading3}
                    </h3>
                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px', fontSize: '10px', lineHeight: '1.35' }}>
                      <div style={{ marginBottom: '8px' }}>
                        <p style={{ fontWeight: '900', color: COLORS.text, fontSize: '10px', margin: '0 0 3px 0' }}>【{meta.answer2.doActionsLabel}】</p>
                        <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{answer2.doActions || '未入力'}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div id="pdf-review-page-3" style={pdfPageContainerStyle}>
                  <div style={{ marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                    <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0 }}>{meta.reviewPdfFooterNote}</p>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: '900', color: COLORS.accent, borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '6px', height: '16px', backgroundColor: COLORS.accent, borderRadius: '2px', display: 'inline-block' }}></span>{meta.answer2.heading4}
                    </h3>
                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 16px', fontSize: '11px', lineHeight: '1.4', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                      {answer2.okCriteria || '未入力'}
                    </div>
                  </div>
                  <div>
                    <h3 style={{ fontSize: '14px', fontWeight: '900', color: COLORS.accent, borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '6px', height: '16px', backgroundColor: COLORS.accent, borderRadius: '2px', display: 'inline-block' }}></span>{meta.answer2.heading5}
                    </h3>
                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 16px', fontSize: '11px', lineHeight: '1.4', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                      {answer2.nextAction || '未入力'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center w-full mt-6">
                <button onClick={() => { setStep('answer2'); window.scrollTo(0, 0); }} className="w-full sm:w-auto px-4 md:px-6 py-3 md:py-4 rounded-[20px] font-bold text-gray-400 hover:text-gray-600 text-[14px] md:text-[16px] transition-all flex items-center justify-center gap-2">
                  <ArrowLeft className="w-4 h-4" /> 戻る
                </button>
                <button onClick={saveAnswerReviewPdf} disabled={isGenerating} className="w-full sm:flex-1 py-3 md:py-4 bg-[#cb563e] text-white rounded-[20px] font-black text-[16px] md:text-[18px] shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                  {isGenerating ? (<><RefreshCw className="w-5 h-5 animate-spin" />PDF生成中...</>) : (<><Download className="w-5 h-5" />入力内容をPDFで保存</>)}
                </button>
              </div>
            </div>
          )}

          {/* 8. クイズ出題画面 */}
          {step === 'quiz' && (
            <div className="animate-fade-in p-4 md:p-6 lg:p-8">
              <div className="flex justify-between items-center mb-4 md:mb-6">
                <span className="bg-gray-100 text-gray-600 px-4 py-2 rounded-full font-bold text-[13px] md:text-sm">
                  {quizPage} / {Math.ceil(questions.filter(q => targetQuestionIds.includes(q.id)).length / 5)}
                </span>
                <span className="font-bold text-[#182349] text-[14px] md:text-base">{userName} 様</span>
              </div>
              <div className="space-y-6 md:space-y-8">
                {questions.filter(q => targetQuestionIds.includes(q.id)).slice((quizPage - 1) * 5, quizPage * 5).map(q => {
                  const Graph = q.diagram ? graphs[q.diagram] : null;
                  return (
                    <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                      <div className="h-2 w-full" style={{ background: COLORS.gradientBar }}></div>
                      <div className="p-4 md:p-6">
                        <div className="flex justify-between items-start mb-4">
                          <h3 className="text-lg md:text-xl font-black text-[#182349] flex items-center gap-2"><span className="text-[#cb563e]">Q{q.id}</span></h3>
                          <span className="bg-orange-50 text-[#cb563e] px-3 py-1 rounded-full text-xs font-bold border border-orange-100">{q.points}点</span>
                        </div>
                        <p className="text-[14px] md:text-[15px] font-bold text-gray-800 mb-4 whitespace-pre-wrap leading-relaxed">{q.question}</p>
                        {q.description && <p className="text-[13px] md:text-sm text-gray-600 mb-4 md:mb-6 bg-gray-50 p-3 md:p-4 rounded-xl border border-gray-100 whitespace-pre-wrap">{q.description}</p>}
                        {Graph && <Graph isPdf={false} />}
                        <div className="space-y-3">
                          {q.type === 'radio' && q.options.map(opt => (
                            <label key={opt} className={`p-3 md:p-4 border-2 rounded-xl cursor-pointer flex items-center transition-all ${answers[q.id] === opt ? 'border-[#cb563e] bg-[#fffaf8]' : 'border-gray-100 hover:bg-gray-50'}`}>
                              <input type="radio" checked={answers[q.id] === opt} onChange={() => handleAnswerChange(q.id, opt)} className="hidden" />
                              <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-3 flex-shrink-0 ${answers[q.id] === opt ? 'border-[#cb563e]' : 'border-gray-300'}`}>
                                {answers[q.id] === opt && <span className="w-2.5 h-2.5 bg-[#cb563e] rounded-full"></span>}
                              </span>
                              <span className="font-bold text-[13px] md:text-sm text-gray-700 leading-relaxed">{opt}</span>
                            </label>
                          ))}
                          {q.type === 'checkbox' && q.options.map(opt => (
                            <label key={opt} className={`p-3 md:p-4 border-2 rounded-xl cursor-pointer flex items-center transition-all ${(answers[q.id] || []).includes(opt) ? 'border-[#cb563e] bg-[#fffaf8]' : 'border-gray-100 hover:bg-gray-50'}`}>
                              <input type="checkbox" checked={(answers[q.id] || []).includes(opt)} onChange={() => handleCheckboxChange(q.id, opt)} className="hidden" />
                              <span className={`w-5 h-5 rounded border-2 flex items-center justify-center mr-3 flex-shrink-0 ${((answers[q.id] || []).includes(opt)) ? 'border-[#cb563e] bg-[#cb563e]' : 'border-gray-300'}`}>
                                {((answers[q.id] || []).includes(opt)) && <CheckCircle className="w-3 h-3 text-white" />}
                              </span>
                              <span className="font-bold text-[13px] md:text-sm text-gray-700 leading-relaxed">{opt}</span>
                            </label>
                          ))}
                          {q.type === 'mixed' && (
                            <div className="space-y-3">
                              {q.inputs.map((inp, i) => (
                                <div key={i} className="flex flex-col md:flex-row md:items-center gap-2">
                                  <span className="font-bold text-gray-700 min-w-[120px] text-[13px] md:text-sm">{inp.label}</span>
                                  {inp.type === 'select' ? (
                                    <select value={answers[q.id]?.[i + 1] || ''} onChange={(e) => handleAnswerChange(q.id, e.target.value, i + 1)} className="w-full p-3 border-2 rounded-lg bg-white font-bold text-[13px] md:text-sm outline-none border-gray-200 focus:border-[#cb563e]">
                                      <option value="">選択してください</option>
                                      {inp.options.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                  ) : (
                                    <input type="text" value={answers[q.id]?.[i + 1] || ''} onChange={(e) => handleAnswerChange(q.id, e.target.value, i + 1)} placeholder="回答を入力" className="w-full p-3 border-2 rounded-lg font-bold text-[13px] md:text-sm outline-none border-gray-200 focus:border-[#cb563e]" />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-6 md:mt-8">
                {quizPage > 1 && (
                  <button onClick={() => { setQuizPage(p => p - 1); window.scrollTo(0, 0); }} className="flex-1 py-3 md:py-4 border-2 border-gray-200 rounded-xl font-bold text-[#182349] hover:bg-gray-50 transition-all text-[14px] md:text-base">戻る</button>
                )}
                <button
                  onClick={quizPage < Math.ceil(targetQuestionIds.length / 5) ? () => { setQuizPage(p => p + 1); window.scrollTo(0, 0); } : handleTotalScoreAndGo}
                  className="flex-[2] py-3 md:py-4 bg-[#cb563e] text-white rounded-xl font-black text-[15px] md:text-lg shadow-lg hover:brightness-110 transition-all"
                >
                  {quizPage < Math.ceil(targetQuestionIds.length / 5) ? '次へ進む' : '結果を見る'}
                </button>
              </div>
            </div>
          )}

          {/* 9. 結果・解説・PDF出力 */}
          {step === 'result' && (
            <div className="animate-fade-in pb-12">
              <div className="h-[12px] w-full absolute top-0 left-0" style={{ background: COLORS.gradientBar }}></div>
              <div className="pt-8 md:pt-12 pb-6 md:pb-8 px-4 md:px-6 text-center border-b border-gray-100">
                <p className="text-gray-500 font-bold mb-2 text-[12px] md:text-[15px]">確認テスト 結果</p>
                <div className="text-[48px] md:text-[60px] font-[900] text-[#182349] leading-none mb-4 flex justify-center items-baseline gap-2">
                  {score} <span className="text-[20px] md:text-[24px] text-gray-400">/ 100点</span>
                </div>
                <div className={`inline-block px-5 md:px-6 py-2 rounded-full font-bold text-[14px] md:text-lg border-2 ${score >= meta.passScore ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                  {score >= meta.passScore ? '合格！おめでとうございます' : '再挑戦が必要です'}
                </div>
              </div>

              <div className="p-4 md:p-6 lg:p-8">
                <h3 className="font-black text-[16px] md:text-xl text-[#182349] mb-4 md:mb-6 border-b-2 border-[#182349] pb-2 inline-block">回答の確認</h3>
                <div className="space-y-4 md:space-y-6">
                  {questions.map(q => {
                    const qScore = getQuestionScore(q, answers);
                    const isP = qScore === q.points;
                    const isPart = qScore > 0 && qScore < q.points;
                    const { displayAnswer, displayCorrect = '' } = getDisplayValues(q, answers[q.id]);
                    const Graph = q.diagram ? graphs[q.diagram] : null;
                    return (
                      <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-6 border-l-4 md:border-l-8 transition-all" style={{ borderColor: isP ? '#2563eb' : isPart ? '#eab308' : '#ef4444' }}>
                        <div className="flex justify-between items-start mb-3 md:mb-4">
                          <h4 className="font-black text-[#182349] text-[15px] md:text-lg">Question {q.id}</h4>
                          <span className={`font-bold px-3 py-1 md:px-4 md:py-1.5 rounded-full text-[10px] md:text-xs ${isP ? 'bg-blue-50 text-blue-700' : isPart ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700'}`}>
                            {isP ? '✓ CORRECT' : isPart ? `△ PARTIAL (${qScore}点)` : '× INCORRECT'}
                          </span>
                        </div>
                        <p className="text-[12px] md:text-[14px] font-bold text-gray-800 mb-4 whitespace-pre-wrap">{q.question}</p>
                        {Graph && <Graph isPdf={false} />}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mt-4">
                          <div className="bg-gray-50 p-3 md:p-4 rounded-xl border border-gray-100">
                            <p className="text-[10px] md:text-[11px] font-extrabold text-gray-500 mb-1.5 md:mb-2">▼ あなたの回答</p>
                            <p className="text-[12px] md:text-[14px] font-bold leading-relaxed whitespace-pre-wrap" style={{ color: isP ? COLORS.text : (isPart ? '#ca8a04' : '#dc2626') }}>{displayAnswer}</p>
                          </div>
                          <div className="bg-emerald-50 p-3 md:p-4 rounded-xl border border-emerald-100">
                            <p className="text-[10px] md:text-[11px] font-extrabold text-emerald-700 mb-1.5 md:mb-2">▼ 正解</p>
                            <p className="text-[12px] md:text-[14px] font-bold text-emerald-900 leading-relaxed whitespace-pre-wrap">{displayCorrect}</p>
                          </div>
                        </div>
                        {q.explanation && (
                          <div className="mt-4 md:mt-6 pt-3 md:pt-4 border-t border-gray-100">
                            <p className="text-[11px] md:text-[12px] font-extrabold text-[#cb563e] mb-2 flex items-center gap-1.5"><BookOpen className="w-4 h-4" /> 講師解説</p>
                            <p className="text-[11px] md:text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap bg-[#fffcf9] p-3 md:p-4 rounded-xl border border-orange-50">{q.explanation}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* PDF出力用の非表示DOM（合格証1ページ + 回答レポート数ページ） */}
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
                      <h1 style={{ fontSize: '66.7pt', fontWeight: 900, color: '#1c1c2e', letterSpacing: '0.35em', textAlign: 'center', margin: '0 0 12mm 0', fontFamily: certFontFamily }}>合格証</h1>
                      <p style={{ fontSize: '13px', fontWeight: 700, color: COLORS.text, textAlign: 'center', margin: '0 0 3mm 0', fontFamily: certFontFamily }}>{certChapterNumber}</p>
                      <p style={{ fontSize: '26.9pt', fontWeight: 900, color: COLORS.text, textAlign: 'center', margin: '0 0 18mm 0', fontFamily: certFontFamily }}>{certCourseTitle}</p>
                      <p style={{ fontSize: '32.1pt', fontWeight: 700, color: COLORS.text, textAlign: 'right', margin: '0 0 auto 0', fontFamily: certFontFamily }}>{userName || 'ご入力者'} 殿</p>
                      <p style={{ fontSize: '21.1pt', lineHeight: 2.1, color: '#334155', textAlign: 'center', margin: '0 0 auto 0', fontFamily: certFontFamily }}>
                        あなたは食のプロフェッショナル養成講座の<br />
                        「{certChapterNumber} {certCourseTitle}」の<br />
                        確認テストに合格致しましたので、ここに賞します。
                      </p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <p style={{ fontSize: '19.9pt', color: '#334155', margin: 0, fontFamily: certFontFamily }}>{formatReiwaDate()}</p>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: '19.9pt', color: '#334155', margin: '0 0 2px 0', fontFamily: certFontFamily }}>{certIssuerRole}</p>
                          <p style={{ fontSize: '30.1pt', fontWeight: 700, color: COLORS.text, margin: 0, fontFamily: certFontFamily }}>{certIssuerName}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {questions.map((q, qIdx) => {
                    const qScore = getQuestionScore(q, answers);
                    const isP = qScore === q.points;
                    const isPart = qScore > 0 && qScore < q.points;
                    const statusColor = isP ? '#059669' : isPart ? '#b45309' : '#dc2626';
                    const statusLabel = isP ? '✓ CORRECT' : isPart ? `△ PARTIAL (${qScore}点)` : '× INCORRECT';
                    const borderColor = isP ? '#2563eb' : isPart ? '#eab308' : '#ef4444';
                    const { displayAnswer, displayCorrect } = getDisplayValues(q, answers[q.id]);
                    const Graph = q.diagram ? graphs[q.diagram] : null;
                    return (
                      <div key={q.id} id={certReviewPageIds[qIdx]} style={{ ...pdfPageContainerStyle, padding: '16mm' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '3mm' }}>
                          <div>
                            <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '0.02em' }}>RESULT REPORT</h2>
                            <p style={{ fontSize: '10px', color: '#94a3b8', margin: '2px 0 0 0' }}>{reportSubtitle}</p>
                          </div>
                          <p style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', margin: 0 }}>{userName || '受講者'} 様</p>
                        </div>
                        <div style={{ height: '5px', width: '100%', background: COLORS.gradientBar, borderRadius: '3px', marginBottom: '5mm' }} />

                        <div style={{ border: '1px solid #e2e8f0', borderLeft: `6px solid ${borderColor}`, borderRadius: '10px', padding: '5mm', flex: 1, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4mm' }}>
                            <span style={{ display: 'inline-block', backgroundColor: COLORS.text, color: '#fff', fontWeight: 900, fontSize: '11px', borderRadius: '6px', padding: '3px 10px' }}>Q{q.id}</span>
                            <span style={{ fontSize: '11px', fontWeight: 900, color: statusColor }}>{statusLabel}</span>
                          </div>
                          <p style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', margin: '0 0 4mm 0', whiteSpace: 'pre-wrap' }}>{q.question}</p>
                          {q.description && (
                            <p style={{ fontSize: '10px', color: '#475569', backgroundColor: '#f8fafc', borderRadius: '8px', padding: '3mm', margin: '0 0 4mm 0', whiteSpace: 'pre-wrap' }}>{q.description}</p>
                          )}
                          {Graph && <Graph isPdf />}
                          <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '4mm', marginBottom: '4mm' }}>
                            <p style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', margin: '0 0 2px 0' }}>▼ あなたの回答</p>
                            <p style={{ fontSize: '11px', fontWeight: 700, color: isP ? COLORS.text : statusColor, margin: '0 0 3mm 0', whiteSpace: 'pre-wrap' }}>{displayAnswer}</p>
                            <p style={{ fontSize: '9px', fontWeight: 700, color: COLORS.accent, margin: '0 0 2px 0' }}>▼ 正解</p>
                            <p style={{ fontSize: '11px', fontWeight: 700, color: COLORS.accent, margin: 0, whiteSpace: 'pre-wrap' }}>{displayCorrect}</p>
                          </div>
                          {q.explanation && (
                            <div style={{ backgroundColor: '#fffcf9', border: '1px solid #fed7aa', borderRadius: '10px', padding: '4mm' }}>
                              <p style={{ fontSize: '9px', fontWeight: 700, color: COLORS.accent, margin: '0 0 2mm 0' }}>📖 講師解説</p>
                              <p style={{ fontSize: '9px', lineHeight: 1.6, color: '#334155', margin: 0, whiteSpace: 'pre-wrap' }}>{q.explanation}</p>
                            </div>
                          )}
                        </div>
                        <p style={{ textAlign: 'right', fontSize: '9px', color: '#94a3b8', marginTop: '3mm' }}>{qIdx + 1} / {questions.length}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-8 md:mt-12 flex flex-col items-center gap-4">
                  {score >= meta.passScore ? (
                    <>
                      <button
                        onClick={() => { setIsGenerating(true); saveToPdf(); }}
                        disabled={isGenerating}
                        className="w-full md:w-auto bg-[#cb563e] text-white px-6 md:px-10 py-4 md:py-5 rounded-[20px] font-black text-[15px] md:text-lg flex items-center justify-center gap-3 shadow-xl hover:brightness-110 transition-all disabled:opacity-50"
                      >
                        {isGenerating ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                        {isGenerating ? 'PDF生成中...' : '合格証とレポートをPDFで保存'}
                      </button>
                      {meta.worksheet && (
                        <button
                          onClick={() => { setStep('worksheet'); window.scrollTo(0, 0); }}
                          className="w-full md:w-auto bg-[#182349] text-white px-6 md:px-10 py-4 md:py-5 rounded-[20px] font-black text-[15px] md:text-lg shadow-lg hover:bg-indigo-900 transition-all"
                        >
                          {meta.worksheet.entryButtonLabel || '実践課題に進む'}
                        </button>
                      )}
                      <button onClick={() => { setAnswers({}); setStep('start'); window.scrollTo(0, 0); }} className="text-[12px] md:text-sm font-bold text-gray-400 hover:text-[#182349] transition-colors mt-2 md:mt-4">最初の画面に戻る</button>
                    </>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-4 w-full">
                      <button onClick={handleRetryIncorrect} className="flex-1 py-3.5 md:py-4 bg-[#182349] text-white rounded-[20px] font-black text-[14px] md:text-[16px] shadow-lg hover:bg-indigo-900 transition-all">不正解の問題のみ再挑戦する</button>
                      <button onClick={handleRetryAll} className="flex-1 py-3.5 md:py-4 bg-gray-100 text-[#182349] rounded-[20px] font-black text-[14px] md:text-[16px] hover:bg-gray-200 transition-all">全問最初からやり直す</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 10. 記述式ワークシート（meta.worksheet がある場合のみ表示） */}
          {step === 'worksheet' && meta.worksheet && (
            <div className="animate-fade-in p-4 md:p-6 lg:p-8">
              <div className="h-[14px] w-full absolute top-0 left-0" style={{ background: COLORS.gradientBar }}></div>
              <h2 className="text-[18px] md:text-[22px] font-black text-[#182349] mb-2 pb-2 border-b border-gray-100">{meta.worksheet.heading}</h2>
              {meta.worksheet.intro?.map((line, i) => (
                <p key={i} className="text-[12px] md:text-[13px] text-gray-600 leading-relaxed mb-2 whitespace-pre-wrap">{line}</p>
              ))}

              <div className="max-h-[66vh] overflow-y-auto pr-2 space-y-6 md:space-y-8 py-4" style={{ scrollbarGutter: 'stable' }}>
                {meta.worksheet.steps.map((ws, wsIdx) => (
                  <div key={ws.id} className="bg-gray-50 p-4 md:p-5 rounded-2xl border border-gray-100 space-y-4">
                    <h3 className="text-[16px] md:text-[18px] font-black text-[#182349] border-b pb-2 flex items-center gap-2">
                      <span className="w-2.5 h-6 rounded-md bg-[#cb563e] inline-block"></span>
                      {ws.number ? `${ws.number} ` : ''}{ws.title}
                    </h3>
                    {ws.lead && <p className="text-[12px] md:text-[13px] text-gray-500 leading-relaxed whitespace-pre-wrap">{ws.lead}</p>}
                    <div className="space-y-3">
                      {ws.fields.map(f => (
                        <div key={f.key} className="space-y-1">
                          <label className="block text-[12px] md:text-[13px] font-bold text-[#182349]">{f.label}</label>
                          <textarea
                            value={worksheetAnswers[f.key] || ''}
                            onChange={(e) => handleWorksheetChange(f.key, e.target.value)}
                            placeholder={f.placeholder || ''}
                            className="w-full h-16 p-2.5 border-2 border-gray-200 rounded-xl bg-white text-[13px] leading-relaxed outline-none focus:border-[#cb563e] resize-none transition-all placeholder-gray-300 whitespace-pre-wrap break-all"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {meta.worksheet.reasoningField && (
                  <div className="bg-gray-50 p-4 md:p-5 rounded-2xl border border-gray-100 space-y-3">
                    <label className="block text-[13px] md:text-[14px] font-black text-[#182349]">{meta.worksheet.reasoningField.label}</label>
                    <textarea
                      value={worksheetAnswers[meta.worksheet.reasoningField.key] || ''}
                      onChange={(e) => handleWorksheetChange(meta.worksheet.reasoningField.key, e.target.value)}
                      className="w-full h-28 p-2.5 md:p-3 border-2 border-gray-200 rounded-xl bg-white text-[13px] md:text-[14px] leading-relaxed outline-none focus:border-[#cb563e] resize-none transition-all whitespace-pre-wrap break-all"
                    />
                  </div>
                )}

                {meta.worksheet.notesField && (
                  <div className="bg-gray-50 p-4 md:p-5 rounded-2xl border border-gray-100 space-y-3">
                    <label className="block text-[13px] md:text-[14px] font-black text-[#182349]">{meta.worksheet.notesField.label}</label>
                    <textarea
                      value={worksheetAnswers[meta.worksheet.notesField.key] || ''}
                      onChange={(e) => handleWorksheetChange(meta.worksheet.notesField.key, e.target.value)}
                      className="w-full h-24 p-2.5 md:p-3 border-2 border-gray-200 rounded-xl bg-white text-[13px] md:text-[14px] leading-relaxed outline-none focus:border-[#cb563e] resize-none transition-all whitespace-pre-wrap break-all"
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center w-full mt-6">
                <button onClick={() => { setStep('result'); window.scrollTo(0, 0); }} className="w-full sm:w-auto px-4 md:px-6 py-3 md:py-4 rounded-[20px] font-bold text-gray-400 hover:text-gray-600 text-[14px] md:text-[16px] transition-all flex items-center justify-center gap-2">
                  <ArrowLeft className="w-4 h-4" /> 戻る
                </button>
                <button onClick={() => { setStep('worksheetReview'); window.scrollTo(0, 0); }} className="w-full sm:flex-1 py-3 md:py-4 bg-[#cb563e] text-white rounded-[20px] font-black text-[16px] md:text-[18px] shadow-lg hover:brightness-110 active:scale-95 transition-all">
                  入力内容を確認する
                </button>
              </div>
            </div>
          )}

          {/* 11. ワークシート確認画面・PDF出力 */}
          {step === 'worksheetReview' && meta.worksheet && (
            <div className="animate-fade-in p-4 md:p-6 lg:p-8">
              <div className="h-[14px] w-full absolute top-0 left-0" style={{ background: COLORS.gradientBar }}></div>
              <h2 className="text-[18px] md:text-[22px] font-black text-center text-[#182349] mb-4 md:mb-6 pb-3 border-b border-gray-100">入力内容の確認</h2>
              <p className="text-[12px] md:text-[13px] text-gray-500 text-center mb-4 md:mb-6 leading-relaxed">
                記入内容を確認してください。<br />修正したい場合は「戻る」から前のページに戻れます。<br />内容に問題なければ、PDFとして保存してください。
              </p>

              <div className="bg-white p-4 md:p-6 lg:p-8 rounded-2xl border border-gray-100 space-y-4 md:space-y-6 mb-6 md:mb-8 text-[#182349] w-full max-w-full box-border">
                <div className="text-center border-b pb-4 md:pb-6 border-gray-100">
                  <p className="text-[#cb563e] font-extrabold text-[11px] md:text-[12px] uppercase tracking-wider mb-1">{meta.worksheetPdfHeaderNote}</p>
                  <h1 className="text-[18px] md:text-[20px] lg:text-[24px] font-[900] text-[#182349] leading-tight">{meta.chapterLabel}<br />{meta.themeLabel}</h1>
                  <p className="text-[13px] md:text-sm font-bold text-[#cb563e] mt-3">【記入者名】 {userName || '（未入力）'}</p>
                  <p className="text-[10px] md:text-[11px] text-gray-400 mt-1">保存日: {new Date().toLocaleDateString('ja-JP')}</p>
                </div>
                {meta.worksheet.steps.map(ws => (
                  <div key={ws.id} className="space-y-2">
                    <h3 className="text-[13px] md:text-sm font-black text-[#cb563e] flex items-center gap-1.5 border-b pb-1 border-gray-100">
                      <span className="w-1.5 h-4 bg-[#cb563e] rounded-sm"></span>{ws.number ? `${ws.number} ` : ''}{ws.title}
                    </h3>
                    <div className="bg-gray-50 p-3 md:p-3.5 rounded-xl border border-gray-100 space-y-2 text-[12px] md:text-sm w-full">
                      {ws.fields.map(f => (
                        <p key={f.key}><strong>{f.label}:</strong> {worksheetAnswers[f.key] || '未入力'}</p>
                      ))}
                    </div>
                  </div>
                ))}
                {meta.worksheet.reasoningField && (
                  <div className="space-y-2">
                    <h3 className="text-[13px] md:text-sm font-black text-[#cb563e] flex items-center gap-1.5 border-b pb-1 border-gray-100">
                      <span className="w-1.5 h-4 bg-[#cb563e] rounded-sm"></span>{meta.worksheet.reasoningField.label}
                    </h3>
                    <ReviewTextBox>{worksheetAnswers[meta.worksheet.reasoningField.key]}</ReviewTextBox>
                  </div>
                )}
                {meta.worksheet.notesField && (
                  <div className="space-y-2">
                    <h3 className="text-[13px] md:text-sm font-black text-[#cb563e] flex items-center gap-1.5 border-b pb-1 border-gray-100">
                      <span className="w-1.5 h-4 bg-[#cb563e] rounded-sm"></span>{meta.worksheet.notesField.label}
                    </h3>
                    <ReviewTextBox>{worksheetAnswers[meta.worksheet.notesField.key]}</ReviewTextBox>
                  </div>
                )}
              </div>

              {/* PDF出力用の非表示DOM（STEPを2つずつまとめてページ化 + 最後に説明・補足のページ） */}
              <div style={{ position: 'absolute', left: '-9999px', top: '0', width: '210mm' }}>
                {(() => {
                  const steps = meta.worksheet.steps;
                  const chunks = [];
                  for (let i = 0; i < steps.length; i += 2) chunks.push(steps.slice(i, i + 2));
                  return chunks.map((chunk, pageIdx) => (
                    <div key={pageIdx} id={`pdf-worksheet-page-${pageIdx + 1}`} style={pdfPageContainerStyle}>
                      {pageIdx === 0 ? (
                        <div className="text-center border-b pb-6 border-gray-200 mb-8">
                          <p style={{ color: COLORS.accent, fontWeight: '900', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>{meta.worksheetPdfHeaderNote}</p>
                          <h1 style={{ fontSize: '24px', fontWeight: '900', color: COLORS.text, lineHeight: '1.3', margin: '0 0 12px 0' }}>{meta.chapterLabel}<br />{meta.themeLabel}</h1>
                          <p style={{ fontSize: '15px', fontWeight: 'bold', color: COLORS.accent, margin: '6px 0 0 0' }}>【記入者名】 {userName || '（名前未入力）'}</p>
                          <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0 0' }}>保存日: {new Date().toLocaleDateString('ja-JP')}</p>
                        </div>
                      ) : (
                        <div style={{ marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                          <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0 }}>{meta.worksheetPdfFooterNote}</p>
                        </div>
                      )}
                      {chunk.map(ws => (
                        <div key={ws.id} style={{ marginBottom: '16px' }}>
                          <h3 style={{ fontSize: '13px', fontWeight: '900', color: COLORS.accent, borderBottom: '1px solid #e2e8f0', paddingBottom: '3px', marginBottom: '8px' }}>
                            {ws.number ? `${ws.number} ` : ''}{ws.title}
                          </h3>
                          <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px', fontSize: '10px', lineHeight: '1.5' }}>
                            {ws.fields.map(f => (
                              <p key={f.key} style={{ margin: '0 0 4px 0' }}><strong>{f.label}:</strong> {worksheetAnswers[f.key] || '未入力'}</p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ));
                })()}
                <div id={`pdf-worksheet-page-${Math.ceil(meta.worksheet.steps.length / 2) + 1}`} style={pdfPageContainerStyle}>
                  <div style={{ marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                    <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0 }}>{meta.worksheetPdfFooterNote}</p>
                  </div>
                  {meta.worksheet.reasoningField && (
                    <div style={{ marginBottom: '16px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: '900', color: COLORS.accent, borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '8px' }}>{meta.worksheet.reasoningField.label}</h3>
                      <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 16px', fontSize: '11px', lineHeight: '1.4', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                        {worksheetAnswers[meta.worksheet.reasoningField.key] || '未入力'}
                      </div>
                    </div>
                  )}
                  {meta.worksheet.notesField && (
                    <div>
                      <h3 style={{ fontSize: '14px', fontWeight: '900', color: COLORS.accent, borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '8px' }}>{meta.worksheet.notesField.label}</h3>
                      <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 16px', fontSize: '11px', lineHeight: '1.4', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                        {worksheetAnswers[meta.worksheet.notesField.key] || '未入力'}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center w-full mt-6">
                <button onClick={() => { setStep('worksheet'); window.scrollTo(0, 0); }} className="w-full sm:w-auto px-4 md:px-6 py-3 md:py-4 rounded-[20px] font-bold text-gray-400 hover:text-gray-600 text-[14px] md:text-[16px] transition-all flex items-center justify-center gap-2">
                  <ArrowLeft className="w-4 h-4" /> 戻る
                </button>
                <button onClick={saveWorksheetPdf} disabled={isGenerating} className="w-full sm:flex-1 py-3 md:py-4 bg-[#cb563e] text-white rounded-[20px] font-black text-[16px] md:text-[18px] shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                  {isGenerating ? (<><RefreshCw className="w-5 h-5 animate-spin" />PDF生成中...</>) : (<><Download className="w-5 h-5" />入力内容をPDFで保存</>)}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* 保存モーダル */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-[#182349]/40 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-4 md:p-6 lg:p-8 shadow-2xl relative overflow-hidden animate-fade-in">
            <div className="h-[10px] w-full absolute top-0 left-0" style={{ background: COLORS.gradientBar }}></div>
            <h3 className="font-black text-[#182349] text-[15px] md:text-lg text-center mb-2 mt-2">
              {saveModalMode === 'new' ? '保存名を入力してください' : '保存名を変更する'}
            </h3>
            <p className="text-[10px] md:text-xs text-gray-500 text-center mb-4 md:mb-6">識別しやすい保存名を入力してください。</p>
            <input
              type="text"
              value={draftNameInput}
              onChange={(e) => setDraftNameInput(e.target.value)}
              className="w-full py-3 px-4 md:py-3.5 border-2 border-gray-100 rounded-xl font-bold text-[12px] md:text-sm text-[#182349] focus:border-[#cb563e] outline-none transition-all mb-6 text-center shadow-inner"
              placeholder="保存名を入力"
            />
            <div className="flex gap-3">
              <button onClick={(e) => { e.preventDefault(); setShowSaveModal(false); }} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-[#182349] rounded-xl font-bold text-[12px] md:text-sm transition-all">キャンセル</button>
              <button onClick={(e) => { e.preventDefault(); handleSaveConfirm(); }} disabled={!draftNameInput.trim()} className="flex-1 py-3 bg-[#cb563e] text-white hover:brightness-110 rounded-xl font-black text-[12px] md:text-sm transition-all shadow-md disabled:opacity-50">
                {saveModalMode === 'new' ? '保存する' : '変更する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 保存データ一覧モーダル */}
      {showDraftListModal && (
        <div className="fixed inset-0 bg-[#182349]/40 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
          <div className="bg-white rounded-3xl w-full max-w-2xl h-[80vh] flex flex-col p-4 md:p-6 lg:p-8 shadow-2xl relative overflow-hidden animate-fade-in">
            <div className="h-[10px] w-full absolute top-0 left-0" style={{ background: COLORS.gradientBar }}></div>
            <h3 className="font-black text-[#182349] text-[16px] md:text-xl mb-4 mt-2 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#cb563e]" /> 保存データ一覧
            </h3>
            <div className="mb-4 bg-gray-50 p-3 rounded-xl border border-gray-200 text-[10px] md:text-[11px] leading-relaxed text-gray-500">
              ※ 保存データは、クラウドに自動的に同期されます。
            </div>
            <div className="flex-1 overflow-y-auto pr-2 space-y-4" style={{ scrollbarGutter: 'stable' }}>
              {getLatestLiveSession() && (
                <div className="bg-indigo-50 rounded-2xl border border-indigo-100 p-4 relative">
                  <div className="absolute top-3 right-3 bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">自動一時保存</div>
                  <h4 className="font-bold text-[12px] md:text-sm text-[#182349] pr-16">前回の編集中データ (オートセーブ)</h4>
                  <p className="text-[10px] md:text-xs text-gray-500 mt-1">最終更新: {getLatestLiveSession().updatedAt || '不明'}</p>
                  <div className="flex justify-end gap-2 mt-3">
                    <button onClick={(e) => { e.preventDefault(); restoreDraft(getLatestLiveSession()); }} className="px-4 py-2 bg-[#182349] hover:bg-indigo-900 text-white rounded-xl text-[10px] md:text-xs font-bold transition-all shadow-sm">このデータから再開</button>
                    <button
                      onClick={async (e) => {
                        e.preventDefault();
                        if (user && db) {
                          await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'session', 'live'));
                        }
                        localStorage.removeItem(LIVE_SESSION_KEY);
                        setLiveSessionSnapshot(null);
                        showToast('一時データを削除しました');
                      }}
                      className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-[10px] md:text-xs font-bold transition-all"
                    >
                      削除
                    </button>
                  </div>
                </div>
              )}
              {getMergedDrafts().length === 0 ? (
                <div className="text-center py-12 text-gray-400 font-bold text-[12px] md:text-[14px]">保存されたデータはありません</div>
              ) : (
                getMergedDrafts().map(draft => (
                  <div key={draft.draftId} className="bg-white rounded-2xl border border-gray-200 p-3 md:p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4 hover:border-orange-200 transition-colors shadow-sm">
                    <div className="text-left min-w-0 flex-1">
                      <h4 className="font-bold text-[12px] md:text-sm text-[#182349] truncate break-all">{draft.draftName}</h4>
                      <p className="text-[10px] md:text-xs text-gray-500 mt-1 flex flex-wrap gap-x-4">
                        <span>記入者: {draft.userName || '未入力'}</span>
                        <span>保存日時: {draft.updatedAt}</span>
                      </p>
                      <p className="text-[10px] md:text-[11px] text-[#cb563e] mt-1 font-bold">進捗: {draft.step === 'result' ? '完了(結果画面)' : `回答中 (ステップ: ${draft.step})`}</p>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={(e) => { e.preventDefault(); restoreDraft(draft); }} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] md:text-xs font-bold transition-all shadow-sm">復元</button>
                      <button onClick={(e) => { e.preventDefault(); deleteDraft(draft.draftId); }} className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-[10px] md:text-xs font-bold transition-all">削除</button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
              <button onClick={(e) => { e.preventDefault(); setShowDraftListModal(false); }} className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-[#182349] rounded-xl font-bold text-[12px] md:text-sm transition-all">閉じる</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
