---
title: データモデル（ドラフト）
description: MVP 時点のエンティティと関係
sidebar:
  order: 3
---

MVP 実装の出発点となるドラフト。テーブル定義は設計フェーズで確定する。

## エンティティ関係

```
User 1 ─── * Recipe 1 ─── * Ingredient（行）
  │            │  1 ─── * Step（行）
  │            │  1 ─── * Photo（参照用写真）
  │            │  1 ─── * CookLog（作った記録）1 ─── * CookLogPhoto
  │            │  * ─── * Tag
  └──── 1 ShoppingList 1 ─── * ShoppingItem
```

すべてのデータは `userId` に紐づき、他ユーザーからは一切見えない。

## User

| フィールド | 型 | 備考 |
| --- | --- | --- |
| id | ID | |
| provider / providerId | string | OAuth プロバイダ情報 |
| displayName | string | |
| createdAt | datetime | |

## Recipe

| フィールド | 型 | 備考 |
| --- | --- | --- |
| id | ID | |
| userId | ID | 所有者 |
| title | string | 必須 |
| memo | text | 任意 |
| url | string | 任意（ブックマーク型） |
| createdAt / updatedAt | datetime | 一覧は updatedAt 降順 |

### Ingredient（材料行）

| フィールド | 型 | 備考 |
| --- | --- | --- |
| recipeId | ID | |
| name | string | 例: `豚肉` |
| amount | string | 例: `300g`（自由記述。数値計算はしない） |
| order | int | 並び順 |

### Step（手順行）

| フィールド | 型 | 備考 |
| --- | --- | --- |
| recipeId | ID | |
| body | text | |
| order | int | |

### Photo（参照用写真）

レシピの参照用（本のページ・スクショ・完成イメージなど）。

| フィールド | 型 | 備考 |
| --- | --- | --- |
| recipeId | ID | |
| storageKey | string | オブジェクトストレージ上のキー |
| order | int | |

### CookLog（作った記録）

実際に作った 1 回分の記録。写真（CookLogPhoto）を 1 枚以上必ず持つ。レシピの「作った回数」は CookLog の件数で算出する。

| フィールド | 型 | 備考 |
| --- | --- | --- |
| id | ID | |
| recipeId | ID | |
| cookedAt | date | 作った日（必須。デフォルトは当日） |
| memo | text | 任意の一言 |
| createdAt | datetime | |

### CookLogPhoto

| フィールド | 型 | 備考 |
| --- | --- | --- |
| cookLogId | ID | |
| storageKey | string | Photo と同じストレージを使う |
| order | int | |

## Tag

| フィールド | 型 | 備考 |
| --- | --- | --- |
| id | ID | |
| userId | ID | タグもユーザーごとに独立 |
| name | string | ユーザー内でユニーク |

Recipe と Tag は多対多（中間テーブル）。

## ShoppingItem（買い物リスト項目）

MVP ではリストはユーザーごとに 1 本のため、ShoppingList テーブルは省略して項目を直接 User に紐づけてもよい。

| フィールド | 型 | 備考 |
| --- | --- | --- |
| id | ID | |
| userId | ID | |
| label | string | 例: `豚肉 300g`（レシピ材料から追加時は `name + amount` を結合） |
| checked | boolean | |
| recipeId | ID? | 由来レシピ（任意。表示の参考程度） |
| createdAt | datetime | |

## 設計メモ

- **材料の amount は string**: 「適量」「大さじ2」を許容し、合算・換算は将来課題とする
- **検索**: MVP は `title / ingredient.name / memo` への LIKE 検索で開始。件数が増えたら全文検索を検討
- **画像**: DB には保存せず、オブジェクトストレージ + キー参照
