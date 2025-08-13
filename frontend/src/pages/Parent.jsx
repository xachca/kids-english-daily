import {useEffect, useState} from 'react'
import {useParams} from 'react-router-dom'
import {fetchDaily} from '../lib/util'

export default function Parent(){
  const { date } = useParams()
  const [data, setData] = useState(null)
  useEffect(()=>{ fetchDaily(date).then(setData) },[date])
  if (!data) return <div style={{padding:16}}>Loading…</div>
  return (
    <div style={{padding:16}}>
      <h2>👨‍👩‍👧 亲子互动任务</h2>
      <div className="grid">
        {data.parent_cards.map((c,idx)=>(
          <div className="card" key={idx}>
            <div><b>中文：</b>{c.cn}</div>
            <div><b>English：</b>{c.en}</div>
            <div style={{color:'#666'}}>{c.tip}</div>
          </div>
        ))}
      </div>
      <div className="card" style={{marginTop:12}}>家长提示：把英语融入生活，比如吃水果前说一句。</div>
    </div>
  )
}