import { Building2, FileSignature, Home, KeyRound, Receipt, Search, ShieldCheck, Users } from 'lucide-react';
import { ButtonLink, MockBadge, PageHeader, Section } from '@/components/ui';

/** PUB-06 */
export function AboutPage() {
  return (
    <div className="container" style={{ paddingTop: 'var(--space-8)' }}>
      <PageHeader
        title="Về Rental Platform"
        description="Một nền tảng – hai sản phẩm: Marketplace tìm phòng xác thực và SaaS quản lý nhà trọ cho chủ nhà."
      />
      <div className="grid grid--2">
        <Section title="Dành cho người tìm phòng">
          <ul className="list-plain stack" style={{ gap: 'var(--space-3)' }}>
            {[
              { icon: Search, text: 'Tìm phòng theo khu vực, giá, diện tích, tiện ích; xem bản đồ.' },
              { icon: ShieldCheck, text: 'Tin đăng được kiểm duyệt, ưu tiên phòng đã xác thực.' },
              { icon: KeyRound, text: 'Đặt lịch xem phòng trực tuyến, theo dõi trạng thái xác nhận.' },
              { icon: Receipt, text: 'Sau khi thuê: xem hợp đồng, hóa đơn và gửi minh chứng thanh toán trên Cổng người thuê.' },
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
              { icon: Building2, text: 'Quản lý nhiều tòa nhà, phòng; tách trạng thái vận hành và trạng thái đăng tin.' },
              { icon: Users, text: 'Quản lý người thuê, phương tiện, thành viên & phân quyền theo workspace.' },
              { icon: FileSignature, text: 'Hợp đồng có thời hạn rõ ràng, cảnh báo trùng lịch, lịch sử thay đổi.' },
              { icon: Receipt, text: 'Bảng giá theo phiên bản, ghi điện nước, lập hóa đơn tháng, xác nhận thanh toán một phần, theo dõi cọc riêng.' },
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
          <p className="cta-band__eyebrow">Bắt đầu ngay</p>
          <h2>Trải nghiệm bản demo với tài khoản mẫu</h2>
          <p>Toàn bộ dữ liệu là giả lập — không có giao dịch hay thông báo thật nào được gửi.</p>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <ButtonLink to="/rooms" variant="primary" size="lg">
            <Home size={18} aria-hidden="true" /> Tìm phòng
          </ButtonLink>
          <ButtonLink to="/login" variant="secondary" size="lg">
            Đăng nhập demo
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

const FAQ = [
  { q: 'Đặt lịch xem phòng có mất phí không?', a: 'Hoàn toàn miễn phí. Sau khi gửi yêu cầu, lịch ở trạng thái “Chờ xác nhận” cho tới khi chủ trọ xác nhận.' },
  { q: 'Tôi có thể hủy lịch xem không?', a: 'Có. Vào “Lịch xem phòng” và bấm Hủy với các lịch đang Chờ xác nhận hoặc Đã xác nhận.' },
  { q: 'Làm sao để xem hóa đơn hằng tháng?', a: 'Chủ trọ tạo hồ sơ thuê cho bạn. Bạn vào “Liên kết hồ sơ thuê”, nhập mã mời + mã hợp đồng + mã xác minh. Sau khi chủ trọ duyệt, Cổng người thuê sẽ hiển thị hợp đồng và hóa đơn.' },
  { q: 'Vì sao tài khoản không tự liên kết theo số điện thoại?', a: 'Để bảo vệ dữ liệu người thuê, việc liên kết luôn cần xác minh và chủ trọ duyệt — không tự động dựa trên trùng số điện thoại.' },
  { q: 'Thanh toán đã gửi khi nào được tính là đã trả?', a: 'Chỉ khi chủ trọ xác nhận đã nhận tiền. Trước đó khoản thanh toán ở trạng thái “Chờ xác nhận”.' },
  { q: 'Tiền cọc có được tính vào hóa đơn tháng không?', a: 'Không. Tiền cọc được theo dõi riêng (thu / hoàn / khấu trừ) và không gộp vào doanh thu tiền thuê.' },
];

/** PUB-07 */
export function HelpPage() {
  return (
    <div className="container" style={{ paddingTop: 'var(--space-8)', maxWidth: 880 }}>
      <PageHeader title="Trợ giúp" description="Câu hỏi thường gặp, hướng dẫn sử dụng và kênh liên hệ." />
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
      <Section title="Cẩm nang thuê phòng an toàn">
        <ul id="safety" className="stack text-sm" style={{ gap: 'var(--space-2)', paddingLeft: 'var(--space-5)', margin: 0 }}>
          <li>Không chuyển tiền cọc trước khi xem phòng trực tiếp và ký hợp đồng.</li>
          <li>Đọc kỹ thời hạn hợp đồng (ngày bắt đầu – ngày kết thúc), điều khoản hoàn cọc.</li>
          <li>Chụp ảnh chỉ số điện nước ngày nhận phòng.</li>
          <li>Chỉ thanh toán vào tài khoản ghi trên hóa đơn trong Cổng người thuê.</li>
        </ul>
      </Section>
      <div style={{ height: 'var(--space-4)' }} />
      <Section title="Liên hệ hỗ trợ" actions={<MockBadge>Kênh liên hệ chưa vận hành</MockBadge>}>
        <p className="text-sm muted">
          Hotline, email và chat trực tuyến sẽ được công bố khi hệ thống vận hành chính thức. Trong bản demo, vui lòng liên hệ nhóm phát triển.
        </p>
      </Section>
    </div>
  );
}
