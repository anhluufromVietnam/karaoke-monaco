import { NextResponse } from "next/server";
import { rtdb, admin } from "@/lib/firebaseAdmin";

export async function POST(request: Request) {
  try {
    const { bookingId } = await request.json();

    if (!bookingId) {
      return NextResponse.json({ message: "Thiếu mã đơn hàng" }, { status: 400 });
    }

    const bookingRef = rtdb.ref(`bookings/${bookingId}`);
    const bookingSnapshot = await bookingRef.once("value");

    if (!bookingSnapshot.exists()) {
      return NextResponse.json({ message: "Không tìm thấy đơn hàng" }, { status: 404 });
    }

    const bookingData = bookingSnapshot.val();
    
    // Chỉ chặn nếu đơn đã "Đã thanh toán" VÀ đã có điểm tích lũy. 
    // Nếu chưa có điểm (bị sót), vẫn cho phép chạy tiếp để bù điểm.
    if ((bookingData?.status === "Đã thanh toán" || bookingData?.status === "completed") && bookingData?.pointsEarned !== undefined) {
      return NextResponse.json({ message: "Đơn hàng đã được hoàn thành trước đó" }, { status: 400 });
    }

    const userId = bookingData?.userId;
    
    // Sử dụng logic tính điểm đồng nhất với Admin: Ưu tiên giá trị lớn nhất từ các nguồn tiền
    const roomPrice = Number(bookingData.totalEst || bookingData.roomPrice || 0);
    const services = bookingData.services || bookingData.items || [];
    const servicesTotal = services.reduce((sum: number, s: any) => sum + (s.price * (s.quantity || s.qty || 1)), 0);
    const totalAmount = Number(bookingData.totalAmount || 0);
    const paidAmount = Number(bookingData.paidAmount || 0);
    const subtotal = Math.max(totalAmount, roomPrice + servicesTotal, paidAmount);
    
    let voucherDiscount = 0;
    if (bookingData.appliedVoucher) {
      if (bookingData.appliedVoucher.discountAmount) {
        voucherDiscount = Math.min(bookingData.appliedVoucher.discountAmount, subtotal);
      } else if (bookingData.appliedVoucher.discountRate) {
        voucherDiscount = Math.floor(subtotal * bookingData.appliedVoucher.discountRate);
      }
    }
    
    const rewardDiscount = Number(bookingData.appliedRewardDiscount || 0);
    const finalAmount = Math.max(0, subtotal - voucherDiscount - rewardDiscount);
    
    const pointsToAdd = Math.floor(finalAmount / 10000);

    // Use "Đã thanh toán" status for consistency with admin API and frontend display
    await bookingRef.update({ 
      status: "Đã thanh toán",
      pointsEarned: pointsToAdd,
      finalAmount: finalAmount,
      paidAmount: finalAmount,
      completedAt: Date.now(),
    });

    if (userId && userId !== "guest") {
      // Lấy username (userKey) từ uidMap hoặc tìm trong profiles
      const uidMapSnapshot = await rtdb.ref(`users/uidMap/${userId}`).once("value");
      let userKey = uidMapSnapshot.exists() ? uidMapSnapshot.val() : null;

      if (!userKey) {
        // Fallback: Nếu uidMap không có, tìm trong profiles dựa trên authUid
        const profilesSnapshot = await rtdb.ref("users/profiles").once("value");
        const profiles = profilesSnapshot.exists() ? profilesSnapshot.val() : {};
        const profileByAuthUid = Object.entries(profiles).find(([, prof]: [string, any]) => prof.authUid === userId);
        userKey = profileByAuthUid ? profileByAuthUid[0] : userId; // Nếu vẫn không tìm thấy, dùng userId làm key (ít lý tưởng)
      }

      const userPointsRef = rtdb.ref(`users/profiles/${userKey}/points`)
      await userPointsRef.transaction((currentPoints: number | null) => {
        return (currentPoints || 0) + pointsToAdd
      })

      // Cập nhật lifetimeSpent (tổng chi tiêu tích lũy) để xếp hạng
      const lifetimeRef = rtdb.ref(`users/profiles/${userKey}/lifetimeSpent`)
      await lifetimeRef.transaction((current: number | null) => {
        return (current || 0) + finalAmount
      })

      if (pointsToAdd > 0) {
        console.log(`[Client Complete Booking] Writing point history for userKey: ${userKey} at path: users/profiles/${userKey}/pointHistory`);
        const pointHistoryRef = rtdb.ref(`users/profiles/${userKey}/pointHistory`).push()
        await pointHistoryRef.set({
          type: "earn",
          bookingId,
          points: pointsToAdd,
          timestamp: Date.now(),
          description: `Tích điểm từ đơn hàng #${bookingId} (${new Intl.NumberFormat("vi-VN").format(finalAmount)}đ)`,
        })
      }

      const notificationRef = rtdb.ref(`notifications/personal/${userId}`).push()
      await notificationRef.set({
        title: "Đơn hàng đã hoàn thành",
        description: `Đơn hàng #${bookingId} đã được hoàn thành. Bạn nhận được ${pointsToAdd} điểm.`,
        href: `/orders/${bookingId}`,
        type: "order", // Consistent with admin API
        time: "Mới đây",
        createdAt: Date.now(),
        read: false,
      })

      const pointsNotificationRef = rtdb.ref(`notifications/personal/${userId}`).push()
      await pointsNotificationRef.set({
        title: "Bạn đã được cộng điểm",
        description: `Bạn vừa nhận ${pointsToAdd} điểm mới từ đơn hàng #${bookingId}.`,
        href: "/wallet", // Consistent with admin API
        type: "system",
        time: "Mới đây",
        createdAt: Date.now(),
        read: false,
      })
    } else {
      console.log(`[Complete Booking] Skipping point update: userId is guest or not provided (${userId}) for booking ${bookingId})`);
    }

    return NextResponse.json({ message: "Hoàn thành đơn và tích điểm thành công", pointsAdded: pointsToAdd }, { status: 200 });
  } catch (error: any) {
    console.error("Complete Booking Error:", error);
    return NextResponse.json({ message: "Lỗi hệ thống", error: error.message }, { status: 500 });
  }
}
