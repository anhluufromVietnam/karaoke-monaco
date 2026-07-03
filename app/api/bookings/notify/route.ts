import { NextResponse } from "next/server";
import { rtdb, admin } from "@/lib/firebaseAdmin";

export async function POST(request: Request) {
  try {
    const { bookingId, userId, status } = await request.json();
    const normalizedStatus = status === "pending"
      ? "Chờ xác nhận"
      : status === "Đang sử dụng"
        ? "Đang dùng"
        : status;

    if (!bookingId || !normalizedStatus) {
      return NextResponse.json({ message: "Thiếu thông tin" }, { status: 400 });
    }

    const bookingSnapshot = await rtdb.ref(`bookings/${bookingId}`).once("value");
    const bookingData = bookingSnapshot.exists() ? bookingSnapshot.val() : null;
    const targetUserId = bookingData?.userId || userId;

    const notificationConfig: Record<string, { title: string; description: string }> = {
      "Chờ xác nhận": {
        title: "Đơn hàng đang chờ xác nhận",
        description: `Đơn hàng #${bookingId.slice(-6)} của bạn đã được tạo và đang chờ Monaco xác nhận.`,
      },
      "Đã xác nhận": {
        title: "Đơn hàng đã được xác nhận",
        description: `Đơn hàng #${bookingId.slice(-6)} của bạn đã được xác nhận. Chúng tôi sẽ phục vụ bạn trong thời gian sớm nhất!`,
      },
      "Chờ đến": {
        title: "Đơn hàng đang chờ đến",
        description: `Đơn hàng #${bookingId.slice(-6)} đã được xác nhận và đang chờ đến giờ phục vụ.`,
      },
      "Đã đến": {
        title: "Khách đã đến",
        description: `Đơn hàng #${bookingId.slice(-6)} đã được ghi nhận là khách đã đến. Monaco sẽ sắp xếp dịch vụ ngay cho bạn.`,
      },
      "Đang dùng": {
        title: "Bắt đầu dịch vụ",
        description: `Phòng của bạn đã sẵn sàng. Chúc bạn có những phút giây thư giãn tuyệt vời tại Monaco!`,
      },
      "Chờ thanh toán": {
        title: "Đang chờ thanh toán",
        description: `Đơn hàng #${bookingId.slice(-6)} đang chờ thanh toán. Vui lòng hoàn tất quá trình thanh toán tại quầy.`,
      },
      "Đã hủy": {
        title: "Đơn hàng đã bị hủy",
        description: `Đơn hàng #${bookingId.slice(-6)} của bạn đã bị hủy. Nếu có thắc mắc vui lòng liên hệ hotline 084.680.7777.`,
      },
      "Đã thanh toán": {
        title: "Thanh toán hoàn tất",
        description: `Đơn hàng #${bookingId.slice(-6)} đã hoàn tất thanh toán. Cảm ơn và hẹn gặp lại quý khách!`,
      },
    };

    const config = notificationConfig[normalizedStatus];
    if (!config) {
      return NextResponse.json({ message: "Trạng thái không hợp lệ" }, { status: 400 });
    }

    if (targetUserId && targetUserId !== "guest") {
      const notificationRef = rtdb.ref(`notifications/personal/${targetUserId}`).push();
      await notificationRef.set({
        title: config.title,
        description: config.description,
        href: `/orders/${bookingId}`,
        type: "order",
        time: "Mới đây",
        createdAt: Date.now(),
        read: false,
      });
    }

    return NextResponse.json({ message: "Thông báo đã được gửi" }, { status: 200 });
  } catch (error: any) {
    console.error("Send notification error:", error);
    return NextResponse.json({ message: "Lỗi hệ thống", error: error.message }, { status: 500 });
  }
}
