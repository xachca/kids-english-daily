// scripts/generate_daily.js
// -----------------------------------------------------------
// Daily content generator with real Doubao (Seedream 3.0 T2I) API.
// IMAGE_PROVIDER = "doubao" | "wanx"
// Doubao supports DOUBAO_FLAVOR = "ark" | "openai"
// -----------------------------------------------------------

import fs from 'fs'
import path from 'path'

// ====== ENV ======
const PROVIDER = (process.env.IMAGE_PROVIDER || 'doubao').toLowerCase()
const TZ        = process.env.TZ || 'Asia/Shanghai'
const CHILD     = process.env.CHILD_NAME || 'Kid'

// --- Wanx (Ali) optional fallback ---
const WANX_API_KEY   = process.env.TONGYI_API_KEY || process.env.DASHSCOPE_API_KEY || ''
const WANX_MODEL     = process.env.WANX_MODEL || 'wanx2.0-t2i-turbo'
const WANX_SIZE      = process.env.WANX_IMG_SIZE || '512*512'
const WANX_WORKSPACE = process.env.WANX_WORKSPACE || ''

// --- Doubao (Seedream 3.0 T2I) ---
/**
 * ！！注意：这里使用“根地址”/api/v3，不要自带 /images
 * 正确： https://ark.cn-beijing.volces.com/api/v3
 */
const DOUBAO_API_BASE    = (process.env.DOUBAO_API_BASE || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '')
const DOUBAO_API_KEY     = process.env.DOUBAO_API_KEY || ''
const DOUBAO_AUTH_SCHEME = (process.env.DOUBAO_AUTH_SCHEME || 'X-API-Key').trim() // "X-API-Key" | "Bearer"
const DOUBAO_MODEL       = process.env.DOUBAO_MODEL || 'doubao-seedream-3-0-t2i-250415'
const DOUBAO_SIZE        = process.env.DOUBAO_IMG_SIZE || '512x512'
const DOUBAO_FLAVOR      = (process.env.DOUBAO_FLAVOR || 'ark').toLowerCase()    // "ark" | "openai"

// --- Directories ---
const FRONT_PUBLIC = path.resolve('frontend/public')
const DAILY_DIR = path.join(FRONT_PUBLIC, 'daily')
const IMG_ROOT  = path.join(FRONT_PUBLIC, 'images')
fs.mkdirSync(DAILY_DIR, { recursive: true })
fs.mkdirSync(IMG_ROOT, { recursive: true })

// ====== DATE ======
function nowInTZ(){
  const s = new Date().toLocaleString('en-CA', { timeZone: TZ, hour12:false })
  const [datePart] = s.split(',')
  return { ds: datePart.trim() } // YYYY-MM-DD
}
const { ds } = nowInTZ()

// ====== THEMES ======
const themes = [
  {"name":"Colors & Fruit","words":[["apple","red"],["banana","yellow"],["grape","purple"],["pear","green"],["orange","orange"]]},
  {"name":"Animals","words":[["cat","black"],["dog","brown"],["duck","yellow"],["fish","blue"],["bird","red"]]},
  {"name":"Toys","words":[["ball","red"],["car","blue"],["doll","pink"],["block","green"],["train","black"]]},
  {"name":"Home","words":[["cup","white"],["chair","brown"],["table","brown"],["bed","blue"],["door","black"]]},
  {"name":"Weather","words":[["sun","yellow"],["rain","blue"],["cloud","white"],["wind","gray"],["snow","white"]]},
  {"name":"Actions","words":[["run",""],["jump",""],["sleep",""],["eat",""],["drink",""]]},
  {"name":"Food","words":[["milk","white"],["bread","brown"],["rice","white"],["cake","pink"],["juice","orange"]]},
  {"name":"Transport","words":[["bus","yellow"],["bike","red"],["car","blue"],["train","black"],["boat","white"]]}
]
const seed = Number(ds.replaceAll('-',''))
const theme = themes[seed % themes.length]
const sampled = [...theme.words].sort(()=> Math.random()-0.5).slice(0,4)

// ====== Utils ======
const sleep = (ms)=> new Promise(r=> setTimeout(r, ms))

function buildPrompt(word){
  const nounHints = {
    rice:  'a small white bowl filled with cooked rice',
    milk:  'a transparent glass filled with milk',
    bread: 'a loaf of bread with a few slices',
    juice: 'a glass of orange juice with a straw',
    cake:  'a small round cake with simple frosting',
  }
  const action = ['run','jump','sleep','eat','drink'].includes(word)
  const core = action
    ? `a simple friendly kid character doing the action "${word}"`
    : (nounHints[word] ? nounHints[word] : `an illustration of "${word}"`)
  return [
    'Cute, kid-friendly illustration, bright flat colors, round edges',
    core,
    'clean white background, high contrast, centered, no text, minimal shadows'
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

// ---- Logging helpers (console + GitHub Step Summary) ----
const summaryPath = process.env.GITHUB_STEP_SUMMARY
const appendSummary = async (line) => { try { if (summaryPath) await fs.promises.appendFile(summaryPath, line+'\n','utf-8') } catch{} }
function logSavedImage({ word, pathRel, source, bytes, note='' }) {
  const msg = `[img-ok] ${pathRel} <- ${source} (${bytes} bytes) ${note}`.trim()
  console.log(msg); appendSummary(`- ✅ ${word}: ${pathRel}  \`${source}\` (${bytes} bytes) ${note}`)
}
function logPlaceholder({ word, pathRel }) {
  const msg = `[img-fallback] ${pathRel} (SVG placeholder)`
  console.log(msg); appendSummary(`- ⚠️ ${word}: ${pathRel} _(placeholder)_`)
}
function logSkip(reason){ console.log(`[skip-doubao] ${reason}`); appendSummary(`- ⛔ skip doubao: ${reason}`) }

// ====== Wanx provider (optional) ======
async function genWanx(word){
  if (!WANX_API_KEY) { logSkip('wanx api key not provided'); return null }
  await sleep(900)

  const url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation'
  const payload = { model: WANX_MODEL, input: { prompt: buildPrompt(word) }, parameters: { size: WANX_SIZE, n:1 } }
  const headers = { 'Authorization': `Bearer ${WANX_API_KEY}`, 'Content-Type': 'application/json' }
  if (WANX_WORKSPACE) headers['X-DashScope-WorkSpace'] = WANX_WORKSPACE

  const maxRetry=4
  for (let i=0;i<maxRetry;i++){
    try{
      const resp = await fetch(url, { method:'POST', headers, body: JSON.stringify(payload) })
      const text = await resp.text()
      if (resp.ok){
        let data; try{ data = JSON.parse(text) }catch(e){ console.log('wanx json parse err:', e?.message); return null }
        const r = data?.output?.results?.[0] || data?.output?.choices?.[0] || {}
        const p = dateImagePath(word)

        if (r.image_base64){
          const buf = Buffer.from(r.image_base64,'base64')
          fs.writeFileSync(p.abs, buf)
          logSavedImage({ word, pathRel: p.rel, source: 'wanx:base64', bytes: buf.length })
          return p.rel
        }
        if (r.url){
          const r2  = await fetch(r.url); const ab = await r2.arrayBuffer(); const buf = Buffer.from(ab)
          fs.writeFileSync(p.abs, buf); logSavedImage({ word, pathRel: p.rel, source: 'wanx:url', bytes: buf.length })
          return p.rel
        }
        console.log('wanx ok but empty', word); return null
      }else{
        console.log(`wanx http ${resp.status} "${word}" body:`, text.slice(0,1000))
        if (resp.status===429 || resp.status>=500){ await sleep(1200*Math.pow(2,i)); continue }
        return null
      }
    }catch(e){ console.log('wanx err:', e?.message); await sleep(1000*Math.pow(2,i)) }
  }
  return null
}

// ====== Doubao provider (real API) ======
async function genDoubao(word){
  if (!DOUBAO_API_KEY)  { logSkip('DOUBAO_API_KEY is empty');  return null }

  await sleep(900)
  const prompt = buildPrompt(word)

  // 认证头（默认使用 X-API-Key；若显式指定 Bearer 则改为 Bearer）
  const headers = { 'Content-Type': 'application/json' }
  if (DOUBAO_AUTH_SCHEME.toLowerCase() === 'bearer') {
    headers['Authorization'] = `Bearer ${DOUBAO_API_KEY}`
  } else {
    headers['X-API-Key'] = DOUBAO_API_KEY
  }

  // Ark & OpenAI 兼容两种风味的 payload
  const bodyArk   = { model: DOUBAO_MODEL, input: { prompt }, parameters: { size: DOUBAO_SIZE, n: 1 } }
  const bodyOpen  = { model: DOUBAO_MODEL, prompt, size: DOUBAO_SIZE, n: 1 }

  // 依次尝试三个常见 endpoint（在基地址 /api/v3 下挂载）
  const endpoints = [
    { path: '/images',              flavor: 'ark',   body: bodyArk },
    { path: '/images/generations',  flavor: 'open',  body: bodyOpen },
    { path: '/text2image',          flavor: 'ark',   body: bodyArk },
  ]

  for (const ep of endpoints) {
    const url = DOUBAO_API_BASE + ep.path
    try {
      console.log('[doubao-call]', { url, flavor: ep.flavor, model: DOUBAO_MODEL, size: DOUBAO_SIZE, auth: headers['X-API-Key'] ? 'X-API-Key' : 'Bearer' })
      const resp = await fetch(url, { method:'POST', headers, body: JSON.stringify(ep.body) })
      const text = await resp.text()

      if (!resp.ok) {
        console.log(`[doubao-http] ${resp.status} "${word}" -> ${text.slice(0, 1000)}`)
        if (resp.status >= 500) await sleep(1200)
        continue
      }

      // 解析多种返回结构
      let data; try { data = JSON.parse(text) } catch(e) {
        console.log('doubao json parse err:', e?.message)
        continue
      }

      const p = dateImagePath(word)

      // 形态1：image_urls / binary_data_base64
      const urls = data?.image_urls || data?.data?.image_urls
      const b64s = data?.binary_data_base64 || data?.data?.binary_data_base64
      if (urls?.[0]) {
        const r2  = await fetch(urls[0]); const ab = await r2.arrayBuffer(); const buf = Buffer.from(ab)
        fs.writeFileSync(p.abs, buf); logSavedImage({ word, pathRel: p.rel, source: 'doubao:url', bytes: buf.length }); return p.rel
      }
      if (b64s?.[0]) {
        const buf = Buffer.from(b64s[0], 'base64')
        fs.writeFileSync(p.abs, buf); logSavedImage({ word, pathRel: p.rel, source: 'doubao:base64', bytes: buf.length }); return p.rel
      }

      // 形态2：data.result.images[*].{url|base64} / result.images / images
      const imgs = data?.data?.result?.images || data?.result?.images || data?.images
      const first = imgs?.[0]
      if (first?.url) {
        const r2  = await fetch(first.url); const ab = await r2.arrayBuffer(); const buf = Buffer.from(ab)
        fs.writeFileSync(p.abs, buf); logSavedImage({ word, pathRel: p.rel, source: 'doubao:url', bytes: buf.length }); return p.rel
      }
      if (first?.base64) {
        const buf = Buffer.from(first.base64, 'base64')
        fs.writeFileSync(p.abs, buf); logSavedImage({ word, pathRel: p.rel, source: 'doubao:base64', bytes: buf.length }); return p.rel
      }

      // 形态3（OpenAI 兼容）：data[].b64_json 或 url
      const dataArr = data?.data
      if (Array.isArray(dataArr) && dataArr[0]?.b64_json) {
        const buf = Buffer.from(dataArr[0].b64_json, 'base64')
        fs.writeFileSync(p.abs, buf); logSavedImage({ word, pathRel: p.rel, source: 'doubao:b64_json', bytes: buf.length }); return p.rel
      }
      if (Array.isArray(dataArr) && dataArr[0]?.url) {
        const r2  = await fetch(dataArr[0].url); const ab = await r2.arrayBuffer(); const buf = Buffer.from(ab)
        fs.writeFileSync(p.abs, buf); logSavedImage({ word, pathRel: p.rel, source: 'doubao:url(openai)', bytes: buf.length }); return p.rel
      }

      console.log('doubao ok but empty for', word, JSON.stringify(data).slice(0, 300))
      // 本 endpoint 解析不到图片，继续试下一个
    } catch (e) {
      console.log('[doubao-err]', e?.message || e)
      await sleep(1000)
    }
  }

  // 全部 endpoint 都失败
  return null
}

// ====== MAIN ======
async function main(){
  console.log('Daily generator start => provider:', PROVIDER, 'flavor:', DOUBAO_FLAVOR, 'tz:', TZ)
  appendSummary(`### Daily image generation  
- provider: \`${PROVIDER}\`  
- flavor: \`${DOUBAO_FLAVOR}\`  
- tz: \`${TZ}\`  
- date: **${ds}**  
`)

  const words = []
  for (const [w] of sampled){
    let img = null
    if (PROVIDER === 'doubao') img = await genDoubao(w)
    else if (PROVIDER === 'wanx') img = await genWanx(w)
    else { logSkip(\`unknown provider "\${PROVIDER}"\`); }

    if(!img){
      const p = dateImagePath(w)
      fs.writeFileSync(p.absSvg, svg(w))
      logPlaceholder({ word: w, pathRel: p.relSvg })
      img = p.relSvg
    }
    words.push({ text:w, phonics:'', audio:\`/media/tts/\${w}.mp3\`, image: img, hint_cn:\`指着\${w}示意；若没有实体，用图片代替\` })
  }

  const pack = {
    date: ds, child_profile: { name: CHILD, interests: [] }, theme: theme.name,
    words,
    sentences: [
      { text:\`I see a \${words[0].text}.\`, audio:'/media/tts/sent1.mp3', scene_anim:\`/anim/\${words[0].text}.json\` },
      { text:\`The \${words[1].text} is nice.\`, audio:'/media/tts/sent2.mp3', scene_anim:\`/anim/\${words[1].text}.json\` },
    ],
    story: {
      title: \`\${words[0].text[0].toUpperCase()+words[0].text.slice(1)} & \${words[1].text[0].toUpperCase()+words[1].text.slice(1)}\`,
      script_lines:[
        \`\${CHILD} sees a \${words[0].text}.\`,
        \`\${CHILD} sees a \${words[1].text}.\`,
        \`Hello, \${words[0].text}! Hello, \${words[1].text}!\`,
        \`Yummy \${words[0].text}. Yummy \${words[1].text}!\`
      ],
      line_audios:['/media/tts/story1.mp3','/media/tts/story2.mp3','/media/tts/story3.mp3','/media/tts/story4.mp3']
    },
    games:[
      { type:'match-word-image', title:'小小配对官', items: words.map(w=>({word:w.text, image:w.image})),
        correct_feedback:['Yay!','Great job!','High five!'], wrong_feedback:['Try again!','Almost!'] },
      { type:'find-it', title:'找一找颜色', prompt:'Find something red at home!', success_feedback:'You found it! Awesome!' }
    ],
    parent_cards:[
      { cn:\`指着\${words[0].text}说：This is a \${words[0].text}.\`, en:\`This is a \${words[0].text}.\`, tip:'慢速清晰，指物' },
      { cn:\`问：Do you like \${words[1].text}?\`, en:\`Do you like \${words[1].text}?\`, tip:'引导回答 Yes / No' },
      { cn:'一起找房间里的颜色', en:'Let’s find colors in the room!', tip:'把找到的东西排一排复习' }
    ]
  }

  fs.writeFileSync(path.join(DAILY_DIR, `${ds}.json`), JSON.stringify(pack, null, 2), 'utf-8')
  console.log('DailyPack generated for', ds, 'provider=', PROVIDER, 'flavor=', DOUBAO_FLAVOR)
  appendSummary(`\n> ✅ DailyPack generated for **${ds}**`)
}
await main()

