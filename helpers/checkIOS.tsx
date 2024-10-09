import { useState, useEffect } from 'react'
import moment from 'moment'

// interface Navigator {
//   standalone: any
//   isIOS: any
// }

function checkForIOS() {
  if ((navigator as any).standalone) {
    return false
  }

  const today = moment().toDate()
  const lastPrompt = moment(localStorage.getItem('installPrompt'))
  const days = moment(today).diff(lastPrompt, 'days')
  const ua = window.navigator.userAgent
  const webkit = !!ua.match(/WebKit/i)
  const isIPad = !!ua.match(/iPad/i)
  const isIPhone = !!ua.match(/iPhone/i)
  const isIOS = isIPad || isIPhone
  const isSafari = isIOS && webkit && !ua.match(/CriOS/i)

  const prompt = (isNaN(days) || days > 30) && isIOS && isSafari

  if (prompt && 'localStorage' in window) {
    //change the date object to the string
    localStorage.setItem('installPrompt', JSON.stringify(today))
  }

  // console.log(JSON.stringify(today))
  return { isIOS, isSafari, prompt }
}

export default function useIsIOS() {
  const [isIOS, setIsIOS] = useState<any>({})

  useEffect(() => {
    setIsIOS(checkForIOS())
    return () => console.log('CLEANUP INSTALL PROMPT', isIOS)
  }, [])

  return isIOS
}
