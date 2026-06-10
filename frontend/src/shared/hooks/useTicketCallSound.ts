import { useCallback, useRef, useState } from 'react'
import notificationSoundUrl from '../../assets/message-notification-sound-imassage-on-iphone.mp3'

type TicketCallSoundStatus = 'idle' | 'ready' | 'blocked'

export function useTicketCallSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [soundStatus, setSoundStatus] = useState<TicketCallSoundStatus>('idle')

  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      const audio = new Audio(notificationSoundUrl)
      audio.preload = 'auto'
      audioRef.current = audio
    }

    return audioRef.current
  }, [])

  const playSound = useCallback(async () => {
    const audio = getAudio()

    try {
      audio.pause()
      audio.currentTime = 0
      await audio.play()
      setSoundStatus('ready')
      return true
    } catch {
      setSoundStatus('blocked')
      return false
    }
  }, [getAudio])

  return {
    enableSound: playSound,
    isSoundBlocked: soundStatus === 'blocked',
    isSoundReady: soundStatus === 'ready',
    playSound,
  }
}
