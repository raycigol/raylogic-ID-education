# 每個 Session 的參與組別設定

## 狀態與已核對來源（2026-11-02）

以 GitHub main `74c265b022d3c06528c6791075da2d5ffc63d78d` 為基準。
已透過 Supabase SQL Editor 唯讀取得現行 `tbl_teacher_lock_stage`、`tbl_teacher_publish_stage`、`tbl_join_team`、`tbl_student_status`、`tbl_published_scores` 定義。
確認鎖定 RPC 固定要求 13 筆，前端分母及成績表也固定 13。
公布 RPC 的四階段 AE 配分保持原樣，沒有修改。

已於 2026-11-02 完成 Supabase 現行欄位、外鍵／唯一約束、RLS 與表格權限查核，安裝遷移並通過實際 TEST 回滾驗收。另發現並移除 tbl_teams.team_number 的固定 13 上限，保留正整數限制。
遷移前後全部 12 張既有 tbl_* 表的筆數與內容指紋完全相同；包含正式與 TEST、代表、加入碼、更正及搶答紀錄。新增的參與名單表沒有預填任何課堂設定。

## 設計與資料保護

- `tbl_session_participation` 私有表保存每堂課的啟用 team UUID 清單、版本、更新教師及時間。target count 由有效清單計算，沒有第二個可失去同步的數字欄位。
- 沒有設定的舊 Session 預設所有既有組別參與；不猜測應有 13 或 17 組、不根據已提交答案自動減少分母，也不自動新增組別。
- 教師勾選實際組別；缺席第 8 組可以只取消第 8 組。若資料庫只有 13 組，畫面會列出 13 組；要新增原本不存在的組別與加入碼，仍須獨立處理既有建班流程。
- 儲存鎖住本堂所有 Stage，與既有提交、撤回及鎖定互斥。版本比對阻擋過期教師視窗覆寫。零組、重複 UUID、跨 Session UUID 一律拒絕。
- 任一 Stage 已鎖定／公布，或已有分數，就不能改名單。尚未鎖定時也不能排除已有答案的組別；須先透過既有撤回流程保留更正紀錄，再調整名單。
- 不刪除答案、分數、組別、加入碼或代表綁定。停用後 UUID／短碼不能加入、不能提交 AE；原代表仍保留身份，可看狀態提示。重新啟用後原碼可繼續使用。搶答功能仍為原有獨立積分流程，本次未改其規則。
- 鎖定計算每個啟用 team 的唯一提交，停用組別不能抵銷漏交組別；零組不允許鎖定。
- 成績 RPC 只輸出啟用名單與已公布分數，未公布欄位回傳 null；前端與 CSV 不再虛構 13 個組別，也不把尚無分數顯示成 0 分／第 1 名。
- 課堂重置保留參與名單；重置不是變更名單的必要步驟，不要為調整組數清除正式答案。

## 精確安裝順序（Supabase SQL Editor）

1. 選取專案 `tbl-application-exercise-2026`（`cpvbpasrkcqdsxzsidwm`）。安排在非上課時段，保留目前 GitHub 版本與資料庫備份；不要執行 reset 類 SQL。
2. 新增查詢，貼上 **`sql/participation-preflight.sql` 全文**，分段執行每個 SELECT，私下匯出五組結果。這些查詢唯讀，不讀取學生識別資料、加入碼或答案分數。確認基礎表、函式與本次核對的版本相符，尤其 submissions 的 `(session_id,team_id,stage_number)` 唯一約束、Stage 狀態及既有權限；若不同，先停止安裝並交回結果核對。不要把匯出資料提交公開 GitHub。
3. 確認舊版 `representatives.sql`、`short-join-codes.sql` 等目前所用功能已安裝。新增查詢，貼上 **`sql/session-participation.sql` 全文**，一次 Run（含 BEGIN 到 COMMIT）。此檔已包含新版 TEST 模擬函式，不需另外執行 test-simulation.sql。
4. 若出錯，執行 `ROLLBACK;`，保留錯誤訊息並停止前端上線；不要只挑部分段落重跑。安裝使用 5 秒鎖等待，忙碌時會中止而非長時間卡住課堂。完整檔可重複執行，不會重置已儲存名單或課堂資料。
5. 在 TEST 驗證下方清單後，才合併這次 GitHub 分支並部署前端，重新整理教師／學生／成績頁。若先用測試分支的前端，務必指向同一已安裝的後端。新前端遇到缺少 roster RPC 時會顯示錯誤並停用 Stage 列表，不回退至硬編碼條件。
6. 教師登入 → 選正確 Session →「課程控制」→「參與組別設定」→「載入／重新編輯名單」→取消缺席組別 →確認名單及數量→「儲存參與組別」。確認 Stage 分母及缺交組名。

安裝後可唯讀核對函式及清單（未設定時私有表可為空，屬正常）：

```sql
select session_id,cardinality(team_ids) as configured_count,revision,updated_at
from public.tbl_session_participation;
select pg_get_functiondef('public.tbl_teacher_lock_stage(uuid,integer)'::regprocedure);
select p.proname, p.prosecdef, p.proconfig
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
('tbl_session_roster','tbl_teacher_set_participation','tbl_teacher_lock_stage');
```

不要重跑舊的 representatives／學生狀態／加入／成績 SQL 覆蓋新版 RPC。若需重裝基礎 SQL，最後完整重跑 session-participation.sql。
本次不提供刪表式回復：已設定較少組數後退回固定 13 的程式可能再次錯鎖。若需回復，先停止課堂操作、保留資料，依安裝前匯出的函式與前端版本成套復原，勿刪除名單或答案。

## TEST 驗收（已於 Supabase 執行）

	ests/participation-live.sql 已通過 13／16（第 8 組缺席）／17 組、S1–S4 開放／缺交拒鎖／鎖定／公布、原配分、停用加入／提交、過期名單及權限檢查。所有測試異動完整回滾；新增的臨時 14–17 組未保留。下列為後續人工跨裝置檢查清單。

只操作 ID `0f82561e-c980-44cb-8a5d-091dbc9c71e6`、名稱 `2026 ID Block TBL — TEST`。
既有 TEST 若有需保留的答案／分數，先匯出，不要逕行重置。13 組現場可驗證 13→12；16／17 需要原本就有對應組別的測試 fixture，不會由本功能自動建立。

1. 在未鎖定、無分數的 TEST 設定名單；取消中間組別，檢查分母、缺交清單、加入碼頁與成績表一致。切換正式／TEST，確認名單不互相帶入。
2. 用獨立瀏覽器以學生身份加入啟用組，提交後進度只加一；同組更新答案不加數。停用組的短碼、UUID 及原已登入代表皆不能提交 AE。
3. 少一組時不能鎖定。TEST 模擬只補啟用組的缺交答案、不覆寫既有答案，重複按不增加資料。全部提交後鎖定、公布 S1–S4，確認配分與原版一致。
4. 停用已有答案的組別應被拒絕；鎖定／公布後修改名單應被拒絕。兩個教師視窗同時編輯，後儲存的舊版本應被拒絕。
5. 比較正式課堂的原始名單、Stage 狀態與已公布成績；測試不得更動正式課堂。核對 CSV、手機登入與 QR。確認重置仍按原流程封存更正／搶答紀錄並保留參與名單。
6. 尚待多連線競爭測試：提交／撤回／鎖定／名單儲存同時發生；本機 PGlite 會序列化請求，不能取代真實 PostgreSQL 多連線驗證。

## 已執行的本機驗證

`tests/participation-db.cjs` 使用 PGlite 合成資料，涵蓋重跑遷移、13／16／17 組、第 8 組缺席、漏交拒鎖、無效／跨課堂名單、非教師拒絕、過期版本、已有答案保護、鎖定後禁止更改、停用加入／提交、TEST 限定及不覆寫、未公布分數保護與正式場次隔離。
`tests/participation-ui.cjs` 涵蓋名單勾選與分母、取消、版本參數、切課後舊操作失效、動態成績表。既有前端回歸測試亦需全部通過。

```text
npm install --prefix /temporary/test-runtime @electric-sql/pglite
node tbl-ae-realtime/tests/participation-db.cjs /temporary/test-runtime/node_modules/@electric-sql/pglite
node tbl-ae-realtime/tests/participation-ui.cjs
```

