import { rtdb } from "./firebaseAdmin";

export interface PointsCalculationResult {
  finalAmount: number;
  points: number;
}

/**
 * Calculate points and final amount for a booking
 * Uses the same logic across all APIs for consistency
 */
export function calculateBookingPoints(data: any): PointsCalculationResult {
  // Lấy subtotal: Ưu tiên số tiền khách thực thanh toán (paidAmount) cho các đơn "Đã thanh toán"
  // Nếu không có, lấy giá trị lớn nhất từ các nguồn doanh thu để tránh mất tiền phòng/dịch vụ
  const paidAmount = Number(data.paidAmount || 0);
  const roomPrice = Number(data.totalEst || data.roomPrice || 0);
  const services = data.services || data.items || [];
  const servicesTotal = services.reduce((sum: number, s: any) => sum + (s.price * (s.quantity || s.qty || 1)), 0);
  const totalAmount = Number(data.totalAmount || 0);

  const subtotal = data.status === "Đã thanh toán" && paidAmount > 0 
    ? paidAmount 
    : Math.max(totalAmount, roomPrice + servicesTotal, paidAmount);

  let voucherDiscount = 0;
  if (data.appliedVoucher) {
    if (data.appliedVoucher.discountAmount) {
      voucherDiscount = Math.min(data.appliedVoucher.discountAmount, subtotal);
    } else if (data.appliedVoucher.discountRate) {
      voucherDiscount = Math.floor(subtotal * data.appliedVoucher.discountRate);
    }
  }
  
  const rewardDiscount = Number(data.appliedRewardDiscount || 0);
  const finalAmount = Math.max(0, subtotal - voucherDiscount - rewardDiscount);
  const points = Math.floor(finalAmount / 10000);

  return { finalAmount, points };
}

/**
 * Update user points and lifetime spent
 */
export async function updateUserPoints(
  userId: string,
  userKey: string,
  pointsToAdd: number,
  finalAmount: number,
  bookingId: string
) {
  if (!userId || userId === "guest" || pointsToAdd <= 0) {
    return;
  }

  // Cập nhật điểm
  const userPointsRef = rtdb.ref(`users/profiles/${userKey}/points`);
  await userPointsRef.transaction((current: number | null) => {
    return (current || 0) + pointsToAdd;
  });

  // Cập nhật lifetimeSpent (tổng chi tiêu tích lũy) để xếp hạng
  const lifetimeRef = rtdb.ref(`users/profiles/${userKey}/lifetimeSpent`);
  await lifetimeRef.transaction((current: number | null) => {
    return (current || 0) + finalAmount;
  });

  // Lưu lịch sử điểm
  const historyRef = rtdb.ref(`users/profiles/${userKey}/pointHistory`).push();
  await historyRef.set({
    type: "earn",
    bookingId,
    points: pointsToAdd,
    timestamp: Date.now(),
    description: `Tích điểm từ đơn hàng #${bookingId} (${new Intl.NumberFormat("vi-VN").format(finalAmount)}đ)`,
  });
}

/**
 * Send notification to user about points earned
 */
export async function sendPointsNotification(
  userId: string,
  pointsToAdd: number,
  bookingId: string
) {
  if (!userId || userId === "guest" || pointsToAdd <= 0) {
    return;
  }

  const notificationRef = rtdb.ref(`notifications/personal/${userId}`).push();
  await notificationRef.set({
    title: "Bạn đã được cộng điểm",
    description: `Bạn vừa nhận ${pointsToAdd} điểm mới từ đơn hàng #${bookingId}.`,
    href: "/wallet",
    type: "system",
    time: "Mới đây",
    createdAt: Date.now(),
    read: false,
  });
}

/**
 * Resolve userKey from userId
 * Tries uidMap first, then falls back to searching in profiles
 */
export async function resolveUserKey(userId: string): Promise<string> {
  // Try uidMap first
  const uidMapSnapshot = await rtdb.ref(`users/uidMap/${userId}`).once("value");
  if (uidMapSnapshot.exists()) {
    return uidMapSnapshot.val();
  }

  // Fallback: search in profiles by authUid
  const profilesSnapshot = await rtdb.ref("users/profiles").once("value");
  if (profilesSnapshot.exists()) {
    const profiles = profilesSnapshot.val();
    const profileByAuthUid = Object.entries(profiles).find(([, prof]: [string, any]) => prof.authUid === userId);
    if (profileByAuthUid) {
      return profileByAuthUid[0];
    }
  }

  // If still not found, use userId as-is
  return userId;
}