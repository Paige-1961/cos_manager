# CosPilot 第一阶段原型

这是一个二次元 cos 出片一站式平台的第一阶段网页原型。当前版本重点不是完整交易平台，而是跑通一条可解释的 AI Agent 工作流：

用户需求 -> 需求解析 -> 任务缺口识别 -> 候选服务者筛选 -> 约束检查 -> 方案组合 -> 预算检查 -> 档期检查 -> 冲突处理 -> Brief 与计划输出

## 当前实现

- 无构建依赖，直接打开 `index.html` 即可运行。
- `src/data.js` 保存第一版 mock 服务者数据。
- `src/agentPipeline.js` 保存可解释工作流，每一步都有输入、输出和 explanation。
- `src/app.js` 负责页面渲染和表单交互。
- `src/styles.css` 使用设计 token 和较松耦合的 class，方便后续 UI 重做。

## 后续升级方向

1. 把 `src/data.js` 替换为 Supabase 数据表。
2. 把 `agentPipeline.js` 中的解析、方案生成、Brief 生成逐步接入 LLM。
3. 将当前静态 UI 迁移到 React/Next.js 组件。
4. 增加服务者主页、作品上传、评价、站内消息和真实档期管理。
