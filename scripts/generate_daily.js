// scripts/generate_daily.js
// -----------------------------------------------------------
// Daily content generator with pluggable image providers:
//   IMAGE_PROVIDER = "wanx" | "doubao"
// For Doubao, supports two API flavors: DOUBAO_FLAVOR = "ark" | "openai"
// -----------------------------------------------------------

import fs from 'fs'
import path from 'path'

// ========== ENV ==========
const PROVIDER = (process.env.IMAGE_PROVIDER || 'wanx').toLowerCase()
const TZ        = process.env.TZ || 'Asia/Shanghai'
const CHILD     = process.env.CHILD_NAME || 'Kid'

// ---- Wanx (Ali DashScope) ----
const WANX_API_KEY   = process.env.TONGYI_API_KEY || process.env.DASHSCOPE_API_KEY || ''
const WANX_MODEL     = process.env.WANX_MODEL || 'wanx2.0-t2i-turbo'
const WANX_SIZE      = process.env.WANX_IMG_SIZE || '512*512'
const WANX_WORKSPACE = process.env.WANX_WORKSPACE || ''

// ---- Doubao (Seedream 3.0 T2I) ----
// You must configure these via GitHub Secrets / env in workflow:
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

// ========== THEMES (sample) ==========
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
  // visual anchors for abstract nouns
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

// ---- Logging helpers (also to GitHub Step Summary) ----
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

// ========== Provider: Wanx ==========
async function genWanx(word){
  if (!WANX_API_KEY) return null
  await sleep(900) // soften rate limit

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

// ========== Provider: Doubao ==========
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
      // Two flavors: ark (ModelArk) vs openai (OpenAI-compatible)
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

        // common shapes
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

        // OpenAI-li
