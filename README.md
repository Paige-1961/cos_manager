# CosPilot

CosPilot 是一个面向二次元 Cos 出片的一站式平台原型，目标是连接 Coser 与妆造师、假发/毛娘、摄影师、摄影棚/场地、后期等服务者。当前版本重点验证“自然语言需求 -> Agent 拆解 -> Provider 匹配 -> 方案保存 -> 服务者主页/工作台”的最小业务闭环。

## 项目介绍

用户可以用一句自然语言描述拍摄需求，例如角色、作品、城市、日期区间、预算、风格和已有物品。系统会将需求解析为结构化 `ProjectRequirement`，再基于统一 Provider 数据源生成可解释推荐方案。Provider 端可以维护公开主页、服务项目、作品和可预约档期，推荐引擎会读取同一份业务数据。

## 功能

- 真实 LLM 需求理解、结构化输出、主动澄清与本地 fallback 解析。
- 可解释 Agent 工作流：需求解析、缺口识别、服务者筛选、约束检查、方案组合、预算/档期检查、Brief 输出。
- Customer / Provider 注册、登录、退出与 localStorage 会话恢复。
- Customer 个人资料查看与编辑。
- Provider 公开主页、详情页、作品/服务/评价/档期 tabs。
- Provider Dashboard：主页资料、服务项目、作品管理、档期管理、公开主页预览。
- 统一 Provider 数据源，稳定 `providerId` / `serviceId`。
- Recommendation Engine 基于类别、城市、日期、风格、价格、评分等规则做最小可用匹配。
- 保存方案 / 我的方案 / 方案详情恢复。
- 收藏、预约、保存方案等操作的登录拦截。

## 如何运行

当前项目是静态网页原型，不需要安装依赖或启动构建工具。

1. 打开项目目录：`D:\cospilot`
2. 直接用浏览器打开：`D:\cospilot\index.html`
3. 推荐使用 Edge 或 Chrome。
4. 如果浏览器缓存导致页面没有更新，可以强制刷新或清理该页面的 localStorage 后重试。

## Demo 链接

当前 Demo 以本地静态页面为主：

- 本地入口：`D:\cospilot\index.html`
- GitHub 仓库：`https://github.com/Paige-1961/cos_manager`

如果后续部署到 GitHub Pages / Vercel / Netlify，可在这里替换为线上链接。

## 当前版本限制

- 账户、Customer Profile、Provider 主页/服务/作品/档期与预约闭环已接入 Supabase；未配置或无法访问 Supabase 时，部分原型流程会回退到 mock data / localStorage。
- 保存方案等仍使用 localStorage 的原型数据只保存在当前浏览器，清理站点数据后会丢失，且不能跨设备同步。
- 未实现真实预约订单、支付、消息系统和收藏列表。
- LLM 不直接推荐 Provider；所有方案仍由本地确定性 Recommendation Engine 生成并校验。Edge Function 不可用时自动使用本地 fallback。
- 区划选择目前是原型用子集，后续可替换为完整中国区划 JSON。
- 图片使用 FileReader 转 data URL 存入 localStorage，适合原型验证，不适合作为正式图片存储方案。

## LLM 配置

需求理解通过 Supabase Edge Function `parse-requirement` 调用可配置的 LLM Provider。浏览器只保留 Function 名称和超时时间，不保存供应商 API Key。

Edge Function 支持以下环境变量：

- `LLM_PROVIDER`：供应商标识，默认 `openai`。
- `LLM_API_KEY`：供应商 API Key。
- `LLM_MODEL`：模型名称。
- `LLM_BASE_URL`：OpenAI-compatible API 的基础地址，不包含末尾的 `responses` 或 `chat/completions`。
- `LLM_API_STYLE`：`responses` 或 `chat-completions`。
- `LLM_JSON_MODE`：Chat Completions 模式下可选 `json-schema`、`json-object` 或 `prompt`。
- `LLM_ENDPOINT`：可选。供应商路径不标准时，用完整请求地址覆盖自动拼接结果。

默认配置继续兼容原有 `OPENAI_API_KEY` 和 `OPENAI_MODEL`。推荐新部署统一使用 `LLM_*` 变量。

### OpenAI Responses API

```text
LLM_PROVIDER=openai
LLM_API_STYLE=responses
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=<可用模型>
LLM_API_KEY=<仅保存为 Supabase Secret>
```

### OpenAI-compatible Chat Completions

DeepSeek、Qwen 或其他兼容服务使用供应商控制台给出的 Base URL 和模型名：

```text
LLM_PROVIDER=<deepseek|qwen|其他标识>
LLM_API_STYLE=chat-completions
LLM_BASE_URL=<供应商 OpenAI-compatible Base URL>
LLM_MODEL=<供应商模型名>
LLM_API_KEY=<仅保存为 Supabase Secret>
LLM_JSON_MODE=json-schema
```

如果供应商不支持严格 JSON Schema，依次尝试：

1. `LLM_JSON_MODE=json-object`
2. `LLM_JSON_MODE=prompt`

无论使用哪种模式，Edge Function 都会在服务端解析并校验 `ProjectRequirement`。格式不合格或 API 不可用时，前端自动回退到本地解析，不会让 LLM 直接生成 Provider 推荐。

配置完成后重新部署：

```powershell
supabase functions deploy parse-requirement
```

保持 `src/supabase-config.js` 中的 Supabase URL 与 anon key 有效。任何供应商 API Key 都不应写入前端文件或提交到 Git。
