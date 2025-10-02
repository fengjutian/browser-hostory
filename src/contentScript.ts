// contentScript.ts
// 在页面上捕捉含 password 类型的 input 的 form submit

function findPasswordForms() {
  return Array.from(document.querySelectorAll('form')).filter((form) => {
    return !!form.querySelector('input[type="password"]');
  }) as HTMLFormElement[];
}

function handleFormSubmit(ev: Event) {
  try {
    const form = ev.currentTarget as HTMLFormElement;
    const pw = form.querySelector('input[type="password"]') as HTMLInputElement | null;
    if (!pw) return;
    const url = location.href;
    const domain = location.hostname;
    const payload = {
      domain,
      url,
      timestamp: Date.now(),
      method: 'detected'
    };
    // 上报到后台
    chrome.runtime.sendMessage({ type: 'report_login', payload }, (res) => {

    });
  } catch (e) {
    // ignore
  }
}

function attachListeners() {
  const forms = findPasswordForms();
  forms.forEach((f) => {
    // 防止重复绑定
    (f as any).__plasmo_listened = (f as any).__plasmo_listened || (() => {
      f.addEventListener('submit', handleFormSubmit, { capture: true, passive: true });
    })();
  });
}

// 早期绑定 & 监视 DOM 变化
attachListeners();
const mo = new MutationObserver(() => attachListeners());
mo.observe(document, { childList: true, subtree: true });