# SPEC SUMMARY

# 1. AI Product Canvas

| Value | **Trust** | **Feasibility** |
| --- | --- | --- |
| User nào?
→ Dev ( người tạo PR ) , Reviewer/ Tech Lead ( Người duyệt PR )
Pain là gì?
→ Dev: Mất thời gian viết mô tả, đôi khi lười giải thích các thay đổi, viết không đủ ý.
→ Reviewer: Đọc quá nhiều git diff mà có thể không hiểu mục đích tổng quát,….
AI làm gì? 
→ automation việc PR, phân tích git diff, noti kèm tóm tắt cho team member | Khi AI sai → user bị gì?
→ Nhẹ: tóm tắt thiếu ý hoặc sai thuật ngữ
→ Nặng: Đánh giá sai về Potential Risks → Reviewer bỏ qua lỗi logic nghiêm trọng 
Sửa như thế nào?
→AI thự hiện drafting → Dev có quyển chỉnh sửa trước khi PR
→ Có thể đính kèm link đến dòng code or file code cụ thể | Cost?
→ Token cost: Git diff của các PR lớn
→ Chi phí duy trì server để lắng nghe webhook và tích hợp Slack, discord….
Latency?
→ Việc tóm tắt cần diễn ra nhanh để PR để đảm bảo tính real-time 
→ Độ trễ từ việc gọi API LLM
Risk chính?
→ Security: Gửi mã nguồn công ty lên bên thứ 3
→ Context limit: PR quá lớn vượt quá khả năng xử lý của LLM. |

Dự án nằm ở mức **Augmentation** là chủ yếu:

- **PR Writing:** Hỗ trợ viết nháp để Dev duyệt.
- **Summarize:** Hỗ trợ Reviewer nắm bắt nhanh thông tin.
- **Notification:** Tự động hóa quy trình phân phối tin nhắn.

# 2. User Stories (4 kịch bản trải nghiệm)

## Hỗ trợ viết PR

| **Path** | **Câu hỏi thiết kế** | **Mô tả** |
| --- | --- | --- |
| **Happy** — AI đúng, tự tin | User thấy gì? Flow kết thúc ra sao? | Bot tự điền (Auto-fill) Description chuyên nghiệp. User thấy đúng, nhấn "Create Pull Request" và kết thúc. |
| **Low-confidence** — AI không chắc | System báo "không chắc" bằng cách nào? User quyết thế nào? | Hiện 2 bản nháp gợi ý (ví dụ: Bản kỹ thuật vs. Bản tóm tắt quản lý). User chọn 1 bản để áp dụng. |
| **Failure** — AI sai | User biết AI sai bằng cách nào? Recover ra sao? | AI viết sai mục đích (nhầm Bug thành Feature). User thấy nội dung không khớp với code mình viết $\rightarrow$ Xóa trắng hoặc nhấn nút "Regenerate". |
| **Correction** — User sửa | User sửa bằng cách nào? Data đó đi vào đâu? | User sửa tay trực tiếp vào Description $\rightarrow$ Bot lưu bản sửa (Correction log) để tinh chỉnh style viết của User cho lần sau. |

## Tóm tắt PR

| **Path** | **Câu hỏi thiết kế** | **Mô tả** |
| --- | --- | --- |
| **Happy** — AI đúng, tự tin | User thấy gì? Flow kết thúc ra sao? | Reviewer thấy một bảng tóm tắt (Bullet points) ngắn gọn ở Comment đầu tiên. Hiểu code ngay mà không cần lướt file diff. |
| **Low-confidence** — AI không chắc | System báo "không chắc" bằng cách nào? User quyết thế nào? | Bot ghi chú: "Phần này chứa logic phức tạp, tôi chỉ tóm tắt được 60%". User nhấn "Show more" để xem phân tích chi tiết file-by-file. |
| **Failure** — AI sai | User biết AI sai bằng cách nào? Recover ra sao? | AI tóm tắt thiếu rủi ro bảo mật quan trọng. Reviewer thấy khi đọc code thực tế $\rightarrow$ Nhấn nút "Downvote" báo hiệu AI tóm tắt lỗi. |
| **Correction** — User sửa | User sửa bằng cách nào? Data đó đi vào đâu? | Reviewer hoặc Author bổ sung ý chính vào comment của Bot $\rightarrow$ Bot cập nhật lại Summary dựa trên feedback đó. |

## Gửi thông báo

| **Path** | **Câu hỏi thiết kế** | **Mô tả** |
| --- | --- | --- |
| **Happy** — AI đúng, tự tin | User thấy gì? Flow kết thúc ra sao? | Slack nổ thông báo kèm Summary đẹp mắt và nút "Review Now". User click link dẫn thẳng đến đúng dòng code cần xem. |
| **Low-confidence** — AI không chắc | System báo "không chắc" bằng cách nào? User quyết thế nào? | Noti ghi: "PR mới được mở, AI đang phân tích sâu...". User có thể chờ hoặc click vào xem bản thô (Raw diff) trước. |
| **Failure** — AI sai | User biết AI sai bằng cách nào? Recover ra sao? | Thông báo gửi sai channel hoặc link bị die. User báo lỗi qua command `/pr-ease-support` $\rightarrow$ System tự động gửi lại webhook. |
| **Correction** — User sửa | User sửa bằng cách nào? Data đó đi vào đâu? | User tùy chỉnh cấu hình Noti (ví dụ: Chỉ báo khi có rủi ro cao) $\rightarrow$ Preference này được lưu vào database cho các thông báo sau. |

# 3.Eval Metrics (Đo lường thành công

### Metric 1: Tỷ lệ chấp nhận bản nháp (Acceptance Rate)

- **Loại Signal:** Tín hiệu ngầm (Implicit feedback).
- **Cách đo:** Tỷ lệ phần trăm các Pull Request mà Developer nhấn "Chấp nhận" hoặc chỉ sửa dưới 20% nội dung do AI gợi ý.
- **Ngưỡng (Threshold):** > 70%. (Tương tự Copilot thành công dù độ chính xác thực tế có thể thấp hơn nhưng ma sát người dùng (friction) bằng 0).
- **Cờ đỏ (Red flag):** Tỷ lệ chấp nhận < 40% trong 1 tuần liên tục (người dùng đang tốn thời gian sửa AI nhiều hơn là tự viết).

### Metric 2: Độ chính xác tóm tắt rủi ro (Precision of Risk Assessment)

- **Loại Signal:** Kiểm định định tính chuyển đổi định lượng (Qualitative to Quantitative).
- **Cách đo:** Trong số các PR mà AI đánh dấu là "Low Risk", có bao nhiêu PR thực tế phát sinh lỗi logic nghiêm trọng sau khi merge?. Vì hậu quả của việc AI "bỏ lọt" lỗi là rất nặng (Reviewer bỏ qua lỗi logic), ta cần ưu tiên **Precision** (Khi AI nói "An toàn", nó phải thực sự an toàn).
- **Ngưỡng (Threshold):** Precision > 90% đối với các cảnh báo rủi ro cao.
- **Cờ đỏ (Red flag):** Xảy ra ít nhất 1 trường hợp "Hậu quả nặng": AI tóm tắt thiếu rủi ro bảo mật/logic quan trọng khiến Reviewer bỏ lọt lỗi.

### Metric 3: Hiệu suất phản hồi (Efficiency & Latency)

- **Loại Signal:** Hiệu quả vận hành (Feasibility metric).
- **Cách đo:** Thời gian trung bình từ khi có Webhook Git Diff đến khi AI gửi thông báo tóm tắt vào Slack/Discord. Để đảm bảo tính real-time như bạn mong muốn, độ trễ phải được kiểm soát chặt chẽ.
- **Ngưỡng (Threshold):** < 30 giây cho mỗi PR có kích thước trung bình (< 500 dòng code).
- **Cờ đỏ (Red flag):** Latency > 2 phút hoặc gặp lỗi "Context limit" (vượt giới hạn xử lý của LLM) trên 15% số lượng PR.

# 4. Top 3 Failure Modes (Hải Nam)

## **Hallucination (Ảo giác):** AI mô tả sai logic code.

*Mitigation:* Thêm disclaimer "AI-generated" và chỉ tóm tắt dựa trên `git diff` thực tế, không suy diễn ngoài context.

## **Secret Leakage (Lộ bí mật):** Dev vô tình push API Key/Password vào PR

*Mitigation:* Chạy một hàm Regex local để quét và che (mask) các chuỗi nhạy cảm trước khi gửi sang API của OpenAI/Gemini, sau đó cảnh báo người dùng ở summarize.

## **API Rate Limit:** Vượt quá giới hạn gọi bot của GitHub hoặc Slack.

*Mitigation:* Triển khai hàng đợi (Queue) xử lý Webhook để không làm rớt các event khi traffic cao.

# **5. ROI 3 kịch bản  **

*(Giả định quy đổi: 1 giờ làm việc của nhân sự = $30)*

|  | Conservative | Realistic | Optimistic |
| --- | --- | --- | --- |
| Assumption | 100 user/ngày, 60% hài lòng | 500 user/ngày, 80% hài lòng | 2000 user/ngày, 90% hài lòng |
| Cost | $50/ngày  | $200/ngày | $500/ngày |
| Benefit | Giảm 2h support/ngày*(Tương đương giá trị: $60/ngày)* | Giảm 8h/ngày*(Tương đương giá trị: $240/ngày)* | Giảm 20h, tăng retention 5%(Tương đương giá trị: $600/ngày + Lợi ích giữ chân nhân sự)* |
| Net | **+$10/ngày** | +$40/ngày | **+$100/ngày** (chưa tính giá trị quy đổi từ 5% retention) |

**Kill criteria (Khi nào nên dừng dự án?):**

- Khi Cost > Benefit trong 2 tháng liên tục.

# 6. Mini AI Spec 1 trang (Kiến trúc kỹ thuật) (Bằng)

**Mục tiêu:** Xây dựng hệ thống trung gian (Middleware) tự động hóa quy trình Pull Request (PR) bằng LLM, tối ưu hóa thời gian cho Dev và Reviewer.

### I. Data Pipeline & Pre-processing

Để giải quyết vấn đề **Context Limit** và **Security**, dữ liệu không được gửi trực tiếp từ Webhook tới LLM.

- **Input Stage:** Tiếp nhận Webhook từ GitHub (Event: `opened`, `synchronize`).
- **Octokit Extraction:** Sử dụng Octokit để fetch `git diff`.
- **Pre-filtering & Cleaning:**
    - Loại bỏ các file không mang giá trị logic: `package-lock.json`, `yarn.lock`, các tệp assets (svg, png), source map.
    - **Secret Masking (Regex Engine):** Quét cục bộ để phát hiện và dùng `[MASKED]` thay thế các chuỗi nhạy cảm (API Keys, Passwords) trước khi đẩy lên Cloud LLM.
- **Chunking Strategy:** Nếu Diff > 128k tokens, hệ thống sẽ chia nhỏ theo từng file hoặc module và thực hiện tóm tắt phân đoạn (Map-Reduce approach).

### II. Model & Prompt Engineering

Sử dụng mô hình có khả năng xử lý context lớn (như GPT-4o hoặc Gemini 1.5 Pro).

- **System Prompt (The Tech Lead Persona):**
    - **Role:** Senior Tech Lead với phong cách súc tích, thực tế.
    - **Task:** Phân tích sự thay đổi logic, xác định rủi ro tiềm ẩn (Breaking changes, Security flaws) và tóm tắt theo cấu hình người dùng.
    - **Constraint:** Không được suy diễn (No hallucination). Nếu không chắc chắn về một hàm, phải ghi rõ "Cần Reviewer kiểm tra kỹ phần logic tại [File Path]".
- **Few-shot Prompting:** Cung cấp 3-5 ví dụ về các PR "mẫu mực" của công ty để AI học theo đúng văn hóa viết lách (Tone & Mood) của team.

### III. Hệ thống Phản hồi & Tích hợp (Integration)

- **GitHub Output:**
    - Cập nhật `PR Description`: Cấu trúc Markdown gồm: **What's changed**, **Why**, và **Testing Plan**.
    - **Automated Comment:** Bảng tóm tắt rủi ro (Risk Level: Low/High) ngay dưới diff.
- **Slack/Discord Output:**
    - Sử dụng **JSON Block Kit** để tạo Notification Card.
    - Nút tương tác: `[Approve]`, `[Request Changes]`, `[View Diff]`.
- **Feedback Loop:** Ghi nhận hành động `Edit` của User trên GitHub Description để làm dữ liệu tinh chỉnh (Fine-tuning) hoặc nâng cấp Prompt trong tương lai.

### IV. Technical Guardrails (Cơ chế phòng vệ)

Để đảm bảo **Metric 3 (Latency)** và tránh **Rate Limit**:

1. **Queue System (BullMQ/Redis):** Webhook sẽ được đẩy vào hàng đợi. LLM sẽ xử lý bất đồng bộ để tránh làm treo hệ thống khi có "bão" PR vào cuối ngày.
2. **Fallback Mechanism:** Nếu LLM gặp lỗi (Timeout/API Down), hệ thống gửi thông báo: "AI đang bận, vui lòng thử lại sau" thay vì để treo PR.
3. **Cost Control:** Thiết lập hạn mức (Quota) token theo ngày/tuần cho từng repository để tránh rủi ro "vỡ quỹ" API.

---

**Sơ đồ luồng dữ liệu đơn giản:**`GitHub Webhook` → `Pre-processor (Masking/Filtering)` → `Task Queue` → `LLM (Summarizer/Risk Analyst)` → `GitHub API / Slack Webhook`