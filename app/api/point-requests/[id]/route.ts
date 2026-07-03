import { NextResponse } from "next/server";
import { rtdb, admin } from "@/lib/firebaseAdmin";

async function sendPointExchangeNotification(
  userId: string | undefined,
  title: string,
  description: string,
  href = "/wallet/point-exchange"
) {
  if (!userId || userId === "guest") return;

  const userNotifRef = rtdb.ref(`notifications/personal/${userId}`).push();
  await userNotifRef.set({
    title,
    description,
    href,
    type: "system",
    time: "Mới đây",
    createdAt: Date.now(),
    read: false,
  });
}

/**
 * API để admin duyệt/từ chối yêu cầu đổi điểm
 * Khi duyệt: thêm thưởng vào rewardVault của user
 */

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { status } = body;

    if (!id || !status) {
      return NextResponse.json({ message: "Thiếu thông tin" }, { status: 400 });
    }

    if (!["approved", "rejected"].includes(status)) {
      return NextResponse.json({ message: "Trạng thái không hợp lệ" }, { status: 400 });
    }

    // Lấy thông tin yêu cầu
    const requestSnapshot = await rtdb.ref(`pointRequests/${id}`).once("value");
    if (!requestSnapshot.exists()) {
      return NextResponse.json({ message: "Không tìm thấy yêu cầu" }, { status: 404 });
    }

    const requestData = requestSnapshot.val();
    const requestUserId = requestData.userId;

    if (requestData.status === "approved" && status === "approved") {
      return NextResponse.json({ message: "Yêu cầu này đã được duyệt trước đó" }, { status: 400 });
    }

    // Nếu duyệt, thêm thưởng vào rewardVault
    if (status === "approved") {
      if (!requestUserId || requestUserId === "guest") {
        return NextResponse.json({ message: "Không thể duyệt đổi điểm cho khách vãng lai" }, { status: 400 });
      }

      // Lấy userKey từ uidMap
      const uidSnapshot = await rtdb.ref(`users/uidMap/${requestUserId}`).once("value");
      if (!uidSnapshot.exists()) {
        return NextResponse.json({ message: "Không tìm thấy người dùng" }, { status: 404 });
      }
      const userKey = uidSnapshot.val();

      // Lấy thông tin thưởng từ danh sách có sẵn
      const rewardTitle = requestData.reward;
      const rewardPointsCost = Number(requestData.pointsCost || 0);
      const rewardDescription = requestData.description || `Đổi ${rewardTitle}`;

      if (rewardPointsCost <= 0) {
        return NextResponse.json({ message: "Số điểm đổi không hợp lệ" }, { status: 400 });
      }

      // Tìm thông tin chi tiết thưởng từ danh sách mặc định
      const availableRewards = [
        { id: "voucher-freedrink", title: "Miễn phí 1 nước", description: "Tặng 1 nước giải khát bất kỳ", discountAmount: 50000, minTotal: 0, serviceType: "all" },
        { id: "voucher-massage50k", title: "Giảm 50k Massage", description: "Giảm 50,000đ cho dịch vụ Massage từ 500,000đ", discountAmount: 50000, minTotal: 500000, serviceType: "massage" },
        { id: "voucher-giam50k", title: "Giảm 50,000đ", description: "Giảm 50,000đ cho hóa đơn từ 800,000đ", discountAmount: 50000, minTotal: 800000, serviceType: "all" },
        { id: "voucher-karaoke100k", title: "Giảm 100k Karaoke", description: "Giảm 100,000đ cho Karaoke từ 1,000,000đ", discountAmount: 100000, minTotal: 1000000, serviceType: "karaoke" },
        { id: "voucher-giam100k", title: "Giảm 100,000đ", description: "Giảm 100,000đ cho hóa đơn từ 1,500,000đ", discountAmount: 100000, minTotal: 1500000, serviceType: "all" },
        { id: "voucher-giam10pt", title: "Giảm 10%", description: "Giảm 10% cho hóa đơn từ 1,200,000đ", discountRate: 0.1, minTotal: 1200000, serviceType: "all" },
      ];

      const foundReward = availableRewards.find(r => r.title === rewardTitle);
      const rewardInfo = foundReward || {
        id: `voucher-${Date.now()}`,
        title: rewardTitle,
        description: rewardDescription,
        discountAmount: 50000,
        discountRate: undefined as number | undefined,
        minTotal: 0,
        serviceType: "all"
      };

      const pointsResult = await rtdb.ref(`users/profiles/${userKey}/points`).transaction((current) => {
        const currentPoints = Number(current || 0);
        if (currentPoints < rewardPointsCost) return;
        return currentPoints - rewardPointsCost;
      });

      if (!pointsResult.committed) {
        await sendPointExchangeNotification(
          requestUserId,
          "Đổi điểm không thành công",
          `Yêu cầu đổi "${rewardTitle}" không thành công vì tài khoản không còn đủ ${rewardPointsCost.toLocaleString("vi-VN")} điểm tại thời điểm duyệt.`
        );
        return NextResponse.json({ message: "Người dùng không đủ điểm để duyệt yêu cầu này" }, { status: 400 });
      }

      // Thêm thưởng vào rewardVault
      const vaultRef = rtdb.ref(`users/profiles/${userKey}/rewardVault`).push();
      const vaultData: any = {
        id: vaultRef.key,
        requestId: id,
        title: rewardInfo.title,
        description: rewardInfo.description,
        minTotal: rewardInfo.minTotal,
        serviceType: rewardInfo.serviceType,
        pointsCost: rewardPointsCost,
        status: "active",
        createdAt: Date.now(),
      };

      // Chỉ thêm discountAmount hoặc discountRate nếu có
      if (rewardInfo.discountAmount) {
        vaultData.discountAmount = rewardInfo.discountAmount;
      }
      if (rewardInfo.discountRate) {
        vaultData.discountRate = rewardInfo.discountRate;
      }

      await vaultRef.set(vaultData);

      const historyRef = rtdb.ref(`users/profiles/${userKey}/pointHistory`).push();
      await historyRef.set({
        type: "spend",
        requestId: id,
        points: -rewardPointsCost,
        timestamp: Date.now(),
        description: `Đổi thưởng "${rewardTitle}"`,
      });

      await rtdb.ref(`pointRequests/${id}`).update({
        status,
        reviewedAt: Date.now(),
      });

      await sendPointExchangeNotification(
        requestUserId,
        "Đổi điểm thành công",
        `Bạn đã đổi "${rewardTitle}" thành công với ${rewardPointsCost.toLocaleString("vi-VN")} điểm. Phần thưởng đã được thêm vào kho thưởng của bạn.`,
        "/wallet/reward-vault"
      );
    }

    // Nếu từ chối, gửi thông báo cho user
    if (status === "rejected") {
      await rtdb.ref(`pointRequests/${id}`).update({
        status,
        reviewedAt: Date.now(),
      });

      await sendPointExchangeNotification(
        requestUserId,
        "Đổi điểm không thành công",
        `Yêu cầu đổi "${requestData.reward}" đã bị từ chối. Vui lòng liên hệ Monaco để biết thêm chi tiết.`
      );
    }

    return NextResponse.json({
      message: status === "approved" ? "Đã duyệt yêu cầu" : "Đã từ chối yêu cầu",
    }, { status: 200 });
  } catch (error: any) {
    console.error("Review point request error:", error);
    return NextResponse.json({ message: "Lỗi hệ thống", error: error.message }, { status: 500 });
  }
}
