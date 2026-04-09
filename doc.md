“Dự án của tôi là một nền tảng AI agent chuyên theo dõi và phân tích Pull Request trên GitHub theo thời gian thực.

Vấn đề mà dự án giải quyết là: khi một team làm việc trên nhiều PR cùng lúc, reviewer rất dễ bỏ sót rủi ro, bỏ sót test cần chạy lại, hoặc mất thời gian đọc từng diff thủ công. Vì vậy, tôi xây dựng một hệ thống có thể tự động đọc PR, phân tích thay đổi code, đánh giá mức độ rủi ro, rồi gửi kết quả về đúng nơi team đang làm việc.

Luồng hoạt động của hệ thống như sau. Người dùng đăng nhập bằng GitHub, cấu hình các kênh nhận thông báo như Slack hoặc Discord, rồi kết nối repository cần theo dõi. Khi có một pull request mới hoặc PR được cập nhật, hệ thống sẽ nhận webhook từ GitHub và kích hoạt một chuỗi AI agent để xử lý.

Chuỗi agent gồm nhiều bước. Đầu tiên là Planner Agent để xác định PR này thuộc loại gì và nên phân tích theo hướng nào. Sau đó Context Agent thu thập ngữ cảnh cần thiết, Security Agent tìm các điểm nhạy cảm, Code Understanding Agent tóm tắt thay đổi chính, Risk Reviewer Agent đánh giá rủi ro, Testing Agent đề xuất các test cần chạy, rồi Synthesis Agent tổng hợp tất cả thành một bản brief chuẩn. Cuối cùng, hệ thống sẽ gửi kết quả ra GitHub comment, check run, Slack hoặc Discord.

Điểm mạnh của dự án này là nó không chỉ là một bot tóm tắt PR đơn giản, mà là một hệ thống agent hóa có workflow rõ ràng, có confidence control, có routing theo repo, và có khả năng notify real-time cho cả team. Mục tiêu của tôi là giúp reviewer ra quyết định nhanh hơn, giảm rủi ro khi merge code, và làm cho quá trình review trở nên nhẹ hơn nhưng vẫn chính xác.

“Project này chia PR thành nhiều bước xử lý. Mỗi agent chỉ làm một việc: hiểu PR, tìm ngữ cảnh, soi rủi ro, đề xuất test, rồi tổng hợp thành một brief cuối cùng để gửi về GitHub, Slack, và Discord.”

1. Planner Agent
Agent này trả lời câu hỏi: PR này thuộc loại gì và nên review theo hướng nào.

Nó phân loại PR thành feature, bugfix, refactor, infra, config, migration, security-sensitive, dependency, docs-only, test-only, hoặc mixed.
Nó cũng phân loại event thành full-review, state-refresh, hoặc closeout.
Nó chọn strategy là shallow, normal, deep, hoặc partial.
Anh có thể nói ví dụ như sau:

feature: thêm chức năng mới, ví dụ thêm API mới hoặc màn hình mới.
bugfix: sửa lỗi logic, ví dụ null check, condition sai, crash.
refactor: đổi cấu trúc code, risk thường không nằm ở chức năng mới mà ở chỗ phá behavior cũ.
infra/config: sửa env, CI, webhook, deploy, rất dễ làm app không chạy.
migration: thay schema, database, data format, có thể ảnh hưởng dữ liệu cũ.
security-sensitive: đụng auth, permission, token, secret, cần review sâu.
dependency: update package, có thể kéo theo breaking change.
docs-only hoặc test-only: rủi ro thấp hơn, có thể review nhẹ hơn.
Về strategy:

shallow là review nhẹ, dùng cho PR nhỏ, ít file.
normal là mặc định.
deep là khi PR đụng auth, config, migration, billing, security.
partial là khi PR quá lớn, hệ thống chỉ soi phần quan trọng nhất trước.
Nếu bị hỏi “tại sao cần Planner?”, anh trả lời: để không review mọi PR bằng cùng một mức chi phí. PR nhỏ thì không cần phân tích quá sâu, PR nhạy cảm thì phải review nặng hơn.

2. Context Retrieval Agent
Agent này trả lời: cần thêm ngữ cảnh gì để hiểu PR đúng hơn.

Nó thu thập từ diff, file paths, repo memory, labels, reviewers, và các file liên quan.
Nó tạo ra:
relatedModules
keyQuestions
missingContext
Ví dụ:

Nếu PR đổi auth/session.ts, context agent sẽ nhắc rằng cần biết flow login/logout, token refresh, middleware.
Nếu PR đổi migrations/, nó sẽ hỏi có rollback plan chưa, data cũ có bị ảnh hưởng không.
Nếu PR đổi file config, nó sẽ hỏi env nào phải set, deploy nào cần restart.
Nó lấy ngữ cảnh từ đâu:

Từ diff của PR.
Từ danh sách file đã đổi.
Từ repo memory, ví dụ những path hay nhạy cảm hoặc hay gây lỗi.
Từ signal của Planner và Security agent.
Độ khả thi:

Rất khả thi vì nó không cần clone toàn bộ repo để làm việc.
Nó chỉ tạo một “context packet” gọn, đủ cho các agent sau.
Nếu thiếu gì thì nó nói thẳng là thiếu, không tự bịa.
Nếu bị hỏi “nó khác gì việc đọc diff thường?”, anh trả lời: diff chỉ cho thấy thay đổi, còn Context Agent cố nói thêm “cần xem gì nữa để hiểu đúng thay đổi đó”.

3. Security Agent
Agent này soi các điểm nhạy cảm về bảo mật và vận hành.

Nó tìm gì:

Auth risk: đụng login, session, token, permission.
Config risk: đổi env, webhook, deployment settings.
Secret risk: token, API key, private key, credentials.
Sensitive module: auth/, security/, permissions/, payments/, billing/.
Dependency risk: nâng cấp package có thể kéo theo lỗ hổng hoặc breaking change.
Nó làm gì sau khi tìm thấy:

Gắn cờ finding.
Mặc mask cho secret trước khi các agent khác nhìn thấy.
Nâng mức attention nếu chạm vào vùng nhạy cảm.
Nếu rủi ro cao, nó góp phần làm reviewerPosture thành senior-review.
Anh có thể nói ngắn gọn:
“Security Agent không quyết định code an toàn hay không. Nó chỉ nói chỗ nào reviewer phải nhìn kỹ hơn và che những dữ liệu nhạy cảm trước khi AI xử lý tiếp.”

4. Code Understanding Agent
Agent này giải thích “đoạn code đang làm gì”.

Nó đọc các file quan trọng đã được chọn.
Nó tóm tắt từng file theo 3 phần:
summary: thay đổi kỹ thuật là gì.
businessIntent: thay đổi này phục vụ mục tiêu gì.
reviewerFocus: reviewer nên nhìn vào đâu.
changeType: logic, api, config, data, test, docs.
Nguồn của nó:

Từ patch của PR.
Từ file contents đã được chọn.
Từ ngữ cảnh do Context Agent cung cấp.
Ví dụ:

File src/auth/session.ts có thể được tóm tắt là: “thêm kiểm tra token trước khi tạo session”.
businessIntent: “ngăn user chưa xác thực truy cập.”
reviewerFocus: “xem lại nhánh token missing và edge case session refresh.”
Nếu bị hỏi “nó có đọc cả repo không?”, anh trả lời: không nhất thiết. Nó đọc các file đáng chú ý nhất, rồi kết luận ngắn gọn và có ích cho reviewer.

5. Risk Reviewer Agent
Agent này đánh giá rủi ro của thay đổi.

Rủi ro nó soi là gì:

Logic bug: condition sai, branch thiếu case.
Security risk: lộ token, auth bypass, permission hole.
Performance risk: query nặng, loop lớn, N+1, extra network call.
Breaking change: đổi contract, đổi shape dữ liệu, đổi API.
Configuration risk: env sai, webhook sai, deploy fail.
Concurrency risk: race condition, state conflict.
Nó làm gì:

Mỗi finding có:
severity: low, medium, high
category: logic, security, performance, breaking-change, configuration, concurrency
summary
reviewerAction
Ví dụ reviewerAction:

“Verify backward compatibility with existing sessions.”
“Add rollback path for migration.”
“Check that webhook endpoint handles retries idempotently.”
Nếu bị hỏi “rủi ro của cái gì?”, anh trả lời:
“Rủi ro của việc merge PR này vào hệ thống thật. Tức là nó có thể làm sai logic, làm lộ dữ liệu, làm chậm hệ thống, hoặc làm hỏng deploy.”

Hướng xử lý rủi ro:

Với auth/config/migration: test sâu hơn, review kỹ hơn, thêm rollback plan.
Với logic: kiểm tra branch, null case, edge case.
Với dependency: xem changelog, breaking changes, lockfile.
Với concurrency: kiểm tra idempotency và race condition.
6. Testing Agent
Agent này biến diff thành kế hoạch test cụ thể.

Nó trả lời:

Nên chạy test gì?
Chạy ở đâu?
Ưu tiên test nào trước?
Loại test nó đề xuất:

unit: test logic nhỏ, function, helper.
integration: test giữa các module, API, DB, webhook.
manual: test bằng tay khi có UI, rollout, config.
regression: test để chắc bug cũ không quay lại.
Ví dụ:

Nếu PR đụng auth, nó có thể đề xuất unit test cho token validation và integration test cho login flow.
Nếu PR đụng config/deploy, nó sẽ gợi ý manual check trên staging hoặc khi deploy thật.
Nếu PR đụng migration, nó sẽ nhắc backup data và test rollback.
Kết quả của nó dùng để làm gì:

Giúp reviewer biết cần chạy test nào.
Giúp dev biết nên check ở môi trường nào.
Giảm nguy cơ merge code mà chưa test đủ.
Nếu bị hỏi “nó có tự chạy test không?”, anh trả lời: không nhất thiết. Nó chủ yếu tạo test plan và ưu tiên để con người hoặc CI chạy đúng chỗ.

7. Synthesis Agent
Đây là bước tổng hợp tất cả thành một canonical brief.

brief là gì:

Là bản tóm tắt chuẩn, ngắn gọn nhưng đủ thông tin cho reviewer.
Nó gom kết quả từ Planner, Context, Security, Code Understanding, Risk, và Testing thành một khối duy nhất.
Trong brief có:

title
eventSummary
whatChanged
whyItMatters
reviewerFocus
attentionLevel
testImpact
confidence
missingContext
importantFiles
reviewerPosture
escalationNote
nextActions
disclaimer
Cách nói dễ hiểu:
“Brief là bản kết luận cuối cùng mà reviewer có thể đọc trong vài chục giây để biết PR này là gì, có đáng lo không, và nên kiểm tra gì.”

8. Critic Agent
Agent này kiểm tra chất lượng output trước khi gửi ra ngoài.

Nó làm gì:

Giảm confidence nếu:
PR quá lớn
thiếu context
phân tích chỉ là partial
findings không đủ chắc
Xác định reviewerPosture:
monitor
careful-review
senior-review
Quyết định có nên publish ra Slack/Discord không.
Cách nói cho dễ:
“Critic Agent là lớp kiểm tra cuối, để AI không tự tin quá mức khi evidence còn mỏng.”

9. Persona Composer Agent
Agent này không phân tích thêm, mà đóng gói output cho từng kênh.

Nó tạo:

githubPayload
slackPayload
discordPayload
Nó làm gì khác nhau:

GitHub comment: dài hơn, đủ chi tiết cho reviewer.
Check run: ngắn hơn, thiên về trạng thái và summary.
Slack/Discord: gọn, đọc nhanh, dùng cho team chat.
Nếu bị hỏi “ai gửi?”, anh trả lời:
“Backend của hệ thống tự gửi sau khi agent xong, không phải người dùng bấm tay. Persona Composer chỉ chuẩn hóa nội dung, còn adapter sẽ gọi API GitHub hoặc webhook Slack/Discord.”

10. GitHub comment, Check run, Slack, Discord được gửi như nào

GitHub comment: hệ thống dùng GitHub adapter để upsert comment vào PR.
Check run: hệ thống tạo hoặc cập nhật check run trên commit head SHA.
Slack/Discord: hệ thống gửi payload sang webhook tương ứng của repo.
Tự động hay can thiệp?

Tự động.
Khi webhook PR vào, pipeline chạy xong là hệ thống publish.
Nếu repo đã bật Slack/Discord thì nó gửi vào đúng channel đã map.
Nếu chưa bật, nó vẫn có thể comment/check run trên GitHub và bỏ qua chat channels.
Một câu chốt dễ nhớ
“Planner quyết định hướng đi, Context bổ sung ngữ cảnh, Security tìm vùng nhạy cảm, Code Understanding giải thích thay đổi, Risk Reviewer đánh giá rủi ro, Testing Agent đề xuất test, Synthesis tạo brief, Critic chỉnh confidence, và Persona Composer đóng gói để gửi ra GitHub, Slack, Discord.”

Nguồn dữ liệu gốc

GitHub webhook payload: cho biết PR nào vừa xảy ra, event type là gì, repo nào, số PR nào, labels, reviewers, author, head SHA.
GitHub API: dùng để lấy diff/files thật của PR, PR body, comments, check runs, repository metadata.
Internal store: lưu repo memory, repo config, tracked repositories, Slack/Discord integrations, user PAT, và lịch sử phân tích.
Session/auth: cho biết user nào đang đăng nhập và user đó được xem repo nào.
Luồng data tổng quát

GitHub bắn webhook vào app.
App tạo snapshot của PR.
App fetch thêm files/diff từ GitHub.
App đọc thêm config và memory trong store.
Các agent dùng lại chính những dữ liệu đó, cộng thêm output của agent trước.
Cuối cùng hệ thống đóng gói ra GitHub comment, check run, Slack, Discord.
Từng agent lấy data từ đâu

AI không tự “biết” gì ngoài những gì được cấp từ webhook, GitHub API, và store.
Mỗi agent chỉ làm việc trên phần dữ liệu đã được cắt gọn theo vai trò của nó.