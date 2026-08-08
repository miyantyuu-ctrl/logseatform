// 現在アプリが表示する「テストバージョン」の切り替えポイント。
// 新しいバージョンを追加したら、ここの import 先を変えるだけでアプリ全体が切り替わる。
import test3Ajisui from './tests/test3-ajisui/index.js';
import test4Niku from './tests/test4-niku/index.js';

// test3-ajisui に戻したい場合は下の行を activeTest = test3Ajisui; に変更する
const activeTest = test4Niku;

export default activeTest;
