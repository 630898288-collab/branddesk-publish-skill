#!/usr/bin/env node
// BrandDesk 资料发布 Skill · 执行脚本（零依赖，Node.js 18+ 内置 fetch）
// 子命令：
//   catalog                 拉取后台分类 + 资料类型清单（供 AI 判断归类）
//   publish --title ... --category-id N --url ... [--res-type doc] [--description ...] [--owner ...]
//                          默认 dry-run 预览；加 --confirm 才真正发布到 BrandDesk
// 配置：优先环境变量 BRANDDESK_API / BRANDDESK_TOKEN，其次 Skill 目录 .env，再次 data/config.json
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = join(__dirname, '..')

// ---------- 配置读取 ----------
function readDotEnv() {
  const out = {}
  const p = join(SKILL_DIR, '.env')
  if (!existsSync(p)) return out
  try {
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
      if (!m) continue
      let v = m[2]
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      out[m[1]] = v
    }
  } catch { /* ignore */ }
  return out
}
function loadConfig() {
  const dotenv = readDotEnv()
  let fileCfg = {}
  const cp = join(SKILL_DIR, 'data', 'config.json')
  if (existsSync(cp)) { try { fileCfg = JSON.parse(readFileSync(cp, 'utf8')) } catch { /* ignore */ } }
  const api = process.env.BRANDDESK_API || dotenv.BRANDDESK_API || fileCfg.api || ''
  const token = process.env.BRANDDESK_TOKEN || dotenv.BRANDDESK_TOKEN || fileCfg.token || ''
  return { api: String(api).replace(/\/+$/, ''), token: String(token) }
}
function assertConfig(cfg) {
  if (!cfg.api) throw new Error('缺少 BRANDDESK_API（后台「资料发布 Skill」卡片可一键复制完整配置）')
  if (!cfg.token) throw new Error('缺少 BRANDDESK_TOKEN（请在后台生成发布令牌并配置）')
}

// ---------- 参数解析 ----------
function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      if (key === 'confirm' || key === 'json' || key === 'all') args[key] = true
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) { args[key] = argv[++i] }
      else args[key] = true
    } else args._.push(a)
  }
  return args
}

async function apiFetch(cfg, path, options = {}) {
  const url = cfg.api + path
  const headers = { Authorization: 'Bearer ' + cfg.token, Accept: 'application/json', 'User-Agent': 'branddesk-publish-skill/1.0' }
  if (options.json) headers['Content-Type'] = 'application/json'
  const res = await fetch(url, { method: options.method || 'GET', headers, body: options.body, signal: AbortSignal.timeout(20000) })
  let data = null
  try { data = await res.json() } catch { /* no body */ }
  if (!res.ok) {
    const msg = data?.error || data?.errors?.join('；') || `HTTP ${res.status}`
    const e = new Error(msg); e.status = res.status; e.data = data; throw e
  }
  return data
}

// ---------- catalog ----------
async function cmdCatalog(cfg, args) {
  let data, from = 'remote'
  try {
    data = await apiFetch(cfg, '/api/publish/catalog')
  } catch (e) {
    // 在线拉取失败时用内置快照兜底，只返回分类/类型，不假装有发布能力
    const sp = join(SKILL_DIR, 'data', 'catalog.json')
    if (!existsSync(sp)) throw e
    data = JSON.parse(readFileSync(sp, 'utf8'))
    from = 'snapshot'
  }
  if (args.json) {
    console.log(JSON.stringify({ ...data, from }, null, 2))
    return
  }
  console.log(`分类与资料类型清单（来源：${from === 'remote' ? '后台实时' : '离线快照'}）\n`)
  const top = data.categories.filter((c) => !c.parentId)
  const childOf = (id) => data.categories.filter((c) => c.parentId === id)
  for (const c of top) {
    console.log(`● [ID ${c.id}] ${c.name}${c.nameEn ? ' / ' + c.nameEn : ''}  （${c.resourceCount} 条）`)
    for (const ch of childOf(c.id)) {
      console.log(`   └ [ID ${ch.id}] ${ch.name}${ch.nameEn ? ' / ' + ch.nameEn : ''}  （${ch.resourceCount} 条）`)
    }
  }
  console.log('\n资料类型 code：' + data.types.map((t) => `${t.code}(${t.name})`).join('、'))
  if (from === 'snapshot') console.log('\n提示：当前连不上后台，使用离线快照，分类可能有变动；发布功能需联网且令牌有效。')
  console.log('\n用法：publish --title "标题" --category-id <ID> --url "链接" [--res-type doc] [--description "简介"] [--owner "责任人"] --confirm')
}

// ---------- publish ----------
async function cmdPublish(cfg, args) {
  const required = ['title', 'category-id']
  for (const k of required) if (!args[k]) throw new Error(`缺少必填参数 --${k}`)
  const sourceType = args['source-type'] || (args.file ? 'file' : 'link')
  if (sourceType === 'link' && !args.url) throw new Error('在线链接资料需提供 --url')
  if (sourceType === 'file' && !args.file) throw new Error('本地文件资料需提供 --file <路径>')
  if (sourceType !== 'link' && sourceType !== 'file') throw new Error('--source-type 只能是 link 或 file')

  const body = {
    title: args.title,
    categoryId: Number(args['category-id']),
    sourceType,
    resType: args['res-type'] || '',
    description: args.description || '',
    owner: args.owner || '',
    confirm: args.confirm ? '1' : '0',
  }
  if (sourceType === 'link') body.url = args.url

  // 文件型：multipart 上传（Node18+ 内置 FormData/Blob）
  let payload = JSON.stringify(body)
  let isJson = true
  if (sourceType === 'file') {
    const { pathToFileURL } = await import('node:url')
    const { basename } = await import('node:path')
    const { readFileSync: rfs } = await import('node:fs')
    const buf = rfs(args.file)
    const fd = new FormData()
    for (const [k, v] of Object.entries(body)) fd.append(k, String(v))
    fd.append('file', new Blob([buf]), basename(args.file))
    payload = fd
    isJson = false
  }

  const data = await apiFetch(cfg, '/api/publish', { method: 'POST', json: isJson, body: payload })
  if (args.json) { console.log(JSON.stringify(data, null, 2)); return }
  if (data.dryRun) {
    const p = data.preview || {}
    console.log('预览校验通过（尚未写入）。将要发布：')
    console.log(`  标题：${p.title}`)
    console.log(`  分类：${p.categoryName}（ID ${p.categoryId}）`)
    console.log(`  形态：${p.sourceType === 'link' ? '在线链接' : '上传文件'}${p.url ? ' → ' + p.url : ''}${p.fileName ? ' → ' + p.fileName : ''}`)
    if (p.resType) console.log(`  类型：${p.resType}`)
    if (p.description) console.log(`  简介：${p.description}`)
    if (p.owner) console.log(`  责任人：${p.owner}`)
    console.log('\n确认无误后，加 --confirm 重新执行即可正式发布。')
  } else {
    const r = data.resource || {}
    console.log(`发布成功 ✓  资料 ID ${r.id}｜《${r.title}》→ ${r.categoryName}`)
    if (data.link) console.log(`  工作台：${data.link}`)
    if (typeof data.notified === 'number') console.log(`  已通知该分类订阅者 ${data.notified} 人`)
  }
}

// ---------- 入口 ----------
try {
  const args = parseArgs(process.argv.slice(2))
  const cmd = args._[0] || 'help'
  if (cmd === 'help') {
    console.log(`BrandDesk 资料发布 Skill
  catalog                          拉取分类 + 类型清单（发布前先调用，确定 categoryId）
  publish --title T --category-id N --url U [选项]   预览发布（默认不写入）
  publish ... --confirm            正式发布到 BrandDesk

选项：--source-type link|file  --res-type CODE  --description 简介  --owner 责任人
      --file 本地文件路径  --json 输出 JSON`)
    process.exit(0)
  }
  const cfg = loadConfig()
  assertConfig(cfg)
  if (cmd === 'catalog') await cmdCatalog(cfg, args)
  else if (cmd === 'publish') await cmdPublish(cfg, args)
  else throw new Error(`未知子命令：${cmd}`)
} catch (e) {
  console.error('错误：' + (e.message || e))
  process.exit(1)
}
