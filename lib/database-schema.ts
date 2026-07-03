import { rtdb, admin } from "./firebaseAdmin";

/**
 * Cấu trúc chính cho Monaco Karaoke sử dụng Realtime Database
 * 
 * Cấu trúc dữ liệu:
 * 
 * facilities/
 *   └── $facilityId/
 *       ├── name: "Karaoke 999"
 *       ├── type: "karaoke" | "massage" | "restaurant"
 *       ├── createdAt: timestamp
 *       └── rooms/
 *           ├── $roomId/
 *               ├── name: "Phòng VIP 1"
 *               ├── type: "karaoke" | "massage" | "restaurant"
 *               ├── category: "VIP" | "Thường"
 *               ├── capacity: 10
 *               ├── price: 688000
 *               ├── priceNote: "đ/giờ"
 *               ├── image: "/images/vip1.jpg"
 *               ├── description: "..."
 *               └── status: "available" | "occupied" | "maintenance"
 */

export interface User {
  authUid?: string;
  username?: string;
  name?: string;
  email?: string;
  phoneNumber?: string;
  points: number;
  createdAt: number;
  birthday?: string;
  role?: 'admin' | 'receptionist' | 'customer';
  password?: string;
}

export type BookingStatus = 'Chờ xác nhận' | 'Đã xác nhận' | 'Chờ đến' | 'Đã đến' | 'Đang dùng' | 'Chờ thanh toán' | 'Đã thanh toán' | 'Đã hủy';

export interface Booking {
  userId: string;
  type: "karaoke" | "massage" | "restaurant";
  facilityId?: string;
  facilityName?: string;
  roomId?: string;
  roomName?: string;
  items?: any[];
  services?: any[];
  note?: string;
  bookingDate: string;
  bookingTime: string;
  totalAmount: number;      // Tổng tiền gốc (roomPrice + services)
  roomPrice?: number;        // Tiền phòng (lễ tân nhập)
  finalAmount?: number;      // Tổng thanh toán cuối cùng (sau giảm giá)
  paidAmount?: number;       // Số tiền khách đã thanh toán thực tế
  pointsEarned?: number;     // Số điểm tích lũy từ đơn hàng này (để đồng bộ)
  pendingAt?: number;
  confirmedAt?: number;
  waitingAt?: number;
  arrivedAt?: number;
  startedAt?: number;
  paymentPendingAt?: number;
  completedAt?: number;      // Thời điểm thanh toán
  cancelledAt?: number;
  guestCount?: number;
  guests?: string;
  appliedVoucher?: {
    code: string;
    title?: string;
    discountAmount?: number | null;
    discountRate?: number | null;
  };
  appliedRewardId?: string | null;
  status: BookingStatus;
  createdAt: number;
}

export interface News {
  title: string;
  subtitle?: string;
  content: string;
  startDate: string;
  endDate: string;
  imageUrl: string;
  isActive: boolean;
  rules?: string[];
}

export interface PointExchange {
  exchangeTime: number;
  pointsUsed: number;
  userId: string;
  status: "pending" | "completed" | "cancelled";
  description: string;
  bookingId?: string;
}

export interface PointHistoryEntry {
  type: "earn" | "spend";
  points: number;
  timestamp: number;
  description: string;
  bookingId?: string;
  voucherCode?: string;
}

export interface RoomItem {
  name: string;
  type: "karaoke" | "massage" | "restaurant";
  category: string;
  capacity: number;
  price: number;
  priceNote: string;
  image: string;
  description: string;
  status: "available" | "occupied" | "maintenance";
}

export interface Facility {
  name: string;
  type: "karaoke" | "massage" | "restaurant";
  createdAt: number;
  rooms: Record<string, RoomItem>;
}

export const initializeCollections = async () => {
  const now = Date.now();

  await rtdb.ref("settings").set({
    hotline: "084.680.7777",
    min_points_to_redeem: 100,
    app_version: "1.0.0",
    maintenance: false,
    defaultLanguage: "vi",
  });

  // Cấu trúc cơ sở mới: mỗi facility chứa rooms bên trong
  const facilities: Record<string, Facility> = {
    "facility-karaoke-1": {
      name: "Karaoke Monaco",
      type: "karaoke",
      createdAt: now,
      rooms: {
        "room-karaoke-vip-1": {
          name: "Phòng Karaoke VIP 1",
          type: "karaoke",
          category: "VIP",
          capacity: 20,
          price: 688000,
          priceNote: "đ/giờ",
          image: "/images/vip1.jpg",
          description: "Hệ thống phòng Karaoke đẳng cấp với dàn âm thanh hiện đại, ánh sáng sân khấu chuyên nghiệp, phù hợp cho các buổi tiệc và sự kiện.",
          status: "available",
        },
        "room-karaoke-vip-2": {
          name: "Phòng Karaoke VIP 2",
          type: "karaoke",
          category: "VIP",
          capacity: 15,
          price: 588000,
          priceNote: "đ/giờ",
          image: "/images/vip1.jpg",
          description: "Phòng VIP hạng sang với không gian riêng tư.",
          status: "available",
        },
        "room-karaoke-thuong-1": {
          name: "Phòng Karaoke Thường 1",
          type: "karaoke",
          category: "Thường",
          capacity: 10,
          price: 388000,
          priceNote: "đ/giờ",
          image: "/images/phothong1.jpg",
          description: "Phòng hát tiêu chuẩn với chất lượng âm thanh tốt.",
          status: "available",
        },
        "room-karaoke-thuong-2": {
          name: "Phòng Karaoke Thường 2",
          type: "karaoke",
          category: "Thường",
          capacity: 8,
          price: 338000,
          priceNote: "đ/giờ",
          image: "/images/phothong1.jpg",
          description: "Phòng hát ấm cúng cho nhóm bạn.",
          status: "available",
        },
      },
    },
    "facility-massage-1": {
      name: "Massage Monaco",
      type: "massage",
      createdAt: now,
      rooms: {
        "room-massage-vip-1": {
          name: "Phòng Massage VIP 1",
          type: "massage",
          category: "VIP",
          capacity: 1,
          price: 800000,
          priceNote: "đ/lượt",
          image: "/images/monaco1.jpg",
          description: "Dịch vụ Massage trị liệu cao cấp với đội ngũ nhân viên chuyên nghiệp.",
          status: "available",
        },
        "room-massage-vip-2": {
          name: "Phòng Massage VIP 2",
          type: "massage",
          category: "VIP",
          capacity: 2,
          price: 1200000,
          priceNote: "đ/lượt",
          image: "/images/monaco1.jpg",
          description: "Phòng massage đôi với không gian thư giãn.",
          status: "available",
        },
      },
    },
    "facility-restaurant-1": {
      name: "Nhà hàng Monaco",
      type: "restaurant",
      createdAt: now,
      rooms: {
        "table-restaurant-vip-1": {
          name: "Bàn VIP 1",
          type: "restaurant",
          category: "VIP",
          capacity: 12,
          price: 1000000,
          priceNote: "đ/bàn",
          image: "/images/bg-intro.jpg",
          description: "Bàn VIP sang trọng cho thực khách.",
          status: "available",
        },
        "table-restaurant-vip-2": {
          name: "Bàn VIP 2",
          type: "restaurant",
          category: "VIP",
          capacity: 10,
          price: 800000,
          priceNote: "đ/bàn",
          image: "/images/bg-intro.jpg",
          description: "Không gian ẩm thực đẳng cấp.",
          status: "available",
        },
        "table-restaurant-thuong-1": {
          name: "Bàn Thường 1",
          type: "restaurant",
          category: "Thường",
          capacity: 6,
          price: 500000,
          priceNote: "đ/bàn",
          image: "/images/phothong1.jpg",
          description: "Bàn ăn gia đình ấm cúng.",
          status: "available",
        },
        "table-restaurant-thuong-2": {
          name: "Bàn Thường 2",
          type: "restaurant",
          category: "Thường",
          capacity: 4,
          price: 300000,
          priceNote: "đ/bàn",
          image: "/images/phothong1.jpg",
          description: "Bàn ăn nhỏ gọn cho nhóm bạn.",
          status: "available",
        },
      },
    },
  };

  // Lưu facilities vào Realtime Database (ghi đè lên rooms cũ)
  await rtdb.ref("facilities").set(facilities);

  // Vẫn giữ rooms cũ để tương thích ngược, nhưng chỉ là dữ liệu phòng gộp từ facilities
  const roomsMap: Record<string, any> = {};
  Object.values(facilities).forEach((facility) => {
    Object.entries(facility.rooms).forEach(([roomId, room]) => {
      roomsMap[roomId] = {
        ...room,
        facilityId: facility.name,
      };
    });
  });
  await rtdb.ref("rooms").set(roomsMap);

  // Khuyến mãi phù hợp với Monaco Karaoke
  const news = [
    {
      id: "karaoke-gold-hour",
      title: "Giờ Vàng Karaoke",
      subtitle: "Giảm 30% khung giờ 14h-17h",
      content: "Tận hưởng không gian âm nhạc đẳng cấp với mức giá ưu đãi nhất trong ngày. Áp dụng cho tất cả các phòng Karaoke VIP.",
      startDate: new Date(now - 86400000 * 7).toISOString(),
      endDate: new Date(now + 86400000 * 7).toISOString(),
      imageUrl: "/images/vip1.jpg",
      isActive: true,
      featured: true,
      rules: [
        "Áp dụng cho tất cả các phòng Karaoke từ thứ 2 đến thứ 6.",
        "Giảm trực tiếp 30% trên giá phòng theo giờ.",
        "Không áp dụng đồng thời với các ưu đãi khác.",
        "Giờ áp dụng: 14:00 - 17:00 hàng ngày.",
      ],
    },
    {
      id: "massage-relax-combo",
      title: "Massage Thư Giãn",
      subtitle: "Combo 2 buổi - Giảm 25%",
      content: "Trải nghiệm liệu trình massage chuyên sâu kết hợp xông hơi đá muối. Đặt ngay hôm nay để nhận ưu đãi đặc biệt dành riêng cho thành viên.",
      startDate: new Date(now - 86400000 * 3).toISOString(),
      endDate: new Date(now + 86400000 * 10).toISOString(),
      imageUrl: "/images/monaco1.jpg",
      isActive: true,
      featured: true,
      rules: [
        "Combo bao gồm: Massage 60 phút + xông hơi đá muối.",
        "Giảm 25% khi mua combo 2 buổi.",
        "Có thể sử dụng trong vòng 30 ngày kể từ ngày mua.",
        "Vui lòng đặt lịch trước ít nhất 2 tiếng.",
      ],
    },
    {
      id: "restaurant-wine-promo",
      title: "Ẩm Thực Monaco",
      subtitle: "Tặng 1 chai rượu vang nhập khẩu",
      content: "Dùng bữa tối sang trọng tại nhà hàng Monaco. Đặt bàn ngay hôm nay để nhận ưu đãi đặc biệt dành cho thực khách.",
      startDate: new Date(now - 86400000 * 2).toISOString(),
      endDate: new Date(now + 86400000 * 30).toISOString(),
      imageUrl: "/images/bg-intro.jpg",
      isActive: true,
      featured: true,
      rules: [
        "Áp dụng cho hóa đơn từ 1,500,000đ trở lên.",
        "Tặng 1 chai rượu vang đỏ Chile nhập khẩu.",
        "Mỗi bàn chỉ áp dụng một lần.",
        "Không áp dụng đồng thời với các chương trình khác.",
      ],
    },
    {
      id: "vip-membership",
      title: "Hội Viên VIP",
      subtitle: "Tích lũy điểm x2 cho lần đầu",
      content: "Đăng ký hội viên Monaco ngay hôm nay, nhân đôi điểm tích lũy cho lần đặt dịch vụ đầu tiên. Cơ hội nâng hạng thành viên nhanh chóng.",
      startDate: new Date(now - 86400000).toISOString(),
      endDate: new Date(now + 86400000 * 45).toISOString(),
      imageUrl: "/images/monaco2.jpg",
      isActive: true,
      featured: false,
      rules: [
        "Dành cho thành viên đăng ký mới và đặt lịch lần đầu.",
        "Điểm nhân đôi sẽ được cộng sau khi hoàn thành đơn hàng.",
        "Áp dụng cho tất cả dịch vụ: Karaoke, Massage, Nhà hàng.",
        "Điểm thưởng có hạn sử dụng 12 tháng.",
      ],
    },
    {
      id: "birthday-party",
      title: "Sinh Nhật Hoàn Hảo",
      subtitle: "Giảm 20% tiệc sinh nhật",
      content: "Tổ chức sinh nhật tại Monaco với combo trọn gói: trang trí phòng, bánh kem, hoa quả và DJ sôi động. Giá chỉ từ 2,000,000đ cho nhóm 10 người.",
      startDate: new Date(now).toISOString(),
      endDate: new Date(now + 86400000 * 60).toISOString(),
      imageUrl: "/images/phothong1.jpg",
      isActive: true,
      featured: false,
      rules: [
        "Áp dụng cho gói tiệc sinh nhật trọn gói từ 10 người.",
        "Bao gồm: phòng, trang trí, bánh kem, hoa quả.",
        "Giảm thêm 10% khi đặt trước 7 ngày.",
        "Vui lòng liên hệ hotline để đặt tiệc.",
      ],
    },
  ];

  news.forEach((item) => {
    rtdb.ref(`news/${item.id}`).set(item);
  });

  await rtdb.ref("notifications/global").set({
    "welcome": {
      title: "Chào mừng đến với Monaco",
      description: "Cảm ơn bạn đã tham gia Monaco! Hãy khám phá các dịch vụ Karaoke, Massage và Nhà hàng đẳng cấp của chúng tôi. Đặt lịch ngay để nhận ưu đãi đặc biệt dành cho thành viên mới!",
      href: "/home",
      type: "system",
      time: "Mới đây",
      createdAt: now - 1000 * 60 * 60 * 24,
    },
    "promo-grand-opening": {
      title: "🎉 Ưu đãi đặc biệt",
      description: "Giảm ngay 30% cho dịch vụ Karaoke vào cuối tuần. Giảm thêm 10% cho hóa đơn đồ uống khi đặt phòng trước. Nhanh tay đặt lịch ngay hôm nay!",
      href: "/promotions/karaoke-gold-hour",
      type: "promotion",
      time: "2 giờ trước",
      createdAt: now - 1000 * 60 * 60 * 2,
    },
  });

  console.log("Realtime Database seeded successfully!");
};
