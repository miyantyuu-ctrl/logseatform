// 文言はユーザー提供のCanvaデザイン「完了報告フォーム｜第8章調理チャレンジ」の原文をそのまま使用している。
// 表現を変更する場合は、必ずユーザーに確認してから変更すること。

const meta = {
  id: 'chapter8-cooking-challenge',

  formTitle: '完了報告フォーム',
  chapterLabel: '第8章調理チャレンジ',
  pageFooterLabel: '完了報告フォーム｜第8章調理チャレンジ',

  purposeLead: 'ー完了報告フォームの目的ー',
  purposeBody: 'ワークで得た学びを言語化して、腹落ちさせていきましょう！',
  slackNote: '※ワークで得た質問は、本フォームではなくSlackでご質問下さい。',

  dishFieldLabel: '取り組んだ料理名',

  section1: {
    title: '1. 料理の写真提出について',
    qLabel: 'Q1',
    text: '1-1. 調理チャレンジで作った料理（盛り付け後のもの）の写真を撮影し、講師へお送りください。',
    answerLabel: '▼解答欄',
    checklist: ['写真を撮影した', '講師に送付した']
  },

  section2: {
    title: '2. 調理チャレンジの達成度について',
    qLabel: 'Q2',
    scoreText: '2-1. 今回のワークで設定されていた料理のゴールは達成できましたか？ 料理の出来栄えをご自身で採点してください。（100点満点）',
    scoreAnswerLabel: '▼解答欄',
    scorePrefix: '点数：',
    scoreSuffix: '点',
    reasonText: '2-2. なぜ、そのように評価しましたか？ 料理のゴールとの乖離があった場合は、その内容もご記入ください。',
    reasonAnswerLabel: '▼解答欄'
  },

  section3: {
    title: '3. 調理チャレンジの目的達成について',
    qLabel: 'Q3',
    text: '3-1. 調理チャレンジを通して得た学びや感想をご記入ください。',
    answerLabel: '▼解答欄'
  },

  footerNoteTitle: '〈ご質問の回答について〉',
  footerNoteBody:
    '※調理チャレンジを通して得た疑問点は、Slack〈第8章 調理技術の基礎理論マスター講座〉で質問を投稿いただくか、オンライングループセッションをお申し込みの上、ご質問ください。\n※ご質問される場合は、類似質問が無いか、事前に過去のスレッドをご確認ください。',

  // 完了証（PDF1ページ目）
  certChapterNumber: '第8章',
  certCourseTitle: '調理チャレンジ',
  certIssuerRole: 'EDICODE講師',
  certIssuerName: '辻岡靖明',
  reportSubtitle: '完了報告フォーム -第8章調理チャレンジ-',

  pdfFileName: (cleanUserName, dishLabel) => `第8章調理チャレンジ_完了報告_${cleanUserName}_${dishLabel || ''}.pdf`
};

export default meta;
