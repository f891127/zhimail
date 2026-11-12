/** OpenAI 兼容大模型服务商预设 */

export interface AIProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
  /** 是否需要 API Key（本地 Ollama 不需要） */
  requiresKey: boolean;
  note?: string;
}

export const AI_PROVIDERS: AIProviderPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek 深度求索',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    requiresKey: true,
    note: '默认推荐：中文邮件摘要与简报性价比最高，deepseek-reasoner 适合复杂汇总',
  },
  {
    id: 'dashscope',
    label: '阿里云百炼 · 通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-long', 'qwen3-max'],
    requiresKey: true,
    note: 'qwen-long 支持超长上下文，适合整月邮件汇总',
  },
  {
    id: 'volcengine',
    label: '火山方舟 · 豆包',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-1.5-pro-32k',
    models: ['doubao-1.5-pro-32k', 'doubao-1.5-lite-32k', 'doubao-pro-32k'],
    requiresKey: true,
    note: '模型名称也可填方舟的接入点 ID（ep-xxxx）',
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-plus',
    models: ['glm-4-plus', 'glm-4-air', 'glm-4-flash', 'glm-4-long'],
    requiresKey: true,
  },
  {
    id: 'moonshot',
    label: 'Moonshot Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-32k',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-k2-0905-preview'],
    requiresKey: true,
    note: '长上下文，适合整会话串与月报汇总',
  },
  {
    id: 'hunyuan',
    label: '腾讯混元',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    defaultModel: 'hunyuan-turbos-latest',
    models: ['hunyuan-turbos-latest', 'hunyuan-large', 'hunyuan-standard'],
    requiresKey: true,
  },
  {
    id: 'qianfan',
    label: '百度智能云千帆 · 文心',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    defaultModel: 'ernie-4.5-turbo-128k',
    models: ['ernie-4.5-turbo-128k', 'ernie-4.0-8k', 'ernie-speed-128k'],
    requiresKey: true,
    note: '需在千帆控制台创建 API Key（Bearer 形式）',
  },
  {
    id: 'spark',
    label: '讯飞星火',
    baseUrl: 'https://spark-api-open.xf-yun.com/v1',
    defaultModel: 'generalv3.5',
    models: ['generalv3.5', '4.0Ultra', 'lite'],
    requiresKey: true,
  },
  {
    id: 'lingyi',
    label: '零一万物 Yi',
    baseUrl: 'https://api.lingyiwanwu.com/v1',
    defaultModel: 'yi-lightning',
    models: ['yi-lightning', 'yi-large', 'yi-medium'],
    requiresKey: true,
  },
  {
    id: 'stepfun',
    label: '阶跃星辰 StepFun',
    baseUrl: 'https://api.stepfun.com/v1',
    defaultModel: 'step-2-16k',
    models: ['step-2-16k', 'step-1-32k', 'step-1-flash'],
    requiresKey: true,
  },
  {
    id: 'baichuan',
    label: '百川智能',
    baseUrl: 'https://api.baichuan-ai.com/v1',
    defaultModel: 'Baichuan4',
    models: ['Baichuan4', 'Baichuan3-Turbo'],
    requiresKey: true,
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    baseUrl: 'https://api.minimax.chat/v1',
    defaultModel: 'abab6.5s-chat',
    models: ['abab6.5s-chat', 'abab6.5-chat'],
    requiresKey: true,
    note: '如接口返回协议不兼容，请改用「自定义」填写兼容地址',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
    requiresKey: true,
  },
  {
    id: 'siliconflow',
    label: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'Qwen/Qwen2.5-72B-Instruct',
    models: [
      'Qwen/Qwen2.5-72B-Instruct',
      'Qwen/Qwen2.5-7B-Instruct',
      'deepseek-ai/DeepSeek-V3',
    ],
    requiresKey: true,
    note: '一个 Key 可调用多种开源模型',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-flash-1.5'],
    requiresKey: true,
  },
  {
    id: 'ollama',
    label: 'Ollama 本地模型',
    baseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: 'qwen2.5:7b',
    models: ['qwen2.5:7b', 'qwen2.5:14b', 'llama3.1:8b'],
    requiresKey: false,
    note: '数据不出本机，适合对隐私要求高的场景',
  },
  {
    id: 'custom',
    label: '自定义 OpenAI 兼容接口',
    baseUrl: '',
    defaultModel: '',
    models: [],
    requiresKey: true,
    note: '填写完整的 base URL，例如 https://your-host/v1',
  },
];

export function findProvider(id: string): AIProviderPreset | undefined {
  return AI_PROVIDERS.find((p) => p.id === id);
}
