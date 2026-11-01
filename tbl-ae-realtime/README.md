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

## 六碼加入碼與 QR Code
- 教師登入後選擇課堂，切換「加入碼與 QR」分頁，按「產生／查看本課堂加入碼」。每組一個六碼代碼，不分大小寫，排除 0/O、1/I/L。不要公開整班代碼或提交至 GitHub。
- QR Code 在本機由隨附 qrcode-generator 1.4.4（MIT）產生，不呼叫外部 QR API。連結把代碼放在 URL fragment；學生頁讀入後移除 fragment，僅帶入欄位，不自動加入。
- 學生輸入短碼或原 UUID 皆可加入，仍遵守一組一位代表規則。已加入他組時先離開；若該組已有代表，請聯絡教師，不會覆蓋原代表或答案。
- 「更新此組短碼」會停用舊短碼／QR Code，保留已加入學生與原 UUID。舊短碼不重複發給別組。課堂重置也保留短碼，需要更換時另按更新。
- 新環境先執行 `sql/short-join-codes.sql`。新增資料表開啟 RLS 並禁止學生直接讀取；教師管理函式核對課堂擁有權，學生加入沿用原本 UUID 加入函式。
- 新加入入口每個匿名帳號每分鐘最多 5 次嘗試（含失敗），回傳失敗結果而不拋出例外，以保留計數；超限後等一分鐘。這是帳號限制，匿名帳號建立仍受 Supabase Authentication 既有速率設定管理。原 UUID RPC 保留相容性。
- 學生記住所選課堂，成績頁依此查詢；若已無該課堂資格，不會自動切換到其他課堂。

## 組別代表管理
- 教師選擇課堂，切換「組別代表」分頁，按「重新整理代表狀態」。顯示各組已綁定代表數及已提交階段，這不是即時在線人數。
- 「解除代表綁定」只解除該組操作資格，答案與分數保留；新代表可用原加入碼加入。解除不會刪除匿名帳號，也不會登出其他課堂。
- 「解除並更新短碼」同時讓舊短碼／QR Code 失效，但原 UUID 仍有效。持有有效代碼的人仍能重新加入；這是換代表工具，不是永久封鎖帳號。
- 解除時伺服器核對教師擁有權、課堂名稱、組別及畫面所載代表清單。若已換代表，舊畫面不能誤解除新代表，需重新整理後再確認。
- 提交函式鎖住代表綁定直到提交完成。解除會等待已在處理的提交結束；解除完成後，未重新加入的舊代表不能再取得該課堂學生狀態、成績或提交答案。已載入裝置的內容無法收回，學生頁下次刷新會移除操作區。
- 「重置課堂」可勾選「同時解除本課堂全部代表」，預設不勾選。無論是否解除代表，都保留組別、UUID 及短碼；重置仍會清除答案與分數。
- 教師頁上方固定顯示所選課堂與三個功能分頁。「課程控制」包含階段操作與成績，重置收在底部「課後重置設定」內。切換功能分頁不變更課堂，也不會自動產生短碼、解除代表或重置資料；四秒刷新不切回其他分頁。
- 新環境執行 `sql/representatives.sql` 前，先安裝原有 reset-session 與 short-join-codes SQL。安裝本身不會解除任何代表。新前端重置呼叫 `tbl_teacher_reset_with_members`，舊兩參數重置仍保留相容性。
- 測試：`node tbl-ae-realtime/tests/representatives.cjs`，以及教師、學生、成績、短碼回歸測試。TEST 回滾驗證涵蓋解除保留資料、舊權限撤銷、換代表加入、畫面過期拒絕、更新短碼及重置兩種選項。
- 測試：`node tbl-ae-realtime/tests/join-codes.cjs`、`node tbl-ae-realtime/tests/scores-session.cjs`，以及前述學生／教師回歸測試。資料庫已以 TEST 回滾驗證加入、輪替、失效碼、嘗試限制與正式課堂隔離。
