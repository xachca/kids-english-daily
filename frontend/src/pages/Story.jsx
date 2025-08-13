import {useEffect, useState} from 'react'
import {useParams} from 'react-router-dom'
import {fetchDaily, say, canASR, startASR, toast} from '../lib/util'

export default function Story(){
  const { date } = useParams()
  const [data, setData] = useState(null)
  useEffect(()=>{ fetchDaily(date).then(setData) },[date])
  if (!data) return <div style={{padding:16}}>Loading…</div>
  const lines = data.story.script_lines
  function onEcho(line){
    if(!canASR()){ say(line); return }
    startASR((t)=>{
      const ok = line.toLowerCase().split(' ').every(tok=>t.toLowerCase().includes(tok))
      toast(ok ? 'Yay!' : 'Almost!')
    })
  }
  return (
    <div style={{padding:16}}>
      <h2>📖 {data.story.title}</h2>
      {lines.map((line,i)=>(
        <div key={i} className="card" style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <div style={{fontSize:22}}>{line}</div>
          <div style={{display:'flex', gap:8}}>
            <button className="btn" onClick={()=> say(line)}>🔊 播放</button>
            <button className="btn" onClick={()=> onEcho(line)}>🗣 跟我读</button>
          </div>
        </div>
      ))}
      <div className="card">家长提示：每句读两遍：AI 一遍、孩子一遍。</div>
    </div>
  )
}