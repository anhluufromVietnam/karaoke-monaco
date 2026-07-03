import { NextResponse } from "next/server";
import { rtdb, admin } from "@/lib/firebaseAdmin";

const slugify = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 40);

export async function GET() {
  try {
    const snapshot = await rtdb.ref("news").once("value");
    const data = snapshot.val() || {};
    
    const promotions = Object.entries(data).map(([id, item]: [string, any]) => ({
      id,
      title: item.title || "",
      subtitle: item.subtitle || "",
      content: item.content || "",
      startDate: item.startDate || "",
      endDate: item.endDate || "",
      imageUrl: item.imageUrl || "/placeholder.jpg",
      isActive: item.isActive !== false,
      rules: item.rules || [],
      featured: item.featured === true,
      createdAt: item.createdAt || 0,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json({ promotions }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ message: "Lỗi hệ thống", error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, subtitle, content, startDate, endDate, imageUrl, isActive, rules, featured } = body;

    if (!title || !content) {
      return NextResponse.json({ message: "Thiếu tiêu đề hoặc nội dung" }, { status: 400 });
    }

    const id = slugify(title) + "-" + Date.now().toString(36);
    const now = Date.now();

    await rtdb.ref(`news/${id}`).set({
      title,
      subtitle: subtitle || "",
      content,
      startDate: startDate || "",
      endDate: endDate || "",
      imageUrl: imageUrl || "/placeholder.jpg",
      isActive: isActive !== false,
      rules: rules || [],
      featured: featured === true,
      createdAt: now,
      updatedAt: now,
    });

    // Tạo thông báo toàn cầu cho khuyến mãi mới
    const notifRef = rtdb.ref("notifications/global").push();
    await notifRef.set({
      title: "🎉 Khuyến mãi mới",
      description: `${title}${subtitle ? ` - ${subtitle}` : ""}`,
      href: `/promotions/${id}`,
      type: "promotion",
      time: "Mới đây",
      createdAt: now,
    });

    return NextResponse.json({ message: "Tạo khuyến mãi thành công", id }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ message: "Lỗi hệ thống", error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, title, subtitle, content, startDate, endDate, imageUrl, isActive, rules, featured } = body;

    if (!id) {
      return NextResponse.json({ message: "Thiếu mã khuyến mãi" }, { status: 400 });
    }

    const ref = rtdb.ref(`news/${id}`);
    const snapshot = await ref.once("value");
    if (!snapshot.exists()) {
      return NextResponse.json({ message: "Không tìm thấy khuyến mãi" }, { status: 404 });
    }

    const updateData: Record<string, any> = { updatedAt: Date.now() };
    if (title !== undefined) updateData.title = title;
    if (subtitle !== undefined) updateData.subtitle = subtitle;
    if (content !== undefined) updateData.content = content;
    if (startDate !== undefined) updateData.startDate = startDate;
    if (endDate !== undefined) updateData.endDate = endDate;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (rules !== undefined) updateData.rules = rules;
    if (featured !== undefined) updateData.featured = featured;

    await ref.update(updateData);

    return NextResponse.json({ message: "Cập nhật khuyến mãi thành công" }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ message: "Lỗi hệ thống", error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ message: "Thiếu mã khuyến mãi" }, { status: 400 });
    }

    const ref = rtdb.ref(`news/${id}`);
    const snapshot = await ref.once("value");
    if (!snapshot.exists()) {
      return NextResponse.json({ message: "Không tìm thấy khuyến mãi" }, { status: 404 });
    }

    await ref.remove();

    return NextResponse.json({ message: "Xóa khuyến mãi thành công" }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ message: "Lỗi hệ thống", error: error.message }, { status: 500 });
  }
}