import { Link } from 'react-router-dom'
export default function Home(){
  const today = new Date().toISOString().slice(0,10)
  return (
    <div>
      <header>
        <div className="big">🌈 Daily English</div>
        <nav style={{display:'flex', gap:12}}>
          <Link to={'/daily/'+today}>Daily</Link>
          <Link to={'/games/'+today}>Games</Link>
          <Link to={'/story/'+today}>Story</Link>
          <Link to={'/parent/'+today}>Parent</Link>
        </nav>
      </header>
      <main style={{padding:16}}>
        <div className="grid">
          <Link className="card" to={'/daily/'+today}>🔤 每日学习区</Link>
          <Link className="card" to={'/games/'+today}>🎮 互动游戏区</Link>
          <Link className="card" to={'/story/'+today}>📖 故事时间</Link>
          <Link className="card" to={'/parent/'+today}>👨‍👩‍👧 亲子互动任务</Link>
        </div>
      </main>
    </div>
  )
}