// 現在アプリが表示する「テストバージョン」の切り替えポイント。
// 新しいバージョンを追加したら、ここの import 先を変えるだけでアプリ全体が切り替わる。
import test3Ajisui from './tests/test3-ajisui/index.js';

const activeTest = test3Ajisui;

export default activeTest;
