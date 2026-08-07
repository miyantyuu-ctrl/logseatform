import React from 'react';

// Q6で使用する「コクの感じ方」グラフ。このテスト固有の図なので tests/ 配下に置く。
export const GraphQ6 = ({ isPdf = false }) => {
  const size = isPdf ? 480 : '100%';
  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', margin: isPdf ? '10px 0' : '20px 0' }}>
      <svg width={size} height="auto" viewBox="0 0 1350 650" className="font-sans shadow-sm" style={{ backgroundColor: '#FDFBF4', border: '1px solid #eee', borderRadius: '8px' }}>
        <text x="30" y="50" fontSize="24" fill="#333" fontWeight="bold">コクの強さ</text>
        <text x="30" y="620" fontSize="24" fill="#333" fontWeight="bold">時間軸</text>

        <text x="250" y="620" fontSize="22" fill="#666" textAnchor="middle">口に入れる前後</text>
        <text x="550" y="620" fontSize="22" fill="#666" textAnchor="middle">咀嚼中</text>
        <text x="850" y="620" fontSize="22" fill="#666" textAnchor="middle">飲み込む時</text>
        <text x="1150" y="620" fontSize="22" fill="#666" textAnchor="middle">余韻</text>

        <line x1="150" y1="100" x2="1300" y2="100" stroke="#ddd" strokeWidth="2" strokeDasharray="5,5" />
        <line x1="150" y1="250" x2="1300" y2="250" stroke="#ddd" strokeWidth="2" strokeDasharray="5,5" />
        <line x1="150" y1="400" x2="1300" y2="400" stroke="#ddd" strokeWidth="2" strokeDasharray="5,5" />
        <line x1="150" y1="550" x2="1300" y2="550" stroke="#999" strokeWidth="3" />
        <line x1="150" y1="50" x2="150" y2="550" stroke="#999" strokeWidth="3" />

        <path d="M 150 550 Q 250 150 550 200 T 1150 500" fill="none" stroke="#e63946" strokeWidth="5" />
        <text x="350" y="140" fontSize="24" fill="#e63946" fontWeight="bold">A</text>

        <path d="M 150 550 Q 300 450 550 100 T 1150 450" fill="none" stroke="#2a9d8f" strokeWidth="5" />
        <text x="450" y="90" fontSize="24" fill="#2a9d8f" fontWeight="bold">B</text>

        <path d="M 150 550 Q 400 550 650 150 T 1150 550" fill="none" stroke="#e9c46a" strokeWidth="5" />
        <text x="600" y="140" fontSize="24" fill="#d4af37" fontWeight="bold">C</text>
      </svg>
    </div>
  );
};

// diagram id -> コンポーネント の対応表。questions.js からは文字列IDだけを参照する。
export const graphs = {
  'graph-q6': GraphQ6
};
