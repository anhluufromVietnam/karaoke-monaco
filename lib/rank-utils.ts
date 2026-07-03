/**
 * Rank calculation based on lifetime spending (VND)
 * Once a user reaches a spending threshold, they keep that rank forever.
 */

export interface RankInfo {
  label: string
  color: string
  required: string
}

export function getRankBySpending(lifetimeSpent: number): RankInfo {
  if (lifetimeSpent >= 100_000_000) return { label: "Kim Cương", color: "text-blue-400", required: "100 triệu" }
  if (lifetimeSpent >= 30_000_000) return { label: "Vàng", color: "text-yellow-500", required: "30 triệu" }
  if (lifetimeSpent >= 10_000_000) return { label: "Bạc", color: "text-slate-400", required: "10 triệu" }
  return { label: "Thành viên", color: "text-primary", required: "0" }
}

export function getNextRankBySpending(lifetimeSpent: number): RankInfo | null {
  const ranks: { threshold: number; label: string; color: string; required: string }[] = [
    { threshold: 10_000_000, label: "Bạc", color: "text-slate-400", required: "10 triệu" },
    { threshold: 30_000_000, label: "Vàng", color: "text-yellow-500", required: "30 triệu" },
    { threshold: 100_000_000, label: "Kim Cương", color: "text-blue-400", required: "100 triệu" },
  ]
  
  for (const rank of ranks) {
    if (lifetimeSpent < rank.threshold) {
      return rank
    }
  }
  return null
}