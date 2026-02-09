/**
 * 拉取 Campaign Name + Cost 列表
 * 数据源：projectId 26 (ecoflow-us-all)，所有账号，2026-01-27 至 2026-02-09
 *
 * 使用方法：node campaign-cost-list.js
 */

const API_CONFIG = {
  BASE_URL: 'https://api.globaloneclick.org',
  ENDPOINT: '/project/adsData/getAllFilterData',
  AUTH_TOKEN: 'globaloneclick',
  CLIENT_ID: 'dce41dca2ad7cfaa5c3e306472571f0d'
};

async function fetchCampaignCostList() {
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

    // 只保留 segments="ad_date"，避免 age_date/gender_adset_date/country_campaign_date 等拆分行重复累加 cost
    data = data.filter(r => (r.segments || '').toLowerCase() === 'ad_date');
    if (data.length === 0) {
      console.log('未返回任何数据');
      return;
    }

    // 按 campaign name 汇总 cost
    const campaignMap = new Map();
    for (const row of data) {
      const name = row.campaignName || '(无名称)';
      const cost = Number(row.cost) || Number(row.costUsd) || 0;
      const cur = campaignMap.get(name) || 0;
      campaignMap.set(name, cur + cost);
    }

    // 按 cost 降序
    const list = Array.from(campaignMap.entries())
      .map(([campaignName, cost]) => ({ campaignName, cost }))
      .sort((a, b) => b.cost - a.cost);

    // 输出表格
    const sep = '\t';
    console.log('Campaign Name' + sep + 'Cost');
    console.log('-'.repeat(60));
    for (const { campaignName, cost } of list) {
      console.log(campaignName + sep + cost.toFixed(2));
    }
    console.log('-'.repeat(60));
    console.log(`共 ${list.length} 个 Campaign，总 Cost: ${list.reduce((s, x) => s + x.cost, 0).toFixed(2)}`);

    // 同时输出 CSV 便于导出
    const csvPath = 'campaign-cost-list.csv';
    const fs = await import('fs');
    const csvContent = 'Campaign Name,Cost\n' + list.map(r => `"${(r.campaignName || '').replace(/"/g, '""')}",${r.cost.toFixed(2)}`).join('\n');
    fs.default.writeFileSync(csvPath, '\uFEFF' + csvContent, 'utf8');
    console.log(`\n已导出 CSV: ${csvPath}`);
  } catch (err) {
    console.error('拉取失败:', err.message);
    throw err;
  }
}

fetchCampaignCostList();
