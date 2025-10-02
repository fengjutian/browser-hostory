import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

type LoginEvent = { domain: string; url: string; timestamp: number; method: string };

export default function Popup() {
  const [events, setEvents] = useState<LoginEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, []);

  function fetchEvents() {
    chrome.runtime.sendMessage({ type: 'get_logins' }, (res) => {
      setEvents(res?.events || []);
    });
  }

  function exportHistory() {
    setLoading(true);
    chrome.runtime.sendMessage({ type: 'export_history', payload: { startTimeDays: 365, maxResults: 10000 } }, (res) => {
      const history = res?.history || [];
      const csv = historyToCSV(history);
      downloadFile(csv, `history_${new Date().toISOString()}.csv`, 'text/csv');
      setLoading(false);
    });
  }

  function scanHistoryKeywords() {
    setLoading(true);
    chrome.runtime.sendMessage({ type: 'scan_history_keywords', payload: { days: 365 } }, (res) => {
      // 重新读取
      fetchEvents();
      setLoading(false);
    });
  }

  // 移除重复的注释行，保留一行
  // 聚合按域名计数
  const byDomain: { domain: string; count: number }[] = Object.entries(
    events.reduce((acc: Record<string, number>, e) => {
      acc[e.domain] = (acc[e.domain] || 0) + 1;
      return acc;
    }, {})
  ).map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count).slice(0, 30);

  // 时间序列（按日）
  const timeseries = (() => {
    const map = new Map<string, number>();
    events.forEach((e) => {
      const d = new Date(e.timestamp);
      const key = d.toISOString().slice(0, 10);
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
  })();

  return (
    <div className="p-4 w-96">
      <h2 className="text-lg font-semibold mb-2">History & Login Analyzer</h2>
      <div className="flex gap-2 mb-3">
        <button className="px-3 py-1 rounded bg-slate-700 text-white" onClick={exportHistory} disabled={loading}>导出浏览历史 (CSV)</button>
        <button className="px-3 py-1 rounded border" onClick={scanHistoryKeywords} disabled={loading}>从历史扫描登录关键词</button>
        <button className="px-3 py-1 rounded border" onClick={fetchEvents}>刷新登录事件</button>
      </div>

      <section className="mb-3">
        <h3 className="font-medium">按域名登录次数（Top 30）</h3>
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byDomain} margin={{ left: 10, right: 10, top: 10, bottom: 10 }}>
              <XAxis dataKey="domain" hide />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="text-sm mt-2">Top 域名: {byDomain.slice(0,3).map(d=>d.domain).join(', ') || '无'}</div>
      </section>

      <section>
        <h3 className="font-medium">登录时间序列</h3>
        <div style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={timeseries} margin={{ left: 10, right: 10, top: 10, bottom: 10 }}>
              <XAxis dataKey="date" hide />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#8884d8" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="mt-3 text-xs text-slate-600">
        <div>说明：</div>
        <ul className="list-disc pl-4">
          <li>登录检测基于页面表单中 password 输入的提交 (内容脚本) 和历史 URL 关键词扫描两种方式。</li>
          <li>如需更高准确率，可在服务器端与实际登录响应配合使用（此扩展只是本地侧的近似检测）。</li>
        </ul>
      </section>
    </div>
  );
}

function historyToCSV(history: any[]) {
  const header = ['id','url','title','lastVisitTime','typedCount','visitCount'];
  const rows = history.map(h => [h.id, h.url?.replace(/"/g,'""'), h.title?.replace(/"/g,'""'), h.lastVisitTime, h.typedCount, h.visitCount]);
  const lines = [header.join(','), ...rows.map(r => r.map(c=>`"${c ?? ''}"`).join(','))];
  return lines.join('\n');
}

function downloadFile(content: string, filename: string, mime = 'text/plain'){
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}