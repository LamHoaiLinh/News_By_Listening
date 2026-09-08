# News_By_Listening
PWA tối giản để quản lý **phân loại → kênh/playlist YouTube → video**, sau đó mở nội dung bằng Brave trên iPhone để nghe nền.

## Chức năng
- Phân loại cấp 1: thêm / sửa / xóa / đổi thứ tự.
- Cấp 2: dán link kênh YouTube hoặc playlist.
- Kênh: tải 30 video mới nhất, mở video mới nhất hoặc chọn điểm bắt đầu.
- Playlist: tải toàn bộ danh sách (tối đa 1.000 item trong một lần tải của app), phát từ đầu hoặc từ video cụ thể.
- Mở Brave trên iPhone bằng URL scheme; nếu không mở được sẽ fallback sang link YouTube thường.
- Tốc độ ưa thích mặc định 1.5x và ghi nhớ lựa chọn gần nhất.
- Tab “Đã nghe”: ghi nhận video người dùng bấm mở từ app, tự xóa sau 3 ngày.
- Đồng bộ PC → iPhone bằng link đồng bộ hoặc file JSON; không cần backend.
- PWA, có thể Add to Home Screen.

## YouTube Data API key
App không nhúng API key vào source. Nhập key ở **Cài đặt** trên từng thiết bị, hoặc chủ động chọn “Kèm API key” khi tạo link đồng bộ giữa thiết bị cá nhân.

API dùng:
- `channels.list` để lấy metadata và uploads playlist của kênh.
- `playlistItems.list` để lấy video; tối đa 50 item/request nên app phân trang khi đọc playlist.

## Giới hạn kỹ thuật quan trọng
- Background playback, auto-next và lock-screen playback do Brave/YouTube xử lý; PWA không phát media YouTube trong nền.
- Vì player nằm ngoài PWA, app không thể cưỡng ép tốc độ playback của Brave/YouTube, EQ, volume boost hay xác nhận các video tự autoplay sau video đầu tiên đã thực sự được nghe. “Đã nghe” được ghi nhận tại thời điểm người dùng bấm mở video từ app.

## GitHub Pages
Repo có workflow `.github/workflows/pages.yml`. Nếu Pages chưa bật: **Settings → Pages → Source → GitHub Actions**.
