# CosPilot

CosPilot 是一个面向二次元 Cos 出片的一站式平台原型，目标是连接 Coser 与妆造师、假发/毛娘、摄影师、摄影棚/场地、后期等服务者。当前版本重点验证“自然语言需求 -> Agent 拆解 -> Provider 匹配 -> 方案保存 -> 服务者主页/工作台”的最小业务闭环。

## 项目介绍

用户可以用一句自然语言描述拍摄需求，例如角色、作品、城市、日期区间、预算、风格和已有物品。系统会将需求解析为结构化 `ProjectRequirement`，再基于统一 Provider 数据源生成可解释推荐方案。Provider 端可以维护公开主页、服务项目、作品和可预约档期，推荐引擎会读取同一份业务数据。

## 功能

- 自然语言需求输入与本地 fallback 解析。
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

- 数据仍为 mock data 与 localStorage，本地浏览器清理缓存后数据会丢失。
- 未接 Supabase 或真实后端数据库。
- 未实现真实预约订单、支付、消息系统和收藏列表。
- Provider 数据、方案数据、账户数据都保存在浏览器本地，不能跨设备同步。
- LLM 解析层仍以本地 fallback / 原型逻辑为主，展示前会以本地 Provider 数据校验为准。
- 区划选择目前是原型用子集，后续可替换为完整中国区划 JSON。
- 图片使用 FileReader 转 data URL 存入 localStorage，适合原型验证，不适合作为正式图片存储方案。
