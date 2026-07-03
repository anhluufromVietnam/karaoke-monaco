"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ArrowLeft, Sparkles, History, Gift, Loader2, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useAuth } from "@/context/AuthContext"
import { cn } from "@/lib/utils"
import { getRankBySpending } from "@/lib/rank-utils"
import { ref, onValue } from "firebase/database"
import { rtdb } from "@/lib/firebase"

export default function WalletPage() {
  const { user, loading: authLoading } = useAuth()
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPoints, setCurrentPoints] = useState<number | null>(null)
  const [liveLifetimeSpent, setLiveLifetimeSpent] = useState<number | null>(null)

  // Real-time listener for lifetimeSpent
  useEffect(() => {
    if (!user?.username) {
      setLiveLifetimeSpent(null)
      return
    }

    const lifetimeRef = ref(rtdb, `users/profiles/${user.username}/lifetimeSpent`)
    const unsubscribe = onValue(lifetimeRef, (snapshot) => {
      const spent = snapshot.exists() ? snapshot.val() : 0
      setLiveLifetimeSpent(spent)
    })

    return () => unsubscribe()
  }, [user?.username])

  useEffect(() => {
    if (user?.uid) {
      setCurrentPoints(Number(user.points || 0))
      setLoading(true)

      fetch(`/api/point-history?userId=${user.uid}`)
        .then((res) => res.json())
        .then((data) => {
          setTransactions(data.history || [])
          setCurrentPoints(Number(data.points ?? user.points ?? 0))
        })
        .catch((error) => {
          console.error("Error fetching point history:", error)
          setCurrentPoints(Number(user.points || 0))
        })
        .finally(() => setLoading(false))
    } else {
      setCurrentPoints(0)
      setTransactions([])
      setLoading(false)
    }
  }, [user?.uid, user?.points])

  if (authLoading) return <div className="min-h-screen flex items-center justify-center italic text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Đang tải...</div>

  const userPoints = Number(currentPoints ?? user?.points ?? 0)
  const lifetimeSpent = liveLifetimeSpent ?? 0
  const rank = getRankBySpending(lifetimeSpent)

  const formatDateTime = (timestamp: number) => {
    if (!timestamp) return ""
    const d = new Date(timestamp)
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`
  }

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      {/* Enhanced Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border/30">
        <div className="flex items-center gap-4 px-5 py-5">
          <Link href="/home">
            <Button variant="ghost" size="icon" className="h-12 w-12 rounded-full text-foreground hover:bg-accent/50">
              <ArrowLeft className="h-6 w-6" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Ví điểm Monaco</h1>
        </div>
      </header>

      <main className="flex-1 p-5 space-y-[1cm]">
        {/* Enhanced Balance Card */}
        <Card className="relative overflow-hidden p-8 bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground shadow-xl border-none">
          <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative space-y-5">
            <div className="flex items-center gap-3">
              <Sparkles className="h-6 w-6 text-yellow-300" />
              <span className="text-sm font-bold uppercase tracking-widest opacity-80">Tổng điểm hiện có</span>
            </div>
            <div className="flex items-baseline gap-3">
              <h2 className="text-5xl font-black tracking-tight">{userPoints.toLocaleString() || 0}</h2>
              <span className="text-xl font-medium opacity-80 text-yellow-300">điểm</span>
            </div>
            <div className="pt-3 flex gap-3 text-sm font-bold uppercase tracking-wider">
               <div className={cn("bg-white/20 px-3 py-1.5 rounded", rank.color)}>Hạng: {rank.label}</div>
               {userPoints > 0 && <div className="bg-white/20 px-3 py-1.5 rounded">Hạn: Vĩnh viễn</div>}
               {userPoints === 0 && <div className="bg-white/20 px-3 py-1.5 rounded">Tích điểm để lên hạng</div>}
            </div>
          </div>
        </Card>

        {/* Enhanced Quick Actions */}
        <Link href="/wallet/point-exchange" className="block">
          <Button className="w-full h-16 rounded-2xl bg-primary hover:bg-primary/90 gap-3 font-bold text-base shadow-sm active:scale-95 transition-all">
            <Gift className="h-6 w-6" />
            Yêu cầu đổi điểm
          </Button>
        </Link>

        {/* Transaction History - Đồng bộ từ Firebase */}
        <section className="space-y-[1cm]">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <History className="h-5 w-5" /> Lịch sử điểm
            </h3>
          </div>

          <Card className="divide-y divide-border/30 border-border/50 overflow-hidden shadow-sm">
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" /></div>
            ) : transactions.length > 0 ? (
              transactions.map((t) => {
                const isEarn = t.type === "earn"
                return (
                  <div key={t.id} className="flex items-center gap-4 p-5 bg-card">
                    <div className={cn(
                      "h-12 w-12 rounded-xl flex items-center justify-center shrink-0",
                      isEarn ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"
                    )}>
                      {isEarn ? <Sparkles className="h-6 w-6" /> : <ShoppingBag className="h-6 w-6" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-base text-foreground truncate">{t.description}</h4>
                      <p className="text-sm text-muted-foreground italic">
                        {formatDateTime(t.timestamp)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={cn(
                        "font-black text-lg",
                        isEarn ? "text-green-600" : "text-red-600"
                      )}>
                        {isEarn ? "+" : "-"}{t.points.toLocaleString()}
                      </span>
                      <p className="text-xs font-medium text-muted-foreground uppercase">điểm</p>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="py-12 text-center flex flex-col items-center gap-2">
                <Sparkles className="h-10 w-10 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground italic">Chưa có lịch sử giao dịch</p>
              </div>
            )}
          </Card>
        </section>
      </main>
    </div>
  )
}
