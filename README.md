# BrandDesk 资料发布 Skill

把资料丢给 AI：自动判断用途、选分类、填字段、发布到 BrandDesk（飞利浦/德尔玛市场部品牌资料工作台）。

## 安装

1. 把整个目录放到你所用 Agent 的 skills 目录（如 Claude Code 用 `~/.claude/skills/branddesk-publish/`，其他 Agent 用其对应目录，文件夹名随意）。
2. 复制 `.env.example` 为 `.env`，填入两项配置（在 BrandDesk 后台「系统设置 → 资料发布 Skill」卡片可**一键复制完整配置**）：
   - `BRANDDESK_API`：平台 API 根地址，如 `https://aishare.deerma.com/branddesk-api`
   - `BRANDDESK_TOKEN`：发布专用令牌（后台生成，只显示一次，泄露可吊销）
3. 确保 `SKILL.md`、`scripts/publish.mjs`、`data/catalog.json` 都在。

只需 Node.js 18+（内置 `fetch`），零第三方依赖，无需飞书连接器。

## 用法

装好后用自然语言说需求即可，例如「把这个飞书文档发布到品牌资料台」「把这几份链接归档一下」。Agent 会按 SKILL.md 自动执行。也可直接调用脚本：

```bash
# 1) 先看分类清单，确定 categoryId
node scripts/publish.mjs catalog

# 2) 预览（默认不写入）
node scripts/publish.mjs publish --title "飞利浦品牌授权申请表" \
  --category-id 12 --url "https://deerma66.feishu.cn/sheets/xxx" \
  --res-type sheet --description "品牌授权申请入口，含材料清单与审批流程。"

# 3) 确认无误，加 --confirm 正式发布（会写库并通知订阅者）
node scripts/publish.mjs publish --title "飞利浦品牌授权申请表" \
  --category-id 12 --url "https://deerma66.feishu.cn/sheets/xxx" \
  --res-type sheet --description "品牌授权申请入口，含材料清单与审批流程。" --confirm

# 本地文件：用 --file，自动识别为 file 形态
node scripts/publish.mjs publish --title "2026 品牌手册" --category-id 5 \
  --file "/path/to/品牌手册.pdf" --confirm
```

## 安全

- 令牌只在后台生成时明文显示一次；请立即复制到 `.env`，不要提交到版本库（`.gitignore` 已排除 `.env`）。
- 令牌代表生成它的管理员身份与权限；离职/泄露时到后台吊销即可立即失效。
- 发布前务必预览确认：`--confirm` 会写入生产资料库并向该分类订阅者发飞书通知。

## 与其他 Skill 的分工

- **查询/下载资料** → `branddesk-lookup`（说需求，直接返回链接）
- **发布/归档资料** → 本 Skill（丢资料，自动归类发布）
