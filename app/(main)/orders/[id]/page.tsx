"use client"

import { useParams, useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Calendar, Clock, Sparkles, Users, Mic2, Pencil, Trash2, AlertTriangle, Check, X, Plus, Minus, Loader2, Play, CheckCircle, Ban } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/AuthContext"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { rtdb } from "@/lib/firebase"
import { ref, update, onValue } from "firebase/database"
import { BookingStatus } from "@/lib/database-schema"

const roomMapping: Record<string, any> = {
  karaoke: { name: "Karaoke VIP", image: "/images/vip1.jpg", guests: "10-20 người" },
  massage: { name: "Massage Monaco", image: "/images/monaco1.jpg", guests: "1 người" },
  restaurant: { name: "Nhà hàng Monaco", image: "/images/bg-intro.jpg", guests: "Theo bàn" }
}

interface ServiceItem {
  name: string
  price: number
  quantity: number
  qty?: number
}

interface OrderDetail {
  id: string
  room: string
  date: string
  time: string
  status: BookingStatus
  guests: string
  image: string
  points: number
  pointsEarned?: number
  services: ServiceItem[]
  roomPrice: number
  servicesTotal: number
  subtotal: number
  originalPrice: number
  finalPrice: number
  paidAmount: number
  note: string
  appliedVoucher: any
  appliedRewardId: string | null
  appliedRewardTitle: string | null
  appliedRewardDescription: string | null // Thêm mô tả phần thưởng vào interface
  rewardDiscount: number
  voucherDiscount: number
}

function getStatusLabel(status: string) {
  switch (status) {
    case "pending":
    case "Chờ xác nhận":
      return { text: "Chờ xác nhận", color: "bg-yellow-500/20 text-yellow-500" }
    case "Đã xác nhận":
      return { text: "Đã xác nhận", color: "bg-blue-500/20 text-blue-500" }
    case "Chờ đến":
      return { text: "Chờ đến", color: "bg-indigo-500/20 text-indigo-500" }
    case "Đã đến":
      return { text: "Đã đến", color: "bg-cyan-500/20 text-cyan-500" }
    case "Đang dùng":
      return { text: "Đang dùng", color: "bg-purple-500/20 text-purple-500" }
    case "Chờ thanh toán":
      return { text: "Chờ thanh toán", color: "bg-amber-500/20 text-amber-500" }
    case "Đã thanh toán":
      return { text: "Đã thanh toán", color: "bg-green-500/20 text-green-500" }
    case "Đã hủy":
      return { text: "Đã hủy", color: "bg-red-500/20 text-red-500" }
    default:
      return { text: status, color: "bg-slate-500/20 text-slate-500" }
  }
}

function formatPrice(price: number) {
  if (isNaN(price) || price < 0) return "0đ"
  return new Intl.NumberFormat("vi-VN").format(price) + "đ"
}

function getQty(s: any): number {
  return s.quantity || s.qty || 1
}

export default function OrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  
  const { user } = useAuth()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [isCanceling, setIsCanceling] = useState(false)
  const [isConfirmingSave, setIsConfirmingSave] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [editForm, setEditForm] = useState<OrderDetail | null>(null)

  useEffect(() => {
    const orderRef = ref(rtdb, `bookings/${id}`)
    
    const unsubscribe = onValue(orderRef, (snapshot) => {
      try {
        if (snapshot.exists()) {
          const data = snapshot.val()
          const roomInfo = roomMapping[data.type] || roomMapping.karaoke
          
          // Normalize services: DB có thể lưu qty hoặc quantity
          const rawServices = data.services || data.items || []
          const services = rawServices.map((s: any) => ({
            ...s,
            quantity: getQty(s),
          }))
          
          // Tính toán tiền
          // totalEst là tiền phòng theo yêu cầu người dùng
          const roomPrice = Number(data.totalEst || data.roomPrice || 0)
          const servicesTotal = services.reduce((sum: number, s: any) => sum + (s.price * getQty(s)), 0)
          const subtotal = roomPrice + servicesTotal
          
          const rewardDiscount = Number(data.appliedRewardDiscount || 0)
          
          // Tính discount từ voucher (vẫn giữ để hiển thị chi tiết nếu cần)
          let voucherDiscount = 0
          if (data.appliedVoucher) {
            if (data.appliedVoucher.discountAmount) {
              voucherDiscount = Math.min(data.appliedVoucher.discountAmount, subtotal)
            } else if (data.appliedVoucher.discountRate) {
              voucherDiscount = Math.floor(subtotal * data.appliedVoucher.discountRate)
            }
          }
          
          // Tổng thanh toán = (Tiền phòng + Dịch vụ) - Voucher - Thưởng
          const finalPrice = Math.max(0, subtotal - voucherDiscount - rewardDiscount)
          
          const mappedOrder: OrderDetail = {
            id,
            room: roomInfo.name,
            date: data.bookingDate,
            time: data.bookingTime,
            status: ((data.status === "pending" ? "Chờ xác nhận" : data.status) || "Chờ xác nhận") as BookingStatus,
            guests: data.guests || roomInfo.guests,
            image: roomInfo.image,
            points: isNaN(finalPrice) || finalPrice <= 0 ? 0 : Math.floor(finalPrice / 10000),
            pointsEarned: data.pointsEarned,
            services: services,
            roomPrice: roomPrice,
            servicesTotal: servicesTotal,
            subtotal: subtotal,
            originalPrice: subtotal,
            finalPrice: finalPrice, 
            paidAmount: Number(data.paidAmount || 0), 
            note: data.note || "",
            appliedVoucher: data.appliedVoucher || null,
            appliedRewardId: data.appliedRewardId || null,
            appliedRewardTitle: data.appliedRewardTitle || null,
            appliedRewardDescription: data.appliedRewardDescription || null, // Lấy mô tả từ database
            rewardDiscount: rewardDiscount,
            voucherDiscount: voucherDiscount,
          }
          
          setOrder(mappedOrder)
          if (!isEditing) {
            setEditForm(mappedOrder)
          }
        }
      } catch (error) {
        console.error("Error syncing order details:", error)
      } finally {
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [id, isEditing])

  if (loading) return <div className="min-h-screen flex items-center justify-center italic text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Đang tải...</div>

  if (!order) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
        <Mic2 className="h-16 w-16 text-muted-foreground/20 mb-4" />
        <h1 className="text-xl font-bold">Không tìm thấy đơn hàng</h1>
        <p className="text-muted-foreground mt-2">Đơn hàng này có thể không tồn tại hoặc đã bị hủy.</p>
        <Link href="/orders" className="mt-6">
          <Button variant="default">Quay lại danh sách đơn</Button>
        </Link>
      </div>
    )
  }

  const status = getStatusLabel(order.status)
  const isStaff = user?.role === "receptionist" || user?.role === "admin"

  const handleStatusUpdate = async (newStatus: string) => {
    setIsUpdatingStatus(true)
    try {
      const response = await fetch("/api/bookings/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: id, status: newStatus }),
      })

      if (response.ok) {
        if (order) {
          const updatedOrder: OrderDetail = { ...order, status: newStatus as BookingStatus }
          setOrder(updatedOrder)
          setEditForm(updatedOrder)
        }
        router.refresh()
      } else {
        alert("Có lỗi xảy ra khi cập nhật trạng thái.")
      }
    } catch (error) {
      console.error("Status update error:", error)
      alert("Lỗi hệ thống khi cập nhật trạng thái.")
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!editForm) return
    try {
      const servicesTotal = editForm.services.reduce((sum: number, s: any) => sum + (s.price * getQty(s)), 0)
      const roomPrice = editForm.roomPrice || 0
      const subtotal = roomPrice + servicesTotal
      
      let voucherDiscount = 0
      const v = editForm.appliedVoucher
      if (v && typeof v === 'object') {
        if (v.discountAmount) {
          voucherDiscount = Math.min(v.discountAmount, subtotal)
        } else if (v.discountRate) {
          voucherDiscount = Math.floor(subtotal * v.discountRate)
        }
      }

      const rewardDiscount = editForm.rewardDiscount || 0
      const newFinalPrice = Math.max(0, subtotal - voucherDiscount - rewardDiscount)
      
      const orderRef = ref(rtdb, `bookings/${id}`)
      await update(orderRef, {
        bookingDate: editForm.date,
        bookingTime: editForm.time,
        items: editForm.services,
        services: editForm.services,
        roomPrice: editForm.roomPrice,
        totalEst: editForm.roomPrice,
        totalAmount: subtotal,
        finalAmount: newFinalPrice,
        note: editForm.note
      })
      
      const updatedOrder = {
        ...editForm,
        servicesTotal,
        subtotal,
        finalPrice: newFinalPrice,
        voucherDiscount,
        points: isNaN(newFinalPrice) || newFinalPrice <= 0 ? 0 : Math.floor(newFinalPrice / 10000),
      }
      setOrder(updatedOrder)
      setEditForm(updatedOrder)
      setIsEditing(false)
    } catch (error) {
      alert("Không thể cập nhật đơn hàng.")
    }
  }

  const handleCancelOrder = async () => {
    try {
      const response = await fetch("/api/bookings/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: id, status: "Đã hủy" }),
      })

      if (!response.ok) {
        alert("Không thể hủy đơn hàng.")
        return
      }

      router.push("/orders")
    } catch (error) {
      alert("Không thể hủy đơn hàng.")
    }
  }

  const handleCompleteOrder = async () => {
    setIsCompleting(true)
    try {
      const response = await fetch("/api/admin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: id, action: "complete" }),
      })
      if (response.ok) {
        const data = await response.json()
        alert(`Hoàn thành đơn hàng! Khách hàng đã được tích thêm ${data.pointsAdded || 0} điểm.`)
        if (order) {
          const updatedOrder: OrderDetail = { ...order, status: "Đã thanh toán" };
          setOrder(updatedOrder);
          setEditForm(updatedOrder);
        }
        router.refresh();
      } else {
        alert("Có lỗi xảy ra khi hoàn thành đơn hàng.")
      }
    } catch (error) {
      console.error("Complete error:", error)
    } finally {
      setIsCompleting(false)
    }
  }

  const updateServiceQuantity = (idx: number, delta: number) => {
    if (!editForm) return
    const newServices = [...editForm.services]
    newServices[idx] = {
      ...newServices[idx],
      quantity: Math.max(0, getQty(newServices[idx]) + delta)
    }
    const servicesTotal = newServices.reduce((acc, curr) => acc + curr.price * getQty(curr), 0)
    const roomPrice = editForm.roomPrice || 0
    const subtotal = roomPrice + servicesTotal
    
    let voucherDiscount = 0
    const v = editForm.appliedVoucher
    if (v && typeof v === 'object') {
      if (v.discountAmount) {
        voucherDiscount = Math.min(v.discountAmount, subtotal)
      } else if (v.discountRate) {
        voucherDiscount = Math.floor(subtotal * v.discountRate)
      }
    }
    const rewardDiscount = editForm.rewardDiscount || 0
    const newFinalPrice = Math.max(0, subtotal - voucherDiscount - rewardDiscount)

    setEditForm({ 
      ...editForm, 
      services: newServices,
      servicesTotal,
      subtotal,
      originalPrice: subtotal,
      finalPrice: newFinalPrice,
      voucherDiscount,
    })
  }

  return (
    <div className="min-h-screen w-full bg-background flex flex-col pb-32">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border/30">
        <div className="flex items-center gap-3 px-4 py-4">
          <Link href="/orders">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-foreground hover:bg-accent/50">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold text-foreground">Chi tiết đơn hàng</h1>
        </div>
      </header>

      <main className="p-4 space-y-6">
        <Card className="p-4 border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Mã đơn hàng</p>
              <h2 className="text-xl font-bold text-foreground">#{order.id}</h2>
            </div>
            <Badge className={cn("border-none", status.color)}>
              {status.text}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-accent bg-accent/10 w-fit px-2 py-1 rounded-full">
            <Sparkles className={cn("h-3.5 w-3.5", order.status !== "Đã thanh toán" && "animate-pulse")} />
            {order.status === "Đã thanh toán" && order.pointsEarned !== undefined ? (
              <span className="text-green-600">Đã tích lũy +{order.pointsEarned} điểm</span>
            ) : (
              <span>Dự kiến nhận +{order.points} điểm tích lũy</span>
            )}
            
          </div>
        </Card>

        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-primary px-1">Thông tin đặt lịch</h3>
          <Card className="overflow-hidden border-border/50 shadow-sm">
            <div className="relative h-40 w-full">
              <Image src={order.image} alt={order.room} fill className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-3 left-3">
                <h4 className="text-lg font-bold text-white">{order.room}</h4>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground">Ngày:</span>
                {isEditing ? (
                  <Input 
                    type="text" 
                    value={editForm?.date || ""} 
                    onChange={e => setEditForm(prev => prev ? {...prev, date: e.target.value} : prev)}
                    className="h-8 py-0 px-2 text-sm bg-background border-primary/30"
                  />
                ) : (
                  <span className="font-medium text-foreground">{order.date}</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground">Thời gian:</span>
                {isEditing ? (
                  <Input 
                    type="time" 
                    value={editForm?.time || ""} 
                    onChange={e => setEditForm(prev => prev ? {...prev, time: e.target.value} : prev)}
                    className="h-8 py-0 px-2 text-sm bg-background border-primary/30"
                  />
                ) : (
                  <span className="font-medium text-foreground">{order.time}</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground">Số lượng:</span>
                <span className="font-medium text-foreground">{order.guests}</span>
              </div>
            </div>
          </Card>
        </section>

        {(isEditing || order.status === "Chờ xác nhận" || order.status === "Đã xác nhận" || order.status === "Đã đến") && (
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-primary px-1">Dịch vụ đã chọn</h3>
            <Card className="p-4 border-border/50 space-y-3">
              {(isEditing ? editForm?.services : order.services)?.map((service, idx) => (
                <div key={idx} className="flex justify-between items-center text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{service.name}</span>
                    <span className="text-xs text-muted-foreground font-normal">Số lượng: {getQty(service)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {isEditing && (
                      <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateServiceQuantity(idx, -1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-4 text-center font-bold text-xs">{getQty(service)}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateServiceQuantity(idx, 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    <span className="font-semibold text-foreground">{formatPrice(service.price * getQty(service))}</span>
                  </div>
                </div>
              ))}
            </Card>
          </section>
        )}

        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-primary px-1">Chi tiết thanh toán</h3>
          <Card className="p-4 border-border/50 space-y-3 bg-muted/5">
            {/* Luôn hiển thị Tiền phòng */}
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Tiền phòng</span>
                {isEditing ? (
                  <Input 
                    type="number"
                    value={editForm?.roomPrice || 0}
                    onChange={e => {
                      const newRoomPrice = Number(e.target.value) || 0
                      if (!editForm) return
                      const servicesTotal = editForm.services.reduce((sum: number, s: any) => sum + (s.price * getQty(s)), 0)
                      const newSubtotal = newRoomPrice + servicesTotal
                      let voucherDiscount = 0
                      const v = editForm.appliedVoucher
                      if (v && typeof v === 'object') {
                        if (v.discountAmount) {
                          voucherDiscount = Math.min(v.discountAmount, newSubtotal)
                        } else if (v.discountRate) {
                          voucherDiscount = Math.floor(newSubtotal * v.discountRate)
                        }
                      }
                      const rewardDiscount = editForm.rewardDiscount || 0
                      const newFinalPrice = Math.max(0, newSubtotal - voucherDiscount - rewardDiscount)
                      setEditForm({ 
                        ...editForm, 
                        roomPrice: newRoomPrice,
                        subtotal: newSubtotal,
                        originalPrice: newSubtotal,
                        finalPrice: newFinalPrice,
                        voucherDiscount,
                      })
                    }}
                    className="h-8 py-0 px-2 text-sm bg-background border-primary/30 w-36 text-right"
                    placeholder="0"
                  />
                ) : (
                  <span className="font-medium">{formatPrice(order.roomPrice)}</span>
                )}
              </div>
            
            {/* Luôn hiển thị Dịch vụ */}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Dịch vụ</span>
                <span className="font-medium">{formatPrice(isEditing ? (editForm?.servicesTotal || 0) : order.servicesTotal)}</span>
              </div>
            
            
            <div className="flex justify-between text-sm border-t border-border/20 pt-2">
              <span className="text-muted-foreground font-medium">Tạm tính</span>
              <span className="font-bold">{formatPrice(isEditing ? (editForm?.subtotal || 0) : order.subtotal)}</span>
            </div>
            
            {order.appliedVoucher && (
              <div className="flex justify-between text-sm">
                <span className="text-emerald-600 flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Voucher: {
                    typeof order.appliedVoucher === 'string' 
                      ? order.appliedVoucher 
                      : (order.appliedVoucher?.title || order.appliedVoucher?.code || "Mã giảm giá")
                  }
                </span>
                <span className="font-bold text-emerald-600">-{formatPrice(order.voucherDiscount)}</span>
              </div>
            )}
            
            {order.appliedRewardId && (
              <div className="flex justify-between text-sm">
                <span className="text-amber-600 flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  <div className="flex flex-col">
                    <span>Ưu đãi: {order.appliedRewardTitle || order.appliedRewardId || "Phần thưởng đã đổi"}</span>
                    {order.appliedRewardDescription && <span className="text-xs text-muted-foreground italic">{order.appliedRewardDescription}</span>}
                  </div>
                </span>
                {order.rewardDiscount > 0 && (
                  <span className="font-bold text-amber-600">-{formatPrice(order.rewardDiscount)}</span>
                )}
              </div>
            )}
            
            <Separator className="bg-border/20" />
            
            <div className="flex justify-between items-center pt-1">
              <span className="text-sm font-bold text-foreground uppercase tracking-tight">Tổng thanh toán</span>
              <span className="text-2xl font-bold text-primary">{formatPrice(isEditing ? (editForm?.finalPrice || 0) : order.finalPrice)}</span>
            </div>
            
            {order.paidAmount > 0 && (
              <div className="flex justify-between text-sm mt-2 pt-2 border-t border-border/20">
                <span className="text-emerald-600 font-medium">Đã thanh toán</span>
                <span className="font-bold text-emerald-600">{formatPrice(order.paidAmount)}</span>
              </div>
            )}
          </Card>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-primary px-1">Ghi chú</h3>
          {isEditing ? (
            <Textarea 
              value={editForm?.note || ""}
              onChange={e => setEditForm(prev => prev ? {...prev, note: e.target.value} : prev)}
              placeholder="Thêm ghi chú của bạn..."
              className="text-sm bg-card border-primary/30 min-h-[100px]"
            />
          ) : (
            <Card className="p-4 border-border/50 text-sm italic text-muted-foreground bg-muted/5">
              {order.note || "Không có ghi chú"}
            </Card>
          )}
        </section>
      </main>

      {!isEditing && isStaff && (
        <div className="fixed bottom-20 left-0 right-0 px-4 flex gap-2 mx-auto w-full z-[60] bg-background/95 backdrop-blur-lg py-4 border-t border-border/30 shadow-[0_-8px_30px_rgb(0,0,0,0.12)]">
          {order.status === "Chờ xác nhận" && (
            <>
              <Button 
                className="flex-1 bg-blue-600 text-white hover:bg-blue-700 shadow-lg"
                onClick={() => handleStatusUpdate("Đã xác nhận")}
                disabled={isUpdatingStatus}
              >
                {isUpdatingStatus ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Xác nhận
              </Button>
              <Button variant="outline" className="flex-1 bg-background border-red-500/50 text-red-500 hover:bg-red-50" onClick={() => setIsCanceling(true)}>
                <Ban className="h-4 w-4 mr-2" /> Hủy
              </Button>
              <Button variant="outline" className="flex-1 bg-background border-accent/50 text-accent hover:bg-accent/10" onClick={() => setIsEditing(true)}>
                <Pencil className="h-4 w-4 mr-2" /> Sửa
              </Button>
            </>
          )}
          {order.status === "Đã xác nhận" && (
            <>
              <Button className="flex-1 bg-cyan-600 text-white hover:bg-cyan-700 shadow-lg" onClick={() => handleStatusUpdate("Đã đến")} disabled={isUpdatingStatus}>
                {isUpdatingStatus ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Đã đến
              </Button>
              <Button variant="outline" className="flex-1 bg-background border-red-500/50 text-red-500 hover:bg-red-50" onClick={() => setIsCanceling(true)}>
                <Ban className="h-4 w-4 mr-2" /> Hủy
              </Button>
              <Button variant="outline" className="flex-1 bg-background border-accent/50 text-accent hover:bg-accent/10" onClick={() => setIsEditing(true)}>
                <Pencil className="h-4 w-4 mr-2" /> Sửa
              </Button>
            </>
          )}
          {order.status === "Đã đến" && (
            <>
              <Button className="flex-1 bg-purple-600 text-white hover:bg-purple-700 shadow-lg" onClick={() => handleStatusUpdate("Đang dùng")} disabled={isUpdatingStatus}>
                {isUpdatingStatus ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                Bắt đầu
              </Button>
              <Button variant="outline" className="flex-1 bg-background border-red-500/50 text-red-500 hover:bg-red-50" onClick={() => setIsCanceling(true)}>
                <Ban className="h-4 w-4 mr-2" /> Hủy
              </Button>
              <Button variant="outline" className="flex-1 bg-background border-accent/50 text-accent hover:bg-accent/10" onClick={() => setIsEditing(true)}>
                <Pencil className="h-4 w-4 mr-2" /> Sửa
              </Button>
            </>
          )}
          {order.status === "Đang dùng" && (
            <>
              <Button className="flex-1 bg-green-600 text-white hover:bg-green-700 shadow-lg" onClick={handleCompleteOrder} disabled={isCompleting}>
                {isCompleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                Đã thanh toán
              </Button>
              <Button variant="outline" className="flex-1 bg-background border-red-500/50 text-red-500 hover:bg-red-50" onClick={() => setIsCanceling(true)}>
                <Ban className="h-4 w-4 mr-2" /> Hủy
              </Button>
              <Button variant="outline" className="flex-1 bg-background border-accent/50 text-accent hover:bg-accent/10" onClick={() => setIsEditing(true)}>
                <Pencil className="h-4 w-4 mr-2" /> Sửa
              </Button>
            </>
          )}
          {order.status === "Đã hủy" && (
            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1 bg-background border-accent/50 text-accent hover:bg-accent/10" onClick={() => setIsEditing(true)}>
                <Pencil className="h-4 w-4 mr-2" /> Sửa
              </Button>
            </div>
          )}
          {order.status === "Đã thanh toán" && (
            <div className="flex flex-col gap-2 w-full">
              {isStaff && order.pointsEarned === undefined && (
                <Button 
                  className="w-full bg-amber-600 text-white hover:bg-amber-700 shadow-lg mb-1" 
                  onClick={handleCompleteOrder} 
                  disabled={isCompleting}
                >
                  {isCompleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Bù điểm tích lũy cho khách
                </Button>
              )}
              <p className="text-xs text-muted-foreground italic flex-1 text-center py-2">Đơn hàng đã hoàn thành</p>
            </div>
          )}
        </div>
      )}

      {!isEditing && !isStaff && (
        <div className="fixed bottom-20 left-0 right-0 px-4 flex gap-3 mx-auto w-full z-[60] bg-background/95 backdrop-blur-lg py-4 border-t border-border/30 shadow-[0_-8px_30px_rgb(0,0,0,0.12)]">
          {order.status === "Chờ xác nhận" && (
            <>
              <Button variant="outline" className="flex-1 bg-background border-red-500/50 text-red-500 hover:bg-red-50" onClick={() => setIsCanceling(true)}>
                <Trash2 className="h-4 w-4 mr-2" /> Hủy đơn
              </Button>
              <Button variant="outline" className="flex-1 bg-background border-accent/50 text-accent hover:bg-accent/10" onClick={() => setIsEditing(true)}>
                <Pencil className="h-4 w-4 mr-2" /> Chỉnh sửa
              </Button>
            </>
          )}
          {order.status === "Đã hủy" && (
            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1 bg-background border-accent/50 text-accent hover:bg-accent/10" onClick={() => setIsEditing(true)}>
                <Pencil className="h-4 w-4 mr-2" /> Chỉnh sửa
              </Button>
            </div>
          )}
          {order.status === "Đã thanh toán" && (
            <div className="flex gap-2 w-full">
              <p className="text-xs text-muted-foreground italic flex-1 text-center py-2">Đơn hàng đã hoàn thành</p>
            </div>
          )}
        </div>
      )}

      {isEditing && (
        <div className="fixed bottom-20 left-0 right-0 p-4 bg-background border-t border-border/30 flex gap-3 mx-auto w-full z-[60] animate-in slide-in-from-bottom shadow-[0_-8px_30px_rgb(0,0,0,0.12)]">
          <Button variant="outline" className="flex-1" onClick={() => { setIsEditing(false); setEditForm(order); }}>
            <X className="h-4 w-4 mr-2" /> Hủy bỏ
          </Button>
          <Button className="flex-[2] bg-green-600 hover:bg-green-700 text-white shadow-lg" onClick={() => setIsConfirmingSave(true)}>
            <Check className="h-4 w-4 mr-2" /> Xác nhận
          </Button>
        </div>
      )}

      {isCanceling && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <Card className="w-full max-w-xs p-6 space-y-6 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-foreground">Xác nhận hủy đơn</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Bạn có chắc chắn muốn hủy đơn hàng <span className="font-bold text-foreground">#{order.id}</span> này không? Hành động này không thể hoàn tác.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button className="w-full bg-red-600 hover:bg-red-700 text-white font-bold" onClick={handleCancelOrder}>Đồng ý hủy</Button>
              <Button variant="ghost" className="w-full font-medium" onClick={() => setIsCanceling(false)}>Không, quay lại</Button>
            </div>
          </Card>
        </div>
      )}

      {isConfirmingSave && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <Card className="w-full max-w-xs p-6 space-y-6 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-foreground">Xác nhận thay đổi</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Bạn có chắc chắn muốn lưu các thay đổi này cho đơn hàng <span className="font-bold text-foreground">#{order.id}</span> không?
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button className="w-full bg-green-600 hover:bg-green-700 text-white font-bold" onClick={() => { handleSaveEdit(); setIsConfirmingSave(false); }}>
                Xác nhận lưu
              </Button>
              <Button variant="ghost" className="w-full font-medium" onClick={() => setIsConfirmingSave(false)}>Tiếp tục chỉnh sửa</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
