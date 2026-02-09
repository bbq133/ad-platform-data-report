/**
 * 拉取 Campaign Name + Ad Set + Ad + Cost 列表，导出 Excel
 * 数据源：projectId 26 (ecoflow-us-all)，所有账号，2026-01-27 至 2026-02-09
 *
 * 使用方法：node campaign-adset-ad-cost-list.js
 */

import * as XLSX from 'xlsx';

const API_CONFIG = {
  BASE_URL: 'https://api.globaloneclick.org',
  ENDPOINT: '/project/adsData/getAllFilterData',
  AUTH_TOKEN: 'globaloneclick',
  CLIENT_ID: 'dce41dca2ad7cfaa5c3e306472571f0d'
};

async function fetchAndExportList() {
  const projectId = 26;
  const startDate = '2026-01-27';
  const endDate = '2026-02-09';

  console.log('正在拉取数据...');
  console.log('- Project ID: 26 (ecoflow-us-all)');
  console.log('- 时间范围:', startDate, '~', endDate);
  console.log('- 账号: 全部\n');

  try {
    let data = [];
    for (const platform of ['facebook', 'google']) {
      const queryParams = new URLSearchParams({
        projectId: String(projectId),
        startDate,
        endDate,
        platform
      });
      const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINT}?${queryParams}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${API_CONFIG.AUTH_TOKEN}`,
          'clientid': API_CONFIG.CLIENT_ID,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      if (result.code !== 200) {
        throw new Error(result.msg || 'API 请求失败');
      }

      const platformData = result.data || [];
      data = data.concat(platformData);
    }

    // 只保留 segments="ad_date" 的行，避免 age_date/gender_adset_date/country_campaign_date 等拆分行重复累加 cost
    const baseData = data.filter(r => (r.segments || '').toLowerCase() === 'ad_date');
    if (baseData.length === 0) {
      console.log('未找到 segments=ad_date 的基础数据');
      return;
    }
    data = baseData;

    // 按 campaign + ad set + ad 汇总 cost
    const map = new Map();
    for (const row of data) {
      const key = [
        row.campaignName || '(无名称)',
        row.adsetName || '(无名称)',
        row.adName || '(无名称)'
      ].join('\0');
      const cost = Number(row.cost) || Number(row.costUsd) || 0;
      const cur = map.get(key) || 0;
      map.set(key, cur + cost);
    }

    // 转为列表并按 cost 降序
    const list = Array.from(map.entries())
      .map(([key, cost]) => {
        const [campaignName, adsetName, adName] = key.split('\0');
        return { campaignName, adsetName, adName, cost };
      })
      .sort((a, b) => b.cost - a.cost);

    // 表头顺序：Campaign Name, Ad Set, Ad, Cost
    const rows = list.map(r => ({
      'Campaign Name': r.campaignName,
      'Ad Set': r.adsetName,
      'Ad': r.adName,
      'Cost': r.cost
    }));

    // 生成 Excel
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Campaign-AdSet-Ad-Cost');

    const excelPath = 'campaign-adset-ad-cost-list.xlsx';
    XLSX.writeFile(wb, excelPath);

    console.log('Campaign Name\tAd Set\tAd\tCost');
    console.log('-'.repeat(80));
    for (const r of list.slice(0, 20)) {
      console.log(`${r.campaignName}\t${r.adsetName}\t${r.adName}\t${r.cost.toFixed(2)}`);
    }
    if (list.length > 20) {
      console.log(`... 还有 ${list.length - 20} 行`);
    }
    console.log('-'.repeat(80));
    console.log(`共 ${list.length} 行，总 Cost: ${list.reduce((s, x) => s + x.cost, 0).toFixed(2)}`);
    console.log(`\n已导出 Excel: ${excelPath}`);
  } catch (err) {
    console.error('拉取失败:', err.message);
    throw err;
  }
}

fetchAndExportList();
