/** 将本地 mock 模型写入应用设置，仅用于离线截图演示。 */

const { app } = require('electron');
const path = require('node:path');

app.setName('ZhiMail');
app.disableHardwareAcceleration();

app.whenReady().then(() => {
  const { store } = require('../dist-electron/services/store');
  const dataDir = path.join(app.getPath('userData'), 'zhimail-data');
  store.init(dataDir);
  store.setAIKey('mock-key');
  store.updateSettings({
    ai: {
      provider: 'custom',
      baseUrl: 'http://127.0.0.1:8787/v1',
      model: 'mock-model',
      temperature: 0.3,
      maxTokens: 2000,
      timeoutMs: 30000,
      metadataOnly: false,
      hasApiKey: true,
    },
  });
  store.flush();
  console.log('[seed] AI 设置已写入', dataDir);
  app.exit(0);
});
