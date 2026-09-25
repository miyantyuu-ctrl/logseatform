// 「挑戦する料理」の段階的プルダウン用データ。
// 今後、料理が追加される前提の構成：
//   1. category（食材カテゴリ）: 肉・魚・野菜
//   2. method（調理法 × カテゴリ）: 例）肉×焼く／肉×煮る／肉×揚げる
//   3. dish（料理名）: method に紐づく具体的な料理
//
// 新しい料理を追加する場合は、対象 category の methods 配列の中の
// 該当 method オブジェクトの dishes 配列に { id, label } を追加するだけでよい。
// 新しい調理法を追加する場合は、対象 category の methods 配列に
// { id, label, dishes: [...] } を追加する。
// 新しいカテゴリを追加する場合は、CATEGORIES にオブジェクトを追加する。

export const CATEGORIES = [
  {
    id: 'meat',
    label: '肉',
    methods: [
      {
        id: 'grill',
        label: '肉×焼く',
        dishes: [
          { id: 'teriyaki-chicken', label: '鶏の照り焼き' }
        ]
      },
      {
        id: 'simmer',
        label: '肉×煮る',
        dishes: [
          { id: 'fricassee', label: 'フリカッセ' }
        ]
      },
      {
        id: 'fry',
        label: '肉×揚げる',
        dishes: [
          { id: 'shio-karaage', label: '鶏肉の塩唐揚げ' }
        ]
      }
    ]
  },
  {
    id: 'fish',
    label: '魚',
    methods: []
  },
  {
    id: 'vegetable',
    label: '野菜',
    methods: []
  }
];

export const findCategory = (categoryId) => CATEGORIES.find(c => c.id === categoryId) || null;
export const findMethod = (categoryId, methodId) => findCategory(categoryId)?.methods.find(m => m.id === methodId) || null;
export const findDish = (categoryId, methodId, dishId) => findMethod(categoryId, methodId)?.dishes.find(d => d.id === dishId) || null;
