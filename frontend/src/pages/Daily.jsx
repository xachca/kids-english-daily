import {useEffect, useState} from 'react'
import {useParams} from 'react-router-dom'
import {fetchDaily, say, toast} from '../lib/util'

export default function Daily(){
  const { date } = useParams()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  useEffect(()=>{ fetchDaily(date).then(setData).catch(e=>setErr(e.message)) },[date])
  if (err) return <div style={{padding:16}}>⚠️ {err}</div>
  if (!data) return <div style={{padding:16}}>Loading…</div>
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return (
    <div style={{padding:16}}>
      <h2>📅 {data.date} · 主题：{data.theme}</h2>
      <section>
        <h3>🔤 高频单词</h3>
        <div className="grid">
        {data.words.map(w=> (
          <div className="card" key={w.text}>
            <img className="img" src={base + w.image} alt={w.text} />
            <div style={{fontSize:26,fontWeight:700}}>{w.text}</div>
            <button className="btn" onClick={()=>{ say(w.text); toast('Listen and repeat!')}}>🔊 发音</button>
            <div style={{color:'#666',marginTop:8,fontSize:14}}>{w.hint_cn}</div>
          </div>
        ))}
        </div>
      </section>
      <section>
        <h3>🗣 生活短句</h3>
        <div className="grid">
        {data.sentences.map((s, idx)=>(
          <div className="card" key={idx}>
            <div style={{fontSize:20, marginBottom:8}}>{s.text}</div>
            <button className="btn" onClick={()=> say(s.text)}>🔊 跟读</button>
          </div>
        ))}
        </div>
      </section>
      <section>
        <h3>💡 家长提示</h3>
        <div className="card">每个词别练太久，1–2 分钟即可，多看图多指物。</div>
      </section>
    </div>
  )
}