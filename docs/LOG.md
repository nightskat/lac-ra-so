# LOG

## 2026-11-03 — CI + test + 3 bug fix (nhánh `claude/pensive-hypatia-3l9vf4`)

### Đã làm
- CI: `.github/workflows/test.yml` (Node 22, `npm ci`, cài Chromium, `npm test`) — trước đó repo không có CI/test nào.
- `test/core.test.mjs` (8 test): trích khối `// Draw` … `let game=` từ chính `index.html` rồi test `pick`, `roll`, `C`, chuỗi tỉ lệ `GAMES` (6/45 = 8.145.060; 6/55 = 28.989.675; 5/35×12 = 3.895.584; Keno 10/10 ≈ 8.911.711), cộng chi-square với seed cố định (không flaky).
- `test/e2e.test.mjs` (5 test, Chromium headless, server 127.0.0.1): vẽ tay → bốc → kiểm số ô/khoảng số/lịch sử cho cả 6 game; 3 test hồi quy cho 3 bug bên dưới.
- Fix 1 `index.html`: không có `crypto.subtle` (mở qua `http://` IP LAN, không phải HTTPS/localhost) → trước đây nút “Bốc số” bị khoá vĩnh viễn, không báo gì. Giờ báo lỗi rõ và mở lại nút; mọi lỗi khác trong lúc bốc cũng được bắt.
- Fix 2 `index.html`: bấm “bật cảm biến” 2 lần → trước đây mở 2 stream mic, vòng lặp cũ không bao giờ dừng. Giờ dừng stream/vòng cũ trước.
- Fix 3 `index.html` (từ review đối kháng của advisor `fable`, đã tái hiện): trong lúc đang bốc, một `pointermove` hay tick mic gọi `update()` mở lại nút → bấm lần 2 ra 2 vé. Giờ dùng cờ `drawing`.
- CI chỉ chạy `push` trên `main` + `pull_request` (tránh chạy đôi).
- Bằng chứng: chạy bộ test trên `index.html` cũ → 3 test hồi quy fail; trên bản mới → 13/13 pass.

### Bài học
- `node --test test/` trên Node 22 coi `test/` là file → dùng glob `test/*.test.mjs`.
- `update()` vẽ qua `requestAnimationFrame` → test trạng thái nút phải `waitForFunction`, không assert ngay.
- Code nằm trong IIFE nên không gọi được từ page; trích nguồn bằng marker comment là cách ít xâm lấn nhất (không phải refactor). Đổi tên marker `// Draw` / `let game=` sẽ làm test báo lỗi rõ ràng.

- Advisor nói “bấm cảm biến 2 lần → đếm gyro gấp đôi”. Mình kiểm lại thì **sai**: Chromium tự phát 1 `devicemotion` khi gắn listener, còn `addEventListener` cùng hàm thì không đăng ký trùng. Không sửa. → Review của agent cũng phải kiểm lại.

### Phát hiện (CHƯA KIỂM)
- (advisor, chỉ đọc code) Nếu bấm Bốc khi `getUserMedia` còn đang chờ, mic có thể bật *sau* lần bốc và chạy tiếp.
- (advisor) Mỗi lần bật mic tạo `AnalyserNode` mới, không `disconnect` → rò nhỏ.
- (advisor, đã thấy) Sau khi bốc, chip mic luôn ghi “đã tắt” kể cả khi trước đó là “bị từ chối”/“không có”.
- Tỉ lệ XSMB trong UI (“~1/333.333”, “~1/18,5”, giả định 20 ký hiệu) chưa đối chiếu với cơ cấu giải thực tế.
- Chưa thử trên thiết bị iOS/Android thật (quyền gyro/la bàn, mic); e2e chỉ dùng mic giả của Chromium.
- CI workflow chưa chạy trên GitHub tại thời điểm viết — xem tab Checks của PR.

### Lệnh chạy lại
```bash
npm ci
```
```bash
npx playwright install chromium
```
```bash
npm test
```
