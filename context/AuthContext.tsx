"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { auth, rtdb } from "@/lib/firebase"
import { onAuthStateChanged } from "firebase/auth"
import { ref, onValue, off } from "firebase/database"

interface AuthContextType {
  user: any | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true })

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let unsubscribeRTDB: (() => void) | null = null
    let unsubscribeMapping: (() => void) | null = null

    const attachUserListener = async (firebaseUser: any) => {
      // Dọn dẹp triệt để các listener cũ
      if (unsubscribeRTDB) { unsubscribeRTDB(); unsubscribeRTDB = null; }
      if (unsubscribeMapping) { unsubscribeMapping(); unsubscribeMapping = null; }

      if (!firebaseUser) {
        setUser(null)
        setLoading(false)
        return
      }

      // Nếu đã có thông tin user cơ bản, cho phép render ngay để tránh chặn màn hình
      setUser((prev: any) => prev?.uid === firebaseUser.uid ? prev : { uid: firebaseUser.uid, email: firebaseUser.email, loading: true })

      try {
        // Lắng nghe mapping UID -> Username một cách real-time
        const mappingRef = ref(rtdb, `users/uidMap/${firebaseUser.uid}`)
        
        unsubscribeMapping = onValue(mappingRef, (mappingSnapshot) => {
          const userKey = mappingSnapshot.exists() ? mappingSnapshot.val() : null

          if (!userKey) {
            // Trường hợp user mới đăng ký, chưa kịp có dữ liệu mapping trong DB
            setUser({ uid: firebaseUser.uid, email: firebaseUser.email, name: firebaseUser.displayName || "", points: 0 })
            setLoading(false)
            return
          }

          // Nếu đã có mapping, tạo listener để lắng nghe node thông tin chi tiết
          if (unsubscribeRTDB) unsubscribeRTDB()
          
          const userRef = ref(rtdb, `users/profiles/${userKey}`)
          unsubscribeRTDB = onValue(userRef, (snapshot) => {
            if (snapshot.exists()) {
              const userData = snapshot.val()
              setUser({
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                username: userKey, // Thêm username từ userKey
                ...userData, // Bao gồm name, phoneNumber, points...
              })
            } else {
              setUser({ uid: firebaseUser.uid, email: firebaseUser.email, name: firebaseUser.displayName || "", points: 0 })
            }
            setLoading(false)
          })
        })
      } catch (error) {
        console.error("Failed to load user profile:", error)
        setUser({ uid: firebaseUser.uid, email: firebaseUser.email, name: firebaseUser.displayName || "", points: 0 })
        setLoading(false)
      }
    }

    // Sau khi user đã load xong, gọi API để đồng bộ lịch sử điểm
    const syncPointHistory = async (uid: string) => {
      try {
        const response = await fetch(`/api/point-history?userId=${uid}`)
        if (response.ok) {
          const data = await response.json()
          // API đã tự động cập nhật points trong RTDB, listener sẽ tự động cập nhật UI
          console.log("Point history synced:", data.points, "points")
        }
      } catch (error) {
        console.error("Failed to sync point history:", error)
      }
    }

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      attachUserListener(firebaseUser)
      
      // Nếu user đăng nhập thành công, đồng bộ lịch sử điểm
      if (firebaseUser) {
        // Đợi một chút để đảm bảo user profile đã được load
        setTimeout(() => {
          syncPointHistory(firebaseUser.uid)
        }, 1000)
      }
    })

    return () => {
      unsubscribeAuth()
      if (unsubscribeRTDB) unsubscribeRTDB()
      if (unsubscribeMapping) unsubscribeMapping()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)