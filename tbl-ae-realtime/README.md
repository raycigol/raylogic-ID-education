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
