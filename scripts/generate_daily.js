// scripts/generate_daily.js  — 强化版：限速、重试、详细日志、稳健提示词
import fs from 'fs'
import path from 'path'

/** ====== 环境变量 ====== */
const API_KEY = process.env.TONGYI_API_KEY || process.env.DASHSCOPE_API_KEY || ''
const MODEL   = process.env.WANX_MODEL || 'wanx2.0-t2i-turbo'
const SIZE    = process.env.WANX_IMG_SIZE || '1024*1024'
const TZ      = process.env.TZ || 'Asia/Shanghai'
const CHILD   = process.env.CHILD_NAME || 'Kid'

/** ====== 目录准备 ====== */
const FRONT_PUBLIC = path.resolve('frontend/public')
const DAILY_DIR = path.join(FRONT_PUBLIC, 'daily')
const IMG_ROOT  = path.join(FRONT_PUBLIC, 'images')
fs.mkdirSync(DAILY_DIR, {recursive:true})
fs.mkdirSync(IMG_ROOT, {recursive:true})

/** ====== 日期（目标时区） ====== */
function nowInTZ(){
  const s = new Date().toLocaleString('en-CA', { timeZone: TZ, hour12:false })
  const [datePart] = s.split(',')
  return { ds: datePart.trim() } // YYYY-MM-DD
}
const { ds } = nowInTZ()

/** ====== 今日主题与词表 ====== */
const themes = [
  {"name":"Colors & Fruit","words":[["apple","red"],["banana","yellow"],["grape","purple"],["pear","green"],["orange","orange"]]},
  {"name":"Animals","words":[["cat","black"],["dog","brown"],["duck","yellow"],["fish","blue"],["bird","red"]]},
  {"name":"Toys","words":[["ball","red"],["car","blue"],["doll","pink"],["block","green"],["train","black"]]},
  {"name":"Home","words":[["cup","white"],["chair","brown"],["table","brown"],["bed","blue"],["door","black"]]},
  {"name":"Weather","words":[["sun","yellow"],["rain","blue"],["cloud","white"],["wind","gray"],["snow","white"]]},
  // 动词类有时更抽象，提示词里增加“简单卡通人物做动作”
  {"name":"Actions","words":[["run",""],["jump",""],["sleep",""],["eat",""],["drink",""]]},
  {"name":"Food","words":[["milk","white"],["bread","brown"],["rice","white"],["cake","pink"],["juice","orange"]]},
  {"name":"Transport","words":[["bus","yellow"],["bike","red"],["car","blue"],["train","black"],["boat","white"]]}
]
const seed = Number(ds.replaceAll('-',''))
const theme = themes[seed % themes.length]
const sampled = [...theme.words].sort(()=> Math.random()-0.5).slice(0,4)

/** ====== 工具函数 ====== */
const sleep = (ms)=> new Promise(r=> setTimeout(r, ms))

function buildPrompt(word){
  // 更稳健的英文提示：白底、简洁、儿童友好；动词时加入“simple character doing the action”
  return [
    `Cute, kid-friendly illustration`,
    (['run','jump','sleep','eat','drink'].includes(word) 
      ? `showing a simple friendly character doing the action "${word}"`
      : `of "${word}"`),
    `on a clean white background, bright flat colors, round edges, high contrast, no text, centered, minimal shadows`
  ].join(', ')
}

function svg(word){
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">
    <rect width="100%" height="100%" fill="#f7f7f7"/>
    <circle cx="300" cy="180" r="110" fill="#c0c0c0" opacity="0.7"/>
    <text x="300" y="350" text-anchor="middle" font-family="Arial" font-size="48" fill="#333">${word}</text>
  </svg>`
}

function dateImagePath(word){
  const dir = path.join(IMG_ROOT, ds)
  fs.mkdirSync(dir, {recursive:true})
  return { 
    abs: path.join(dir, `${word}.jpg`), rel: `/images/${ds}/${word}.jpg`,
    absSvg: path.join(dir, `${word}.svg`), relSvg: `/images/${ds}/${word}.svg`
  }
}

/** ====== 万相调用（带重试和限速） ====== */
async function genWanx(word){
  if (!API_KEY) return null

  // 每词之间限速 1s，避免 429
  await sleep(1000)

  const url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation'
  const payload = {
    model: MODEL,
    input: { prompt: buildPrompt(word) },
    parameters: { size: SIZE }
  }

  const maxRetry = 4
  for (let i = 0; i < maxRetry; i++){
    try{
      const resp = await fetch(url, {
        method:'POST',
        headers:{
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (resp.ok){
        const data = await resp.json()
        const p = dateImagePath(word)
        const b64 = data?.output?.results?.[0]?.image_base64 || data?.output?.choices?.[0]?.image_base64
        const link = data?.output?.results?.[0]?.url          || data?.output?.choices?.[0]?.url
        if (b64){
          fs.writeFileSync(p.abs, Buffer.from(b64, 'base64'))
          return p.rel
        } else if (link){
          const r2 = await fetch(link)
          const buf = Buffer.from(await r2.arrayBuffer())
          fs.writeFileSync(p.abs, buf)
          return p.rel
        } else {
          console.log('wanx ok but empty result for', word)
          return null
        }
      }else{
        // 打印前 300 字的错误体，便于定位 400 问题
        let body = ''
        try{ body = await resp.text() }catch{}
        console.log(`wanx http ${resp.status} for "${word}"`, body?.slice(0,300))

        // 429/5xx：指数退避重试
        if (resp.status === 429 || resp.status >= 500){
          const backoff = 1200 * Math.pow(2, i) + Math.floor(Math.random()*300)
          await sleep(backoff)
          continue
        }
        // 400 等参数错误：直接放弃，走占位图
        return null
      }
    }catch(e){
      console.log('wanx err', e?.message || e)
      // 网络抖动也重试
      const backoff = 1000 * Math.pow(2, i)
      await sleep(backoff)
    }
  }
  return null
}

/** ====== 主流程 ====== */
async function main(){
  const words = []
  for (const [w] of sampled){
    let img = await genWanx(w)
    if(!img){
      const p = dateImagePath(w)
      fs.writeFileSync(p.absSvg, svg(w)) // 兜底占位图
      img = p.relSvg
    }
    words.push({ text:w, phonics:'', audio:`/media/tts/${w}.mp3`, image: img, hint_cn:`指着${w}示意；若没有实体，用图片代替` })
  }

  const pack = {
    date: ds, child_profile: { name: CHILD, interests: [] }, theme: theme.name,
    words,
    sentences: [
      { text:`I see a ${words[0].text}.`, audio:`/media/tts/sent1.mp3`, scene_anim:`/anim/${words[0].text}.json` },
      { text:`The ${words[1].text} is nice.`, audio:`/media/tts/sent2.mp3`, scene_anim:`/anim/${words[1].text}.json` },
    ],
    story: {
      title: `${words[0].text[0].toUpperCase()+words[0].text.slice(1)} & ${words[1].text[0].toUpperCase()+words[1].text.slice(1)}`,
      script_lines:[
        `${CHILD} sees a ${words[0].text}.`,
        `${CHILD} sees a ${words[1].text}.`,
        `Hello, ${words[0].text}! Hello, ${words[1].text}!`,
        `Yummy ${words[0].text}. Yummy ${words[1].text}!`
      ],
      line_audios:['/media/tts/story1.mp3','/media/tts/story2.mp3','/media/tts/story3.mp3','/media/tts/story4.mp3']
    },
    games:[
      { type:'match-word-image', title:'小小配对官', items: words.map(w=>({word:w.text, image:w.image})),
        correct_feedback:['Yay!','Great job!','High five!'], wrong_feedback:['Try again!','Almost!'] },
      { type:'find-it', title:'找一找颜色', prompt:'Find something red at home!', success_feedback:'You found it! Awesome!' }
    ],
    parent_cards:[
      { cn:`指着${words[0].text}说：This is a ${words[0].text}.`, en:`This is a ${words[0].text}.`, tip:'慢速清晰，指物' },
      { cn:`问：Do you like ${words[1].text}?`, en:`Do you like ${words[1].text}?`, tip:'引导回答 Yes / No' },
      { cn:'一起找房间里的颜色', en:'Let’s find colors in the room!', tip:'把找到的东西排一排复习' }
    ]
  }

  fs.writeFileSync(path.join(DAILY_DIR, `${ds}.json`), JSON.stringify(pack, null, 2), 'utf-8')
  console.log('DailyPack generated for', ds)
}
await main()
