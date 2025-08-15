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
const summaryPath = process.env.GITHUB_S_
