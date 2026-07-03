import { NextResponse } from "next/server";
import { rtdb, admin } from "@/lib/firebaseAdmin";
import { calculateBookingPoints, updateUserPoints, sendPointsNotification, resolveUserKey } from "@/lib/points-utils";

export async function POST(request: Request) {
  try {
    const { bookingId, status } = await request.json();
    const normalizedStatus = status === "pending"
      ? "Chờ xác nhận"
      : status === "Đang sử dụng"
        ? "Đang dùng"
        : status;

    if (!bookingId || !normalizedStatus) {
      return NextResponse.json({ message: "Thiếu thông tin" }, { status: 400 });
    }

    // Kiểm tra booking tồn tại
    const bookingRef = rtdb.ref(`bookings/${bookingId}`);
    const bookingSnapshot = await bookingRef.once("value");

    if (!bookingSnapshot.exists()) {
      return NextResponse.json({ message: "Không tìm thấy đơn hàng" }, { status: 404 });
    }

    const bookingData = bookingSnapshot.val();

    const statusTimeField: Record<string, string> = {
      "Chờ xác nhận": "pendingAt",
      "Đã xác nhận": "confirmedAt",
      "Chờ đến": "waitingAt",
      "Đã đến": "arrivedAt",
      "Đang dùng": "startedAt",
      "Chờ thanh toán": "paymentPendingAt",
      "Đã thanh toán": "completedAt",
      "Đã hủy": "cancelledAt",
    };

    const updateData: Record<string, any> = { status: normalizedStatus };
    const timeField = statusTimeField[normalizedStatus];
    if (timeField) {
      updateData[timeField] = Date.now();
    }

    // Cập nhật status
    await bookingRef.update(updateData);

    // Nếu chuyển sang "Đã thanh toán" thì tính điểm và cập nhật cho user
    let pointsEarned = 0;
    if (normalizedStatus === "Đã thanh toán") {
      const { finalAmount, points } = calculateBookingPoints({ ...bookingData, ...updateData });
      pointsEarned = points;
      
      if (points > 0) {
        // Cập nhật booking với thông tin điểm
        await bookingRef.update({
          pointsEarned: points,
          finalAmount: finalAmount,
          paidAmount: finalAmount,
        });

        // Cập nhật điểm cho user
        const targetUserId = bookingData?.userId;
        if (targetUserId && targetUserId !== "guest") {
          const userKey = await resolveUserKey(targetUserId);
          await updateUserPoints(targetUserId, userKey, points, finalAmount, bookingId);
          await sendPointsNotification(targetUserId, points, bookingId);
        }
      }
    }

    // Luôn gửi cho chủ đơn hàng, không dùng uid của người thao tác.
    const targetUserId = bookingData?.userId;
    if (targetUserId && targetUserId !== "guest") {
      const notificationConfig: Record<string, { title: string; description: string }> = {
        "Chờ xác nhận": {
          title: "Đơn hàng đang chờ xác nhận",
          description: `Đơn hàng #${bookingId.slice(-6)} của bạn đã được tạo và đang chờ Monaco xác nhận.`,
        },
        "Đã xác nhận": {
          title: "✅ Đơn hàng đã được xác nhận",
          description: `Đơn hàng #${bookingId.slice(-6)} của bạn đã được xác nhận. Chúng tôi đang chuẩn bị dịch vụ cho bạn!`,
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
          title: "🎤 Bắt đầu dịch vụ",
          description: `Phòng của bạn đã sẵn sàng. Chúc bạn có những phút giây thư giãn tuyệt vời tại Monaco!`,
        },
        "Chờ thanh toán": {
          title: "Đang chờ thanh toán",
          description: `Đơn hàng #${bookingId.slice(-6)} đang chờ thanh toán. Vui lòng hoàn tất quá trình thanh toán tại quầy.`,
        },
        "Đã hủy": {
          title: "❌ Đơn hàng đã bị hủy",
          description: `Đơn hàng #${bookingId.slice(-6)} của bạn đã bị hủy. Nếu có thắc mắc vui lòng liên hệ hotline 084.680.7777.`,
        },
        "Đã thanh toán": {
          title: "💰 Thanh toán hoàn tất",
          description: `Đơn hàng #${bookingId.slice(-6)} đã hoàn tất thanh toán. Bạn nhận được ${pointsEarned > 0 ? `${pointsEarned} điểm` : ''}. Cảm ơn và hẹn gặp lại quý khách!`,
        },
      };

      const config = notificationConfig[normalizedStatus];
      if (config) {
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
    }

    return NextResponse.json({ 
      message: "Cập nhật trạng thái thành công", 
      status: normalizedStatus
    }, { status: 200 });
  } catch (error: any) {
    console.error("Update booking status error:", error);
    return NextResponse.json({ message: "Lỗi hệ thống", error: error.message }, { status: 500 });
  }
}
