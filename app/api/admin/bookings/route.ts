import { NextResponse } from "next/server";
import { rtdb, admin } from "@/lib/firebaseAdmin";

/**
 * Admin order management API
 * - GET: list all bookings (with optional status filter)
 * - POST: update booking status + sync points
 */

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let ref = rtdb.ref("bookings");
    let snapshot;

    if (status && status !== "all") {
      snapshot = await ref.orderByChild("status").equalTo(status).once("value");
    } else {
      snapshot = await ref.once("value");
    }

    if (!snapshot.exists()) {
      return NextResponse.json({ bookings: [] }, { status: 200 });
    }

    const data = snapshot.val();
    const bookings = Object.entries(data)
      .map(([id, value]: [string, any]) => ({
        id,
        ...value,
      }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return NextResponse.json({ bookings }, { status: 200 });
  } catch (error: any) {
    console.error("Admin bookings error:", error);
    return NextResponse.json({ message: "Lỗi hệ thống" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { bookingId, action, receptionistNote, force } = await request.json();
    let pointsAdded = 0;

    if (!action) {
      return NextResponse.json({ message: "Thiếu thông tin" }, { status: 400 });
    }

    // Helper function để tính toán tiền và điểm cho một booking
    const calculatePoints = (data: any) => {
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
      return { finalAmount, points: Math.floor(finalAmount / 10000) };
    };

    // Các hành động không cần bookingId cụ thể (như sync-all)
    if (action === "sync-all") {
      const bookingsSnapshot = await rtdb.ref("bookings").once("value");
      if (!bookingsSnapshot.exists()) return NextResponse.json({ message: "Không có dữ liệu" });

      const bookings = bookingsSnapshot.val();
      
      // Lấy uidMap và danh sách profiles để làm fallback tìm username
      console.log("[Admin Sync-All] Fetching uidMap and profiles for userKey resolution...");
      const uidMapSnapshot = await rtdb.ref("users/uidMap").once("value");
      const profilesSnapshot = await rtdb.ref("users/profiles").once("value");
      
      const uidMap = uidMapSnapshot.exists() ? uidMapSnapshot.val() : {};
      const profiles = profilesSnapshot.exists() ? profilesSnapshot.val() : {};
      
      // Tạo bản đồ ngược từ profiles (authUid -> username) để đảm bảo tìm đúng node dữ liệu
      const authToUser: Record<string, string> = { ...uidMap };
      let profilesFallbackUsed = 0;
      Object.entries(profiles).forEach(([uname, prof]: [string, any]) => {
        if (prof.authUid) authToUser[prof.authUid] = uname;
      });
      
      let syncCount = 0;
      let skippedCount = 0;
      const syncedIds: string[] = [];

      for (const [id, data] of Object.entries(bookings) as [string, any][]) {
        // Lọc các đơn chính xác là "Đã thanh toán" và thuộc về thành viên
        const isPaid = data.status === "Đã thanh toán";
        const isMember = data.userId && data.userId !== "guest";

        if (isPaid && isMember) {
          const { finalAmount, points } = calculatePoints(data);
          
          if (points <= 0 && !data.points) {
            skippedCount++;
            continue;
          }

          let userKey = authToUser[data.userId];
          if (!userKey) {
            // Fallback: if data.userId is not an authUid in authToUser, assume it might be a username
            // Or, if authToUser didn't have the mapping, try to find it directly in profiles
            const profileByAuthUid = Object.entries(profiles).find(([, prof]: [string, any]) => prof.authUid === data.userId);
            if (profileByAuthUid) {
              userKey = profileByAuthUid[0]; // Get the username
              profilesFallbackUsed++;
            } else userKey = data.userId; // If still not found, use data.userId as-is (might be username or authUid)
          }

          // Kiểm tra xem đã có lịch sử điểm cho đơn này chưa để tránh cộng trùng
          const historyRef = rtdb.ref(`users/profiles/${userKey}/pointHistory`);
          const historySnapshot = await historyRef.orderByChild("bookingId").equalTo(id).once("value");
          const historyExists = historySnapshot.exists();
          const storedPoints = data.pointsEarned || 0;

          // Nếu chưa có lịch sử HOẶC số điểm đã lưu khác với số điểm tính toán lại (cần sửa sai)
          if (!historyExists || storedPoints !== points) {
            const diff = points - storedPoints;
            console.log(`[Admin Sync] Updating ${userKey}: Booking ${id}. Calculated: ${points}, Stored: ${storedPoints}, Diff: ${diff}`);

            // 1. Cập nhật tổng điểm của User (cộng thêm phần chênh lệch)
            if (diff !== 0) {
              await rtdb.ref(`users/profiles/${userKey}/points`).transaction((current) => (current || 0) + diff);
            }
            
            // 2. Tạo bản ghi lịch sử tích điểm mới
            const historyData = {
              type: "earn",
              bookingId: id,
              points,
              timestamp: data.completedAt || data.createdAt || Date.now(),
              description: `Tích điểm đơn #${id} (${new Intl.NumberFormat("vi-VN").format(finalAmount)}đ)`,
              status: "completed"
            };

            if (!historyExists) {
              await historyRef.push(historyData);
            } else {
              // Cập nhật lại bản ghi cũ
              const entryKey = Object.keys(historySnapshot.val())[0];
              await rtdb.ref(`users/profiles/${userKey}/pointHistory/${entryKey}`).update(historyData);
            }
            
            // 3. Cập nhật/Đồng bộ lại thông tin điểm và số tiền vào Object Booking
            await rtdb.ref(`bookings/${id}`).update({ 
              pointsEarned: points, 
              finalAmount: finalAmount,
              paidAmount: data.paidAmount || finalAmount,
              completedAt: data.completedAt || data.createdAt || Date.now()
            });
            
            syncCount++;
            syncedIds.push(id);
          } else {
            skippedCount++;
          }
        } else {
          skippedCount++;
        }
      }
      
      console.log(`[Admin Sync-All] Finished. Synced: ${syncCount}, Skipped: ${skippedCount}`);
      return NextResponse.json({ 
        message: `Đã đồng bộ thành công ${syncCount} đơn hàng cho các tài khoản thành viên.`, 
        stats: { total: Object.keys(bookings).length, synced: syncCount, skipped: skippedCount, syncedIds }
      });
    }

    // Các hành động cần bookingId
    if (!bookingId) return NextResponse.json({ message: "Thiếu bookingId" }, { status: 400 });
    const bookingRef = rtdb.ref(`bookings/${bookingId}`);
    const bookingSnapshot = await bookingRef.once("value");
    
    if (!bookingSnapshot.exists()) {
      return NextResponse.json({ message: "Không tìm thấy đơn hàng" }, { status: 404 });
    }

    const bookingData = bookingSnapshot.val();
    const userId = bookingData.userId;
    const { finalAmount, points: calcPoints } = calculatePoints(bookingData);
    pointsAdded = calcPoints;

    switch (action) {
      case "confirm": {
        // Admin xác nhận đơn
        await bookingRef.update({ 
          status: "Đã xác nhận", 
          confirmedAt: Date.now() 
        });
        
        if (userId && userId !== "guest") {
          const notifRef = rtdb.ref(`notifications/personal/${userId}`).push();
          await notifRef.set({
            title: "Đơn hàng đã được xác nhận",
            description: `Đơn hàng #${bookingId} đã được xác nhận. Vui lòng đến đúng giờ.`,
            href: `/orders/${bookingId}`,
            type: "order",
            time: "Mới đây",
            createdAt: Date.now(),
            read: false,
          });
        }
        break;
      }
      case "arrive": {
        // Lễ tân xác nhận khách đã đến
        await bookingRef.update({
          status: "Đã đến",
          arrivedAt: Date.now()
        });

        if (userId && userId !== "guest") {
          const notifRef = rtdb.ref(`notifications/personal/${userId}`).push();
          await notifRef.set({
            title: "Khách đã đến",
            description: `Đơn hàng #${bookingId} đã được ghi nhận là khách đã đến. Monaco sẽ sắp xếp dịch vụ ngay cho bạn.`,
            href: `/orders/${bookingId}`,
            type: "order",
            time: "Mới đây",
            createdAt: Date.now(),
            read: false,
          });
        }
        break;
      }
      case "cancel": {
        // Admin hủy đơn
        await bookingRef.update({ 
          status: "Đã hủy", 
          cancelledAt: Date.now(),
          cancelNote: receptionistNote || ""
        });
        
        if (userId && userId !== "guest") {
          const notifRef = rtdb.ref(`notifications/personal/${userId}`).push();
          await notifRef.set({
            title: "Đơn hàng đã bị hủy",
            description: `Đơn hàng #${bookingId} đã bị hủy. Vui lòng liên hệ quán để biết thêm chi tiết.`,
            href: `/orders/${bookingId}`,
            type: "order",
            time: "Mới đây",
            createdAt: Date.now(),
            read: false,
          });
        }
        break;
      }
      case "start": {
        // Lễ tân xác nhận khách đang sử dụng
        await bookingRef.update({ 
          status: "Đang dùng", 
          startedAt: Date.now() 
        });

        if (userId && userId !== "guest") {
          const notifRef = rtdb.ref(`notifications/personal/${userId}`).push();
          await notifRef.set({
            title: "Bắt đầu dịch vụ",
            description: `Đơn hàng #${bookingId.slice(-6)} đang được sử dụng. Chúc bạn có trải nghiệm thật vui tại Monaco!`,
            href: `/orders/${bookingId}`,
            type: "order",
            time: "Mới đây",
            createdAt: Date.now(),
            read: false,
          });
        }
        break;
      }
      case "complete": {
        // Lễ tân xác nhận thanh toán → tính điểm dựa trên số tiền thực tế
        // Chỉ chặn nếu đã có trường pointsEarned. Cho phép chạy tiếp nếu status là "Đã thanh toán" nhưng chưa có điểm (bù điểm)
        if (bookingData.pointsEarned !== undefined && !force) {
          return NextResponse.json({ message: "Đơn hàng này đã được cộng điểm trước đó." }, { status: 400 });
        }
        
        await bookingRef.update({ 
          status: "Đã thanh toán", 
          completedAt: Date.now(),
          finalAmount: finalAmount,
          paidAmount: finalAmount, // Cập nhật tổng tiền đã thanh toán bằng tổng hóa đơn cuối cùng
          pointsEarned: pointsAdded
        });

        // Cộng điểm cho user dựa trên số tiền thực tế đã thanh toán
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

          // Chỉ thực hiện cập nhật nếu có điểm để cộng
          if (pointsAdded > 0) {
            console.log(`[Admin Booking API] Attempting to update points. UserKey: ${userKey}, Points: ${pointsAdded}`);
            console.log(`[Admin Booking API] Writing point history for userKey: ${userKey} at path: users/profiles/${userKey}/pointHistory`);

            // Cập nhật điểm
            const userPointsRef = rtdb.ref(`users/profiles/${userKey}/points`);
            await userPointsRef.transaction((current: number | null) => {
              const newPoints = (current || 0) + pointsAdded;
              console.log(`[Admin Booking API] Updating points for ${userKey}: ${current} -> ${newPoints}`);
              return newPoints;
            });

            // Cập nhật lifetimeSpent (tổng chi tiêu tích lũy) để xếp hạng
            const lifetimeRef = rtdb.ref(`users/profiles/${userKey}/lifetimeSpent`);
            await lifetimeRef.transaction((current: number | null) => {
              return (current || 0) + finalAmount;
            });

            // Lưu lịch sử điểm vào đúng node profile
            const historyRef = rtdb.ref(`users/profiles/${userKey}/pointHistory`).push();
            const historyData = {
              type: "earn",
              bookingId,
              points: pointsAdded,
              timestamp: Date.now(),
              description: `Tích điểm từ đơn hàng #${bookingId} (${new Intl.NumberFormat("vi-VN").format(finalAmount)}đ)`,
            };

            try {
              await historyRef.set(historyData);
              console.log(`[Admin Booking API] Successfully recorded pointHistory at users/profiles/${userKey}/pointHistory`);
            } catch (err) {
              console.error(`[Admin Booking API] Failed to set pointHistory for ${userKey}:`, err);
            }

            // Thông báo
            const notifRef = rtdb.ref(`notifications/personal/${userId}`).push();
            await notifRef.set({
              title: "Thanh toán thành công",
              description: `Đơn hàng #${bookingId} đã thanh toán ${new Intl.NumberFormat("vi-VN").format(finalAmount)}đ. Bạn nhận được +${pointsAdded} điểm.`,
              href: `/orders/${bookingId}`, // Ensure this path is correct for the client app
              type: "order",
              time: "Mới đây",
              createdAt: Date.now(),
              read: false,
            });
          } else {
            console.log(`[Admin Booking API] pointsAdded is 0, skipping profile update for ${userKey}`);
          }
          
          if (!uidMapSnapshot.exists()) {
            console.warn(`[Admin Booking API] userId ${userId} not found in uidMap, used as-is for userKey.`);
          }
        }
        else {
          console.log(`[Admin Booking API] Skipping point update: userId is guest or not provided (${userId})`);
        }
        break;
      }
      default:
        return NextResponse.json({ message: "Hành động không hợp lệ" }, { status: 400 });
    }

    return NextResponse.json({ 
      message: "Cập nhật đơn hàng thành công", 
      bookingId,
      action,
      pointsAdded
    }, { status: 200 });
  } catch (error: any) {
    console.error("Admin booking action error:", error);
    return NextResponse.json({ message: "Lỗi hệ thống" }, { status: 500 });
  }
}
