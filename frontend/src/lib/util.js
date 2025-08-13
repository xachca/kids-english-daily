export async function fetchDaily(dateStr){
  const d = dateStr || new Date().toISOString().slice(0,10)
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const url = `${base}/daily/${d}.json`
  const res = await fetch(url)
  if (!res.ok) throw new Error('DailyPack not found for '+d)
  return res.json()
}
export function say(text){
  if ('speechSynthesis' in window){
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'; window.speechSynthesis.speak(u)
  }else{ alert(text) }
}
export function toast(msg='Yay!'){
  const el = document.getElementById('toast'); if(!el) return
  el.textContent = msg; el.style.display = 'block'
  setTimeout(()=> el.style.display='none', 1200)
}
export function canASR(){ return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window }
export function startASR(onText){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) return null
  const rec = new SR(); rec.lang='en-US'; rec.interimResults=false; rec.maxAlternatives=1
  rec.onresult = (e)=> onText(e.results[0][0].transcript)
  rec.start(); return rec
}