"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { Bell, Mic2, Sparkles, UtensilsCrossed, ChevronRight, Crown, Calendar, Clock, Ticket } from "lucide-react"
import { onValue, ref } from "firebase/database"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useAuth } from "@/context/AuthContext"
import { rtdb } from "@/lib/firebase"
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel"

const serviceIcons: Record<string, any> = {
  karaoke: Mic2,
  massage: Sparkles,
  restaurant: UtensilsCrossed,
}

const staticRooms = [
  { id: "1", name: "Karaoke", type: "karaoke", desc: "Phòng VIP cao cấp" },
  { id: "3", name: "Massage", type: "massage", desc: "Thư giãn tuyệt đối" },
  { id: "5", name: "Nhà hàng", type: "restaurant", desc: "Ẩm thực đẳng cấp" },
]

export default function HomePage() {
  const [featuredPromos, setFeaturedPromos] = useState<any[]>([])
  const [otherPromos, setOtherPromos] = useState<any[]>([])
  const [bannerApi, setBannerApi] = useState<CarouselApi>()
  const [cardApi, setCardApi] = useState<CarouselApi>()
  const [otherCardApi, setOtherCardApi] = useState<CarouselApi>()
  const [unreadCount, setUnreadCount] = useState(0)
  const [livePoints, setLivePoints] = useState<number | null>(null)
  const { user, loading } = useAuth()

  // Real-time listener for points updates
  useEffect(() => {
    if (!user?.username) {
      setLivePoints(null)
      return
    }

    const pointsRef = ref(rtdb, `users/profiles/${user.username}/points`)
    const unsubscribe = onValue(pointsRef, (snapshot) => {
      const points = snapshot.exists() ? snapshot.val() : 0
      setLivePoints(points)
    })

    return () => unsubscribe()
  }, [user?.username])

  useEffect(() => {
    const loadPromos = async () => {
      try {
        const res = await fetch("/api/promotions")
        const data = await res.json()
        if (res.ok) {
          const now = new Date()
          const active = (data.promotions || []).filter((p: any) => {
            if (!p.isActive) return false
            if (p.endDate) try { return new Date(p.endDate) >= now } catch { return true }
            return true
          })
          setFeaturedPromos(active.filter((p: any) => p.featured).slice(0, 5))
          setOtherPromos(active.filter((p: any) => !p.featured).slice(0, 5))
        }
      } catch (e) {
        console.error("Error loading promos:", e)
      }
    }
    loadPromos()
  }, [])

  useEffect(() => {
    if (!user?.uid) {
      setUnreadCount(0)
      return
    }

    const userNotificationsRef = ref(rtdb, `notifications/personal/${user.uid}`)
    const notificationsRef = ref(rtdb, "notifications/global")
    const userNotificationReadRef = ref(rtdb, `notifications/readStatus/${user.uid}`)

    let userData: Record<string, any> = {}
    let globalData: Record<string, any> = {}
    let readData: Record<string, any> = {}

    const recalc = () => {
      let count = 0
      Object.values(userData).forEach((item: any) => { if (!item?.read) count += 1 })
      Object.keys(globalData).forEach((key) => { if (!readData?.[key]) count += 1 })
      setUnreadCount(count)
    }

    const unsubUser = onValue(userNotificationsRef, (snapshot) => { userData = snapshot.val() || {}; recalc() })
    const unsubGlobal = onValue(notificationsRef, (snapshot) => { globalData = snapshot.val() || {}; recalc() })
    const unsubRead = onValue(userNotificationReadRef, (snapshot) => { readData = snapshot.val() || {}; recalc() })

    return () => { unsubUser(); unsubGlobal(); unsubRead() }
  }, [user?.uid])

  useEffect(() => {
    if (!bannerApi) return
    const timer = setInterval(() => bannerApi.scrollNext(), 4000)
    return () => clearInterval(timer)
  }, [bannerApi])

  useEffect(() => {
    if (!cardApi) return
    const timer = setInterval(() => cardApi.scrollNext(), 3500)
    return () => clearInterval(timer)
  }, [cardApi])

  useEffect(() => {
    if (!otherCardApi) return
    const timer = setInterval(() => otherCardApi.scrollNext(), 3500)
    return () => clearInterval(timer)
  }, [otherCardApi])

  return (
    <div className="min-h-screen bg-background">
      {/* Enhanced Header with Avatar + Points */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border/30">
        <div className="app-container py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shrink-0">
                <Crown className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Xin chào</p>
                <h1 className="text-2xl font-bold text-foreground">
                  {loading ? "..." : (user?.username || user?.name || "Khách")}
                </h1>
              </div>
            </div>
            <Link href="/notifications">
              <Button variant="ghost" size="icon" className="relative h-10 w-10 rounded-full">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-6 min-w-[24px] items-center justify-center rounded-full bg-red-500 px-1.5 text-sm text-white font-bold">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Button>
            </Link>
          </div>
          <Link href="/wallet" className="block">
            <Card className="relative px-6 bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-yellow-500 h-[6cm] mb-[1cm] overflow-hidden">
              {/* Decorative circles */}
              <div className="absolute -top-6 -right-6 h-20 w-20 rounded-full bg-amber-400/20 blur-xl" />
              <div className="absolute -bottom-4 -left-4 h-16 w-16 rounded-full bg-amber-500/15 blur-lg" />
              <div className="absolute top-2 right-8 h-3 w-3 rounded-full bg-amber-400/40" />
              <div className="absolute bottom-6 left-10 h-2 w-2 rounded-full bg-amber-500/30" />
              <div className="absolute top-1/2 left-3 h-1.5 w-1.5 rounded-full bg-amber-400/25" />
              {/* Decorative sparkle icons */}
              <div className="absolute top-3 left-6 text-amber-400/20">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="absolute bottom-4 right-8 text-amber-400/15 rotate-12">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex flex-col items-center justify-center h-full gap-2 relative z-10">
                <div className="relative">
                  <Sparkles className="h-8 w-8 text-amber-600" />
                  <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-amber-400 animate-ping" />
                </div>
                <p className="text-sm text-muted-foreground">Điểm của bạn</p>
                <p className="text-3xl font-bold text-amber-600">
                  {(livePoints ?? user?.points ?? 0).toLocaleString()}
                </p>
              </div>
            </Card>
          </Link>
        </div>
      </header>

      <main className="app-container space-y-6 pb-24">
        {/* Banner Carousel - Vertical/16:9 ratio */}
        {featuredPromos.length > 0 && (
          <Carousel setApi={setBannerApi} opts={{ loop: true }} className="w-full">
            <CarouselContent className="-ml-0">
              {featuredPromos.map((promo: any) => (
                <CarouselItem key={promo.id} className="pl-0">
                  <Link href={`/promotions/${promo.id}`} className="block relative overflow-hidden rounded-2xl aspect-[16/9]">
                    <Image src={promo.imageUrl} alt={promo.title} fill className="object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-5">
                      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-amber-300">{promo.title}</p>
                      <h2 className="mb-3 text-2xl font-bold text-white">{promo.subtitle}</h2>
                      <Button size="default" className="bg-amber-500 hover:bg-amber-600 text-white">Xem ngay</Button>
                    </div>
                  </Link>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        )}

        {/* Services - Feature Cards */}
        <section>
          <h3 className="mb-5 text-2xl font-bold text-foreground">Dịch vụ của chúng tôi</h3>
          <div className="grid grid-cols-3 gap-4">
            {staticRooms.map((room) => {
              const Icon = serviceIcons[room.type] || Mic2
              return (
                <Link key={room.id} href={`/rooms/${room.id}`} className="flex flex-col items-center gap-3 animate-in fade-in zoom-in duration-300">
                  <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 text-amber-500 shadow-lg transition-all hover:border-amber-500/50 hover:shadow-amber-500/20">
                    <Icon className="h-10 w-10" />
                  </div>
                  <div className="text-center">
                    <span className="text-base font-semibold text-foreground block">{room.name}</span>
                    <span className="text-sm text-muted-foreground">{room.desc}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>

        {/* Featured Promos - Horizontal Scroll Cards */}
        {featuredPromos.length > 0 && (
          <section>
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <span className="text-3xl">🌟</span> Khuyến mãi nổi bật
              </h3>
              <Link href="/promotions" className="flex items-center gap-1 text-base text-primary font-medium">
                Xem tất cả <ChevronRight className="h-5 w-5" />
              </Link>
            </div>
            <Carousel setApi={setCardApi} opts={{ loop: true }} className="w-full">
              <CarouselContent className="-ml-[0.5cm]">
                {featuredPromos.map((promo: any) => {
                  const sd = promo.startDate ? new Date(promo.startDate).toLocaleDateString("vi-VN") : null
                  const ed = promo.endDate ? new Date(promo.endDate).toLocaleDateString("vi-VN") : null
                  return (
                    <CarouselItem key={promo.id} className="pl-[0.5cm] basis-full">
                      <Link href={`/promotions/${promo.id}`} className="block group">
                        <Card className="overflow-hidden border-primary/30 shadow-lg rounded-[2rem] bg-card border-2 group-hover:border-primary transition-all p-0 flex flex-col">
                          <div className="relative h-[4cm] w-full">
                            <Image src={promo.imageUrl} alt={promo.title} fill className="object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                            <div className="absolute top-2 left-3">
                              <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1 rounded-full">
                                🔥 Nổi bật
                              </span>
                            </div>
                            <div className="absolute bottom-2 left-4 right-4">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-0.5">Khuyến mãi</p>
                              <h3 className="text-base font-bold text-white leading-tight uppercase tracking-tighter">{promo.title}</h3>
                              <p className="text-xs font-semibold text-primary/90 tracking-tight">{promo.subtitle}</p>
                            </div>
                          </div>
                          <div className="h-[2cm] p-3 bg-card space-y-1.5 flex flex-col justify-center">
                            <p className="text-xs text-muted-foreground line-clamp-1 italic">{promo.content}</p>
                            {sd && (
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" /> {sd}
                                </span>
                                {ed && (
                                  <>
                                    <span>→</span>
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" /> {ed}
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </Card>
                      </Link>
                    </CarouselItem>
                  )
                })}
              </CarouselContent>
            </Carousel>
          </section>
        )}

        {/* Other Promos - Horizontal Scroll Cards */}
        {otherPromos.length > 0 && (
          <section>
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-amber-500" /> Khuyến mãi khác
              </h3>
              <Link href="/promotions" className="flex items-center gap-1 text-base text-primary font-medium">
                Xem tất cả <ChevronRight className="h-5 w-5" />
              </Link>
            </div>
            <Carousel setApi={setOtherCardApi} opts={{ loop: true }} className="w-full">
              <CarouselContent className="-ml-[0.5cm]">
                {otherPromos.map((promo: any) => {
                  const sd = promo.startDate ? new Date(promo.startDate).toLocaleDateString("vi-VN") : null
                  const ed = promo.endDate ? new Date(promo.endDate).toLocaleDateString("vi-VN") : null
                  return (
                    <CarouselItem key={promo.id} className="pl-[0.5cm] basis-full">
                      <Link href={`/promotions/${promo.id}`} className="block group">
                        <Card className="overflow-hidden shadow-md rounded-[2rem] group-hover:border-primary/50 bg-card p-0 shadow-lg flex flex-col">
                          <div className="relative h-[4cm] w-full">
                            <Image src={promo.imageUrl} alt={promo.title} fill className="object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                            <div className="absolute bottom-2 left-4 right-4">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-0.5">Khuyến mãi</p>
                              <h3 className="text-base font-bold text-white leading-tight uppercase tracking-tighter">{promo.title}</h3>
                              <p className="text-xs font-semibold text-primary/90 tracking-tight">{promo.subtitle}</p>
                            </div>
                            <div className="absolute top-2 right-3 h-7 w-7 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-primary shadow-lg">
                              <Ticket className="h-4 w-4" />
                            </div>
                          </div>
                          <div className="h-[2cm] p-3 bg-card space-y-1.5 flex flex-col justify-center">
                            <p className="text-xs text-muted-foreground line-clamp-1 italic leading-relaxed">{promo.content}</p>
                            {sd && (
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" /> {sd}
                                </span>
                                {ed && (
                                  <>
                                    <span>→</span>
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" /> {ed}
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </Card>
                      </Link>
                    </CarouselItem>
                  )
                })}
              </CarouselContent>
            </Carousel>
          </section>
        )}
      </main>
    </div>
  )
}