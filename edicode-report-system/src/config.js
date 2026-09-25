// 現在アプリが表示する「報告フォームバージョン」の切り替えポイント。
// 新しい章の報告フォームを追加したら、ここの import 先を変えるだけでアプリ全体が切り替わる。
import chapter8CookingChallenge from './reports/chapter8-cooking-challenge/index.js';

const activeReport = chapter8CookingChallenge;

export default activeReport;
