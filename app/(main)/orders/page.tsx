"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Sparkles, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useAuth } from "@/context/AuthContext"
import { rtdb } from "@/lib/firebase"
import { ref, onValue, query, orderByChild, equalTo } from "firebase/database"
import { BookingStatus } from "@/lib/database-schema"

const filters = ["Tất cả", "Chờ xác nhận", "Đã xác nhận", "Chờ đến", "Đã đến", "Đang dùng", "Chờ thanh toán", "Đã thanh toán", "Đã hủy"]

const roomMapping: Record<string, any> = {
  karaoke: { name: "Karaoke VIP", image: "/images/vip1.jpg" },
  massage: { name: "Massage Monaco", image: "/images/monaco1.jpg" },
  restaurant: { name: "Nhà hàng Monaco", image: "/images/bg-intro.jpg" }
}

interface Order {
  id: string
  room: string
  date: string
  time: string
  status: BookingStatus
  originalPrice: number
  finalPrice: number
  paidAmount: number
  image: string
  points: number
  pointsEarned?: number // Thêm trường này để lưu điểm đã tích lũy thực tế
  hasVoucher: boolean
  hasReward: boolean
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("vi-VN").format(price) + "đ"
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

export default function OrdersPage() {
  const { user } = useAuth()
  const [activeFilter, setActiveFilter] = useState("Tất cả")
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.uid) {
      setOrders([])
      setLoading(false)
      return
    }

    const bookingsRef = query(
      ref(rtdb, 'bookings'),
      orderByChild('userId'),
      equalTo(user.uid)
    )

    const unsubscribe = onValue(bookingsRef, (snapshot) => {
      try {
        if (snapshot.exists()) {
          const data = snapshot.val()
          const fetchedOrders = Object.entries(data).map(([key, val]: [string, any]) => {
            const roomInfo = roomMapping[val.type] || roomMapping.karaoke
            const roomPrice = Number(val.totalEst || val.roomPrice || 0)
            const services = val.services || val.items || []
            const svcTotal = services.reduce((sum: number, s: any) => sum + (s.price * (s.quantity || s.qty || 1)), 0)
            const paidAmount = Number(val.paidAmount || 0)
            
            // Đồng bộ cách tính subtotal với Admin để hiển thị điểm chính xác
            const subtotal = Math.max(roomPrice + svcTotal, paidAmount, Number(val.totalAmount || 0))
            
            let voucherDiscount = 0
            if (val.appliedVoucher) {
              if (val.appliedVoucher.discountAmount) {
                voucherDiscount = Math.min(val.appliedVoucher.discountAmount, subtotal)
              } else if (val.appliedVoucher.discountRate) {
                voucherDiscount = Math.floor(subtotal * val.appliedVoucher.discountRate)
              }
            }
            
            const rewardDiscount = Number(val.appliedRewardDiscount || 0)
            const clientComputedFinalAmount = Math.max(0, subtotal - voucherDiscount - rewardDiscount)
            const finalAmountForDisplay = Number(val.finalAmount || clientComputedFinalAmount)

            return {
              id: key,
              room: roomInfo.name,
              date: val.bookingDate,
              time: val.bookingTime,
              status: ((val.status === "pending" ? "Chờ xác nhận" : val.status) || "Chờ xác nhận") as BookingStatus,
              originalPrice: subtotal,
              finalPrice: finalAmountForDisplay,
              paidAmount: Number(val.paidAmount || 0),
              image: roomInfo.image,
              points: isNaN(finalAmountForDisplay) || finalAmountForDisplay <= 0 ? 0 : Math.floor(finalAmountForDisplay / 10000),
              pointsEarned: val.pointsEarned,
              hasVoucher: !!val.appliedVoucher,
              hasReward: !!val.appliedRewardId,
              createdAt: val.createdAt || 0,
            }
          }).sort((a, b) => b.createdAt - a.createdAt)
          setOrders(fetchedOrders)
        } else {
          setOrders([])
        }
      } catch (error) {
        console.error("Error syncing orders:", error)
        setError("Lỗi đồng bộ dữ liệu.")
      } finally {
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [user?.uid])

  const filteredOrders = orders.filter((order) => {
    if (activeFilter === "Tất cả") return true
    if (activeFilter === "Chờ xác nhận") return order.status === "Chờ xác nhận"
    if (activeFilter === "Đã xác nhận") return order.status === "Đã xác nhận"
    if (activeFilter === "Chờ đến") return order.status === "Chờ đến"
    if (activeFilter === "Đã đến") return order.status === "Đã đến"
    if (activeFilter === "Đang dùng") return order.status === "Đang dùng"
    if (activeFilter === "Chờ thanh toán") return order.status === "Chờ thanh toán"
    if (activeFilter === "Đã thanh toán") return order.status === "Đã thanh toán"
    if (activeFilter === "Đã hủy") return order.status === "Đã hủy"
    return true
  })

  return (
    <div className="min-h-screen">
      {/* Enhanced Header */}
      <header className="sticky top-0 z-40 border-b border-border/30 bg-background/95 backdrop-blur-lg">
        <div className="w-full px-5 py-5">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Đơn của tôi</h1>
        </div>
      </header>

      <main className="mx-auto w-full space-y-[1cm] px-5 py-5">
        {/* Enhanced Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-5 px-5 snap-x snap-mandatory">
          {filters.map((filter) => (
            <Button
              key={filter}
              variant="outline"
              size="sm"
              onClick={() => setActiveFilter(filter)}
              className={cn(
                "rounded-full border-border/50 shrink-0 snap-start text-sm",
                activeFilter === filter
                  ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-card hover:border-primary/50"
              )}
            >
              {filter}
            </Button>
          ))}
        </div>

        {/* Enhanced Order List */}
        <div className="space-y-[1cm] flex flex-col">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground italic">
              <Loader2 className="h-10 w-10 animate-spin mb-2" />
              <p className="text-base">Đang tải đơn hàng...</p>
            </div>
          ) : filteredOrders.map((order) => {
            const status = getStatusLabel(order.status)
            return (
              <Link key={order.id} href={`/orders/${order.id}`}>
                <Card className="border-border/50 bg-card p-6 transition-all hover:border-primary/50 hover:shadow-lg shadow-sm active:scale-[0.98] min-h-[6cm]">
                  <div className="flex gap-5">
                    <Image
                      src={order.image}
                      alt={order.room}
                      width={140}
                      height={140}
                      className="h-32 w-32 shrink-0 rounded-xl object-cover"
                    />
                    <div className="flex flex-1 flex-col justify-between">
                      <div>
                        <h3 className="font-bold text-xl text-foreground">
                          {order.room}
                        </h3>
                        <p className="text-base text-muted-foreground">
                          {order.date} - {order.time}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-block rounded px-3 py-1 text-sm font-medium",
                              status.color
                            )}
                          >
                            {status.text}
                          </span>
                          <span className={cn(
                            "flex items-center gap-1.5 text-sm font-bold px-2 py-1 rounded",
                            order.status === "Đã thanh toán" && order.pointsEarned !== undefined ? "text-green-600 bg-green-600/10" : "text-accent bg-accent/10"
                          )}>
                            <Sparkles className={cn("h-4 w-4", order.status !== "Đã thanh toán" && "animate-pulse")} />
                            +{order.status === "Đã thanh toán" && order.pointsEarned !== undefined ? order.pointsEarned : order.points} điểm
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {order.status === "Đã thanh toán" && order.paidAmount > 0 ? (
                          <span className="font-bold text-lg text-green-600">
                            {formatPrice(order.paidAmount)}
                          </span>
                        ) : (
                          <>
                            {order.originalPrice !== order.finalPrice && (
                              <span className="text-base text-muted-foreground line-through">
                                {formatPrice(order.originalPrice)}
                              </span>
                            )}
                            <span className="font-bold text-lg text-primary">
                              {formatPrice(order.finalPrice)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            )
          })}

          {!loading && error && (
            <div className="py-10 text-center text-red-500 text-base italic">
              {error}
            </div>
          )}
        </div>

        {!loading && !error && filteredOrders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center animate-in fade-in zoom-in duration-500">
            <div className="h-28 w-28 rounded-full bg-primary/5 flex items-center justify-center mb-6 shadow-inner">
              <Sparkles className="h-14 w-14 text-primary/20" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-3">Chưa có đơn hàng nào</h3>
            <p className="text-base text-muted-foreground italic leading-relaxed mb-8 max-w-[280px]">
              {activeFilter === "Tất cả" 
                ? "Bạn vẫn chưa có lịch hẹn nào. Hãy khám phá các dịch vụ đẳng cấp của chúng tôi ngay!" 
                : `Không tìm thấy đơn hàng nào ở trạng thái "${activeFilter}".`}
            </p>
            <Link href="/rooms">
              <Button className="bg-accent text-accent-foreground font-bold rounded-xl px-8 py-6 text-base shadow-lg shadow-accent/20 active:scale-95 transition-all">
                Đặt lịch ngay
              </Button>
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
