import { Building2, CalendarCheck, FileSignature, Home, KeyRound, MapPin, Receipt, Search, Users, Wrench } from 'lucide-react';
import { ButtonLink, MockBadge, PageHeader, Section } from '@/components/ui';

/** PUB-06 — chỉ mô tả những gì V1 thực sự làm. */
export function AboutPage() {
  return (
    <div className="container" style={{ paddingTop: 'var(--space-8)' }}>
      <PageHeader
        title="Về Rental Platform"
        description="Một nền tảng – hai việc: tìm phòng trọ do chủ trọ đăng công khai, và phần mềm giúp chủ trọ quản lý việc cho thuê."
      />
      <div className="grid grid--2">
        <Section title="Dành cho người tìm phòng">
          <ul className="list-plain stack" style={{ gap: 'var(--space-3)' }}>
            {[
              { icon: Search, text: 'Tìm phòng theo thành phố, quận/huyện, phường và khoảng giá.' },
              { icon: MapPin, text: 'Xem địa chỉ phòng và mở Google Maps để xem vị trí, chỉ đường từ nơi bạn chọn.' },
              { icon: CalendarCheck, text: 'Đặt lịch xem phòng, theo dõi chờ xác nhận / đã xác nhận / bị từ chối, và hủy khi cần.' },
              { icon: KeyRound, text: 'Sau khi thuê: nhập mã mời do chủ trọ gửi để liên kết tài khoản, rồi xem hợp đồng, hóa đơn, lịch sử thanh toán và tiền cọc.' },
              { icon: Wrench, text: 'Gửi yêu cầu bảo trì cho phòng đang thuê và theo dõi tiến độ xử lý.' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="row" style={{ alignItems: 'flex-start' }}>
                <Icon size={18} color="var(--color-primary)" aria-hidden="true" /> <span>{text}</span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Dành cho chủ trọ">
          <ul className="list-plain stack" style={{ gap: 'var(--space-3)' }}>
            {[
              { icon: Building2, text: 'Gửi đơn đăng ký chủ trọ; khi được duyệt, tạo workspace đầu tiên để quản lý tòa nhà và phòng.' },
              { icon: Home, text: 'Đăng hoặc gỡ tin cho từng phòng; trạng thái đăng tin tách khỏi trạng thái vận hành của phòng.' },
              { icon: Users, text: 'Tạo hồ sơ người thuê và hợp đồng có ngày bắt đầu, ngày kết thúc; gửi mã mời để người thuê liên kết tài khoản. Trong V1 chỉ chủ trọ (OWNER) vận hành workspace.' },
              { icon: FileSignature, text: 'Ghi chỉ số điện nước, lập và phát hành hóa đơn, điều chỉnh bằng bút toán, ghi nhận thanh toán và tiền cọc.' },
              { icon: Receipt, text: 'Xử lý yêu cầu xem phòng, yêu cầu bảo trì và xem tổng quan tình hình.' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="row" style={{ alignItems: 'flex-start' }}>
                <Icon size={18} color="var(--color-primary)" aria-hidden="true" /> <span>{text}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
      <div className="cta-band">
        <div>
          <p className="cta-band__eyebrow">Bắt đầu</p>
          <h2>Tìm phòng hoặc đăng nhập</h2>
          <p>Hệ thống chưa có thanh toán trực tuyến: tiền thuê và tiền cọc được trao đổi ngoài hệ thống và do chủ trọ ghi nhận.</p>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <ButtonLink to="/rooms" variant="primary" size="lg">
            <Home size={18} aria-hidden="true" /> Tìm phòng
          </ButtonLink>
          <ButtonLink to="/login" variant="secondary" size="lg">
            Đăng nhập
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

const FAQ = [
  { q: 'Đặt lịch xem phòng hoạt động thế nào?', a: 'Bạn chọn giờ hẹn và có thể kèm lời nhắn. Lịch ở trạng thái “Chờ xác nhận” cho tới khi chủ trọ xác nhận hoặc từ chối (kèm ghi chú nếu có).' },
  { q: 'Tôi có thể hủy lịch xem không?', a: 'Có. Vào “Lịch xem của tôi” và bấm Hủy với các lịch đang Chờ xác nhận hoặc Đã xác nhận.' },
  { q: 'Làm sao để xem hợp đồng và hóa đơn hằng tháng?', a: 'Chủ trọ tạo hồ sơ thuê cho bạn rồi gửi một mã mời (43 ký tự, dùng một lần, có thời hạn). Bạn vào “Liên kết tài khoản”, nhập mã. Sau đó Cổng người thuê hiển thị hợp đồng, hóa đơn, lịch sử thanh toán và tiền cọc của hồ sơ đó.' },
  { q: 'Vì sao tài khoản không tự liên kết theo số điện thoại?', a: 'Để bảo vệ dữ liệu người thuê, việc liên kết chỉ thực hiện bằng mã mời do chủ trọ cung cấp, không dựa trên trùng số điện thoại hay email.' },
  { q: 'Tôi có thanh toán hóa đơn trực tuyến được không?', a: 'Chưa. Hệ thống không có cổng thanh toán hay gửi minh chứng. Bạn thanh toán trực tiếp cho chủ trọ; khoản thu chỉ được tính khi chủ trọ ghi nhận vào sổ thanh toán của hóa đơn.' },
  { q: 'Tiền cọc có được tính vào hóa đơn tháng không?', a: 'Không. Tiền cọc có sổ riêng theo hợp đồng (thu / khấu trừ / hoàn) và không gộp vào hóa đơn tiền thuê.' },
  { q: 'Tôi có thể gửi yêu cầu sửa chữa ở đâu?', a: 'Trong Cổng người thuê, mục Bảo trì, cho hợp đồng đang hiệu lực. Bạn chỉ hủy được yêu cầu khi chủ trọ chưa tiếp nhận xử lý.' },
];

/** PUB-07 */
export function HelpPage() {
  return (
    <div className="container" style={{ paddingTop: 'var(--space-8)', maxWidth: 880 }}>
      <PageHeader title="Trợ giúp" description="Câu hỏi thường gặp, lưu ý khi thuê phòng và kênh liên hệ." />
      <Section title="Câu hỏi thường gặp">
        <div className="faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </Section>
      <div style={{ height: 'var(--space-4)' }} />
      <Section title="Lưu ý khi thuê phòng">
        <ul id="safety" className="stack text-sm" style={{ gap: 'var(--space-2)', paddingLeft: 'var(--space-5)', margin: 0 }}>
          <li>Xem phòng trực tiếp trước khi đặt cọc hoặc chuyển tiền cho bất kỳ ai.</li>
          <li>Đọc kỹ thời hạn hợp đồng (ngày bắt đầu – ngày kết thúc) và điều khoản hoàn cọc.</li>
          <li>Chụp ảnh hiện trạng phòng và chỉ số điện nước ngày nhận phòng.</li>
          <li>Rental Platform là công cụ kết nối và quản lý; hệ thống không xác minh pháp lý của tin đăng và không giữ hay bảo đảm tiền cọc.</li>
        </ul>
      </Section>
      <div style={{ height: 'var(--space-4)' }} />
      <Section title="Liên hệ hỗ trợ" actions={<MockBadge>Kênh liên hệ chưa vận hành</MockBadge>}>
        <p className="text-sm muted">Hotline, email và chat trực tuyến sẽ được công bố khi hệ thống vận hành chính thức.</p>
      </Section>
    </div>
  );
}
