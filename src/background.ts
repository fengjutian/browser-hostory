// background.ts
// 1) 接收来自 content script 的登录上报
// 2) 存储登录事件（按域名）到 chrome.storage.local
// 3) 响应 popup 的请求（导出历史、获取登录数据、用历史关键词补充检测）

// 定义登录事件类型
type LoginEvent = {
  domain: string;
  url: string;
  timestamp: number; // ms
  method: 'detected' | 'history_keyword';
};

const LOGIN_STORAGE_KEY = 'plasmo_login_events_v1';

// 存储登录事件
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'report_login') {
    const ev: LoginEvent = message.payload;
    // 读取并追加
    chrome.storage.local.get([LOGIN_STORAGE_KEY], (res) => {
      const arr: LoginEvent[] = res[LOGIN_STORAGE_KEY] || [];
      arr.push(ev);
      chrome.storage.local.set({ [LOGIN_STORAGE_KEY]: arr });
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === 'get_logins') {
    chrome.storage.local.get([LOGIN_STORAGE_KEY], (res) => {
      sendResponse({ events: res[LOGIN_STORAGE_KEY] || [] });
    });
    return true; // async
  }

  if (message?.type === 'export_history') {
    // 使用 chrome.history.search 获取过去 N 天的历史
    const { text = '', maxResults = 10000, startTimeDays = 365 } = message.payload || {};
    const startTime = Date.now() - startTimeDays * 24 * 3600 * 1000;
    chrome.history.search({ text, startTime, maxResults }, (results) => {
      // results: Array<HistoryItem>
      sendResponse({ history: results });
    });
    return true;
  }
});

// 一个可被调用的函数：基于历史关键词，补充 login events（可在 popup 中触发）
// 基于历史关键词扫描登录事件
async function scanHistoryForLoginKeywords(days = 365) {
  const startTime = Date.now() - days * 24 * 3600 * 1000;
  return new Promise<chrome.history.HistoryItem[]>((resolve) => {
    chrome.history.search({ text: '', startTime, maxResults: 10000 }, (results) => {
      const keywords = /(login|signin|auth|account|oauth|openid|sign-in|sign_in)/i;
      const matched = results.filter((r) => keywords.test(r.url || '') || keywords.test(r.title || ''));
      resolve(matched);
    });
  });
}

// 可通过 runtime message 调用 'scan_history_keywords'
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'scan_history_keywords') {
    const days: number = message.payload?.days || 365;
    scanHistoryForLoginKeywords(days).then((matched) => {
      // 将这些匹配当作 login events 存储
      const now = Date.now();
      const toSave: LoginEvent[] = matched.map((m) => ({
        domain: new URL(m.url!).hostname,
        url: m.url!,
        timestamp: m.lastVisitTime || now,
        method: 'history_keyword'
      }));
      chrome.storage.local.get([LOGIN_STORAGE_KEY], (res) => {
        const arr: LoginEvent[] = res[LOGIN_STORAGE_KEY] || [];
        const merged = arr.concat(toSave);
        // 去重（按 url+timestamp）
        const seen = new Set<string>();
        const uniq = merged.filter((e) => {
          const k = `${e.url}::${e.timestamp}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        chrome.storage.local.set({ [LOGIN_STORAGE_KEY]: uniq }, () => {
          sendResponse({ ok: true, added: toSave.length });
        });
      });
    });
    return true;
  }
});