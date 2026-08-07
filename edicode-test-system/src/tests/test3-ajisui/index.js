// このフォルダ1つが「テストのバージョン」を表す。
// 新しいバージョンを作る場合は test3-ajisui フォルダごと複製し、
// questions.js / meta.js / Graphs.jsx の中身を差し替えたうえで、
// src/config.js の import 先をこのファイルに切り替える。
import { meta } from './meta.js';
import { questions, demoAnswers } from './questions.js';
import { graphs } from './Graphs.jsx';

export default { meta, questions, demoAnswers, graphs };
