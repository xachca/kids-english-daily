import {useEffect, useState} from 'react'
import {useParams} from 'react-router-dom'
import {fetchDaily, toast} from '../lib/util'

export default function Games(){
  const { date } = useParams()
  const [data, setData] = useState(null)
  const [pairs, setPairs] = useState([])
  const [done, setDone] = useState(0)

  useEffect(()=>{ 
    fetchDaily(date).then(d=>{
      setData(d)
      setPairs(d.words.map(w=>({word:w.text, image:w.image, matched:false})))
    }) 
  },[date])

  if (!data) return <div style={{padding:16}}>Loading…</div>

  function onDrop(ev, word){
    ev.preventDefault()
    const payload = ev.dataTransfer.getData('text/plain')
    if (payload===word){
      setPairs(ps => ps.map(p=> p.word===word ? {...p, matched:true} : p))
      setDone(x=>x+1); toast('Great job!')
    }else{
      toast('Almost!')
    }
  }

  // 关键修复：BASE_URL 绝对化
  const baseAbs = new URL(import.meta.env.BASE_URL, window.location.origin).toString()

  return (
    <div style={{padding:16}}>
      <h2>🎮 配对游戏</h2>

      <div className="grid">
        <div className="card">
          <h3>拖动单词到正确的图片</h3>
          <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            {pairs.map(p=> (
              <div key={p.word}
                   draggable
                   onDragStart={(e)=> e.dataTransfer.setData('text/plain', p.word)}
                   className="btn"
                   style={{opacity: p.matched?0.4:1, pointerEvents: p.matched?'none':'auto'}}>{p.word}</div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>图片区</h3>
          <div className="grid">
            {pairs.map(p=> (
              <div key={p.word}
                   onDragOver={(e)=>e.preventDefault()}
                   onDrop={(e)=>onDrop(e,p.word)}
                   style={{border:'2px dashed #ccc', borderRadius:12, padding:8}}>
                   <img
                     className="img"
                     src={new URL(p.image.replace(/^\//,''), baseAbs).toString()}
                     alt={p.word}
                   />
                   <div style={{textAlign:'center'}}>{p.matched?'✅':'⬇️ 把单词拖到这里'}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <h2 style={{marginTop:24}}>🔍 找一找</h2>
      <div className="card">
        <div>{data.games.find(g=>g.type==='find-it')?.prompt}</div>
        <button className="btn" onClick={()=> toast('You found it! Awesome!')}>我找到了！</button>
      </div>

      <div style={{marginTop:12}}>进度：{done}/{pairs.length}</div>
      <div className="card" style={{marginTop:12}}>家长提示：孩子错了先鼓励再示范一次。</div>
    </div>
  )
}
