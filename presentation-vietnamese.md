# Bài Thuyết Trình: PR Intelligence Agent Platform

---

## Slide 1: Mở Đầu

**PR Intelligence Agent Platform**

- AI-agent-first scaffold cho quy trình PR: monitoring, phân tích rủi ro và gửi thông báo real-time
- Dành cho: Developer (tạo PR) và Reviewer/Tech Lead (duyệt PR)

> *"Tự động hóa PR, giảm thời gian review, tăng chất lượng code"*

---

## Slide 2: Vấn Đề (Pain Points)

| Người dùng | Vấn đề |
|------------|--------|
| **Developer** | Mất thời gian viết mô tả PR, lười giải thích thay đổi, viết không đủ ý |
| **Reviewer** | Đọc quá nhiều git diff mà không hiểu mục đích tổng quát của PR |

**Kết quả:** PR review chậm, thiếu sót lỗi logic, giao tiếp team kém hiệu quả.

---

## Slide 3: Giải Pháp Của Chúng Tôi

**3 tính năng chính:**

1. **Hỗ trợ viết PR** - AI viết nháp description chuyên nghiệp, Dev chỉ cần duyệt và sửa
2. **Tóm tắt PR thông minh** - AI phân tích git diff, tóm tắt logic thay đổi và rủi ro
3. **Thông báo tự động** - Gửi noti kèm summary qua Slack/Discord khi có PR mới

---

## Slide 4: Kiến Trúc Hệ Thống (4 lớp)

```
┌─────────────────────────────────────────┐
│  Control Plane: Next.js Admin Console   │
├─────────────────────────────────────────┤
│  Event Plane: Webhook nhận từ GitHub    │
├─────────────────────────────────────────┤
│  AI Agent Plane: LangGraphJS Workflow   │
│  (7 agents: Planner → Security → Code   │
│   Understanding → Risk Review → ...)     │
├─────────────────────────────────────────┤
│  Delivery Plane: GitHub, Slack, Discord   │
└─────────────────────────────────────────┘
```

---

## Slide 5: Luồng Hoạt Động

**Từ khi có PR đến khi gửi thông báo:**

1. GitHub gửi webhook khi PR được mở/cập nhật
2. Pre-processor: lọc file không cần thiết + che giấu API keys/secrets
3. Chunking: chia nhỏ diff lớn nếu vượt quá context limit
4. 7 AI agents phân tích tuần tự
5. Output: Cập nhật PR description + comment tóm tắt + thông báo Slack/Discord

> ⚡ **Latency mục tiêu:** < 30 giây cho PR < 500 dòng code

---

## Slide 6: Các AI Agent (LangGraphJS)

| Agent | Nhiệm vụ |
|-------|----------|
| **Planner** | Lập kế hoạch phân tích |
| **Context Retrieval** | Thu thập thông tin liên quan |
| **Security** | Phát hiện lỗ hổng bảo mật, secrets |
| **Code Understanding** | Hiểu logic code thay đổi |
| **Risk Reviewer** | Đánh giá rủi ro (Low/High) |
| **Testing** | Đề xuất test plan |
| **Synthesis** | Tổng hợp kết quả |
| **Critic** | Kiểm tra lại trước khi output |

---

## Slide 7: Xử Lý Rủi Ro (Failure Modes)

| Rủi ro | Giải pháp |
|--------|-----------|
| **AI "ảo giác" (Hallucination)** | Chỉ tóm tắt dựa trên git diff thực tế, thêm disclaimer "AI-generated" |
| **Lộ bí mật (Secret Leakage)** | Regex engine quét và che `[MASKED]` API keys/passwords trước khi gửi LLM |
| **API Rate Limit** | Hàng đợi (Queue) xử lý webhook bất đồng bộ (BullMQ/Redis) |

---

## Slide 8: Công Nghệ Sử Dụng

| Thành phần | Công nghệ |
|------------|-----------|
| Frontend | Next.js + React |
| AI Workflow | LangGraphJS (multi-agent graph) |
| AI Provider | GPT-4o / Gemini 1.5 Pro (qua Groq) |
| Database | Memory store (local) / Prisma + Postgres (production) |
| Queue | BullMQ / Redis |
| Integrations | GitHub API, Slack Block Kit, Discord Webhook |
| Testing | Vitest + Test Harness |

---

## Slide 9: Cách Chạy Demo

```bash
# 1. Cài đặt
npm install

# 2. Chạy local
npm run dev

# 3. Hoặc test PR thực tế
curl -X POST http://localhost:3000/api/demo/analyze-pr \
  -H "Content-Type: application/json" \
  -d '{"owner":"your-org","repo":"your-repo","pullNumber":123}'
```

**UI flow:**
- `/integrations` - Quản lý kết nối Slack/Discord
- `/live-demo` - Chọn repo + PR và chạy workflow

---

## Slide 10: Đo Lường Thành Công

| Metric | Mục tiêu |
|--------|----------|
| **Acceptance Rate** | > 70% (tỷ lệ chấp nhận bản nháp AI) |
| **Risk Precision** | > 90% (khi AI nói "an toàn", phải thực sự an toàn) |
| **Latency** | < 30s cho PR < 500 dòng |

**Kill criteria:** Cost > Benefit trong 2 tháng liên tiếp.

---

## Slide 11: ROI Dự Kiến

| Kịch bản | Conservative | Realistic | Optimistic |
|----------|--------------|-----------|------------|
| Users/ngày | 100 | 500 | 2000 |
| Chi phí | $50 | $200 | $500 |
| Lợi ích | $60 | $240 | $600+ |
| **Net/ngày** | **+$10** | **+$40** | **+$100** |

*(Giả định: 1 giờ làm việc = $30)*

---

## Slide 12: Kết Luận

**PR Intelligence Agent Platform** giúp:
- ✅ Dev tiết kiệm thời gian viết PR description
- ✅ Reviewer nắm bắt nhanh logic thay đổi
- ✅ Team nhận thông báo real-time trên Slack/Discord
- ✅ Giảm rủi ro lỗi logic nghiêm trọng qua AI Risk Analysis

> **"Augmentation, không phải Replacement"** - AI hỗ trợ, con người quyết định.

---

## Q&A

**Cảm ơn đã lắng nghe!**

Liên hệ: [Thông tin của bạn]
GitHub: [Link repo]
