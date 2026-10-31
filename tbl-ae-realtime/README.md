# 2026 ID Block TBL — Supabase 即時版（初步整合測試）

教師：https://raycigol.github.io/raylogic-ID-education/tbl-ae-realtime/teacher.html
學生：https://raycigol.github.io/raylogic-ID-education/tbl-ae-realtime/student.html
成績：https://raycigol.github.io/raylogic-ID-education/tbl-ae-realtime/scores.html

## 流程
1. Supabase Authentication 中已啟用 Anonymous Sign-Ins，且建立教師 email/password。
2. 由教師使用 SQL Editor 私下將每組 tbl_team_invites.join_code 提供該組代表（不要將清單放進 GitHub）。
3. 教師登入 teacher.html 開放 Stage 1。學生在 student.html 輸入代碼加入。
4. 各組選 A–E 提交，教師端每 4 秒更新提交數；13/13 後才能鎖定。
5. 教師鎖定並按公布，成績頁才能看見該階段分數，下一 Stage 才能開啟。
6. 學生頁不顯示病例、答案解析或正解。

## 注意
- 目前使用每 4 秒輪詢，非真正 WebSocket Realtime push。
- 完全依賴 Supabase 既有 SQL tables/RPC/RLS 設定；未做實際跨手機測試，課前務必先用不同裝置測試。
- **安全待驗證**：SECURITY DEFINER 函式、教師角色、student join code、鎖定與提交競爭、已公布成績是否受到防提前洩漏保護。
- 不要在公開 GitHub 放 secret key、資料庫密碼或 13 組 join code。config.js 只可放 Supabase 公開 publishable key。
- 舊有單機及快照查分版保留不動。


## TEST 模擬提交工具
- 僅指定 TEST 課堂 `0f82561e-c980-44cb-8a5d-091dbc9c71e6` 且名稱為 `2026 ID Block TBL — TEST` 才顯示按鈕。
- 教師先開放階段，再按該階段「模擬 13 組提交（TEST）」並確認；為尚未提交的組別補答案 A，保留既有答案。這是實際測試資料，會納入 TEST 鎖定與計分。
- 未開放、已鎖定、已公布或已滿 13 組時停用；不自動開放、鎖定、公布或清除資料。
- 新環境先在 Supabase SQL Editor 執行 `sql/test-simulation.sql`。伺服器獨立檢查固定 TEST ID、名稱、教師擁有權、非匿名登入及階段狀態，正式課堂 ID 即使直接呼叫也會拒絕。
- 模擬列的 `submitted_by` 是操作教師；不建立學生帳號、不讀取或公開組別加入代碼。重複呼叫不覆寫答案、不增加重複列。
- 前端回歸測試：`node tbl-ae-realtime/tests/teacher-session.cjs`。

## 學生離開與課堂重置
- 學生按「離開組別／重新加入」可登出本機，再輸入正確代碼；不刪除原組答案。若已替錯誤組別作答，須通知教師處理，離開不能撤回答案。
- 提交前會顯示組別與答案供確認。教師登入不會被學生離開按鈕登出，請以獨立瀏覽器測試學生。
- 教師「重置本課堂」永久清除所選課堂的全部答案及分數，四階段回到未開放、active_stage 回到 1，保留組別、加入代碼及既有學生綁定。課前應重新核對組別代表。
- 重置前先另存需要保留的成績；需輸入完整課堂名稱並最後確認。伺服器核對課堂擁有權與名稱，並鎖住階段後在單一交易內執行。其他課堂不受影響。
- 新環境須先執行 `sql/reset-session.sql`。安裝函式本身不會清除任何課堂；只有呼叫重置才會刪除。
- 學生回歸測試：`node tbl-ae-realtime/tests/student-leave.cjs`。
