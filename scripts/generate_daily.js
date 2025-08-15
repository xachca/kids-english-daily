// scripts/generate_daily.js
// -----------------------------------------------------------
// Daily content generator with real Doubao(Seedream 3.0 T2I) API calls.
//   IMAGE_PROVIDER = "doubao" | "wanx"
// Doubao supports DOUBAO_FLAVOR = "ark" | "openai"
// -----------------------------------------------------------

import fs from 'fs'
import path from 'path'

// ========== ENV ==========
const PROVIDER = (process.env.IMAGE_PROVIDER || 'doubao').toLowerCase()
const TZ        = process.env.TZ || 'Asia/Shanghai'
const CHILD     = process.env.CHILD_NAME || 'Kid'

// ---- Wanx (Ali DashScope) (可选回退) ----
const WANX_API_KEY   = process.env.TONGYI_API_KEY || process.env.DASHSCOPE_API_KEY || ''
const WANX_MODEL     = process.env.WANX_MODEL || 'wanx2.0-t2i-turbo'
const WANX_SIZE      = process.env.WANX_IMG_SIZE || '512*512'
const WANX_WORKSPACE = process.env.WANX_WORKSPACE || ''

// ---- Doubao (Seedream 3.0 T2I) ----
const DOUBAO_API_BASE    = process.env.DOUBAO_API_BASE   || ''   // e.g. https://ark.cn-beijing.volces.com/api/v3/images  OR  https://host/v1/images/generations
const DOUBAO_API_KEY     = process.env.DOUBAO_API_KEY    || ''
const DOUBAO_AUTH_SCHEME = (process.env.DOUBAO_AUTH_SCHEME || 'Bearer').trim() // "Bearer" | "X-API-Key"
const DOUBAO_MODEL       = process.env.DOUBAO_MODEL      || 'seedream-3-0-t2i-250415'
const DOUBAO_SIZE        = process.env.DOUBAO_IMG_SIZE   || '512x512'
const DOUBAO_FLAVOR      = (process.env.DOUBAO_FLAVOR || 'ark').toLowerCase()  // "ark" | "openai"

// ---- Directories ----
const FRONT_PUBLIC = path.resolve('frontend/public')
const DAILY_DIR = path.join(FRONT_PUBLIC, 'daily')
const IMG_ROOT  = path.join(FRONT_PUBLIC, 'images')
fs.mkdirSync(DAILY_DIR, {recursive:true})
fs.mkdirSync(IMG_ROOT, {recursive:true})

// ========== DATE ==========
function nowInTZ(){
  const s = new Date().toLocaleString('en-CA', { timeZone: TZ, hour12:false })
  const [datePart] = s.split(',')
  return { ds: datePart.trim() } // YYYY-MM-DD
}
const { ds } = nowInTZ()

// ========== THEMES ==========
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

// ========== Utils ==========
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

// ---- Logging helpers (to console & GitHub Step Summary) ----
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const appendSummary = async (line) => {
  try {
    if (summaryPath) await fs.promises.appendFile(summaryPath, line + '\n', 'utf-8');
  } catch {}
};
function logSavedImage({ word, pathRel, source, bytes, note='' }) {
  const msg = `[img] ${pathRel} <- ${source} (${bytes} bytes) ${note}`.trim();
  console.log(msg);
  appendSummary(`- ${word}: ${pathRel}  \`${source}\` (${bytes} bytes) ${note}`);
}
function logPlaceholder({ word, pathRel }) {
  const msg = `[img-fallback] ${pathRel} (SVG placeholder)`;
  console.log(msg);
  appendSummary(`- ${word}: ${pathRel} _(placeholder)_`);
}

// ========== Provider: Wanx (optional fallback) ==========
async function genWanx(word){
  if (!WANX_API_KEY) return null
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
          const r2  = await fetch(r.url)
          const ab  = await r2.arrayBuffer()
          const buf = Buffer.from(ab)
          fs.writeFileSync(p.abs, buf)
          logSavedImage({ word, pathRel: p.rel, source: 'wanx:url', bytes: buf.length })
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

// ========== Provider: Doubao (real API) ==========
async function genDoubao(word){
  if (!DOUBAO_API_BASE || !DOUBAO_API_KEY) return null
  await sleep(900)

  const prompt = buildPrompt(word)
  const headers = { 'Content-Type': 'application/json' }
  if (DOUBAO_AUTH_SCHEME.toLowerCase() === 'x-api-key') headers['X-API-Key'] = DOUBAO_API_KEY
  else headers['Authorization'] = `Bearer ${DOUBAO_API_KEY}`

  const maxRetry=4
  for (let i=0;i<maxRetry;i++){
    try{
      // 两种风味：openai（/v1/images/generations） vs ark（/api/v3/images）
      let body
      if (DOUBAO_FLAVOR === 'openai'){
        body = { model: DOUBAO_MODEL, prompt, size: DOUBAO_SIZE, n:1 }
      }else{
        body = { model: DOUBAO_MODEL, input: { prompt }, parameters: { size: DOUBAO_SIZE, n:1 } }
      }

      const resp = await fetch(DOUBAO_API_BASE, { method:'POST', headers, body: JSON.stringify(body) })
      const text = await resp.text()
      if (resp.ok){
        let data; try{ data = JSON.parse(text) }catch(e){ console.log('doubao json parse err:', e?.message); return null }
        const p = dateImagePath(word)

        // 常见返回形态 1：image_urls / binary_data_base64
        const urls = data?.image_urls || data?.data?.image_urls
        const b64s = data?.binary_data_base64 || data?.data?.binary_data_base64
        if (urls?.[0]){
          const r2  = await fetch(urls[0]); const ab = await r2.arrayBuffer(); const buf = Buffer.from(ab)
          fs.writeFileSync(p.abs, buf); logSavedImage({ word, pathRel: p.rel, source: 'doubao:url', bytes: buf.length }); return p.rel
        }
        if (b64s?.[0]){
          const buf = Buffer.from(b64s[0], 'base64')
          fs.writeFileSync(p.abs, buf); logSavedImage({ word, pathRel: p.rel, source: 'doubao:base64', bytes: buf.length }); return p.rel
        }

        // 形态 2：data.result.images[*].{url|base64} / result.images / images
        const imgs = data?.data?.result?.images || data?.result?.images || data?.images
        const first = imgs?.[0]
        if (first?.url){
          const r2  = await fetch(first.url); const ab = await r2.arrayBuffer(); const buf = Buffer.from(ab)
          fs.writeFileSync(p.abs, buf); logSavedImage({ word, pathRel: p.rel, source: 'doubao:url', bytes: buf.length }); return p.rel
        }
        if (first?.base64){
          const buf = Buffer.from(first.base64, 'base64')
          fs.writeFileSync(p.abs, buf); logSavedImage({ word, pathRel: p.rel, source: 'doubao:base64', bytes: buf.length }); return p.rel
        }

        // 形态 3（OpenAI 兼容）：data[].b64_json / url
        const dataArr = data?.data
        if (Array.isArray(dataArr) && dataArr[0]?.b64_json){
          const buf = Buffer.from(dataArr[0].b64_json, 'base64')
          fs.writeFileSync(p.abs, buf); logSavedImage({ word, pathRel: p.rel, source: 'doubao:b64_json', bytes: buf.length }); return p.rel
        }
        if (Array.isArray(dataArr) && dataArr[0]?.url){
          const r2  = await fetch(dataArr[0].url); const ab = await r2.arrayBuffer(); const buf = Buffer.from(ab)
          fs.writeFileSync(p.abs, buf); logSavedImage({ word, pathRel: p.rel, source: 'doubao:url(openai)', bytes: buf.length }); return p.rel
        }

        console.log('doubao ok but empty for', word, JSON.stringify(data).slice(0,300))
        return null
      }else{
        console.log(`doubao http ${resp.status} "${word}" body:`, text.slice(0,1000))
        if (resp.status===429 || resp.status>=500){ await sleep(1200*Math.pow(2,i)); continue }
        return null
      }
    }catch(e){
      console.log('doubao err:', e?.message)
      await sleep(1000*Math.pow(2,i))
    }
  }
  return null
}

// ========== MAIN ==========
async function main(){
  console.log('Daily generator start => provider:', PROVIDER, 'flavor:', DOUBAO_FLAVOR, 'tz:', TZ)
  const words = []
  for (const [w] of sampled){
    let img = null
    if (PROVIDER === 'doubao') img = await genDoubao(w)
    else img = await genWanx(w)

    if(!img){
      const p = dateImagePath(w)
      fs.writeFileSync(p.absSvg, svg(w))
      logPlaceholder({ word: w, pathRel: p.relSvg })
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
  console.log('DailyPack generated for', ds, 'provider=', PROVIDER, 'flavor=', DOUBAO_FLAVOR)
}
await main()
