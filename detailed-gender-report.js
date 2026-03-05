/**
 * 详细的 Gender 数据报告
 * 显示每条数据的详细信息和 Gender 字段值
 */

const API_CONFIG = {
  BASE_URL: 'https://api.globaloneclick.org',
  ENDPOINT: '/project/biAdsData/getAllFilterData',
  AUTH_TOKEN: 'globaloneclick',
  CLIENT_ID: 'dce41dca2ad7cfaa5c3e306472571f0d'
};

async function generateDetailedReport() {
  const projectId = '26';
  const startDate = '2026-01-28';
  const endDate = '2026-01-28';
  const platform = 'facebook';
  const campaignName = 'US-META-AO-AO-CV-ROI-All-Image-RT-20250616-All-Adv-GOCAI2.0-MaxValue';

  console.log('📑 详细 Gender 数据报告\n');
  console.log('=' .repeat(120));
  console.log(`Project ID: ${projectId} | Campaign: ${campaignName}`);
  console.log(`Platform: Meta (Facebook) | Date: ${startDate}`);
  console.log('=' .repeat(120) + '\n');

  try {
    // Doris 要求平台参数大写
    const queryParams = new URLSearchParams({
      projectId,
      startDate,
      endDate,
      platform: (platform || '').toUpperCase()
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
      throw new Error(`API Error: ${result.msg || '未知错误'}`);
    }

    const allData = result.data || [];
    const campaignData = allData.filter(row => 
      row.campaignName && row.campaignName.includes(campaignName)
    );

    console.log(`总数据条数: ${campaignData.length}\n`);

    // 分组：有 Gender 数据 vs 无 Gender 数据
    const withGender = campaignData.filter(row => {
      const gender = row.genderType || row.gender || '';
      return gender && String(gender).trim() !== '' && gender !== 'null';
    });

    const withoutGender = campaignData.filter(row => {
      const gender = row.genderType || row.gender || '';
      return !gender || String(gender).trim() === '' || gender === 'null';
    });

    // 显示有 Gender 数据的记录
    console.log('✅ 有 Gender 数据的记录 (' + withGender.length + ' 条)\n');
    console.log('=' .repeat(120));
    
    withGender.forEach((row, index) => {
      console.log(`\n[${index + 1}] ${row.adsetName} > ${row.adName}`);
      console.log(`    Account: ${row.accountName} (${row.accountId})`);
      console.log(`    Gender: ${row.genderType || row.gender || 'N/A'}`);
      console.log(`    Age: ${row.ageRange || 'N/A'}`);
      console.log(`    Cost: $${row.cost || 0} | Impressions: ${row.impressions || 0} | Clicks: ${row.clicks || 0}`);
      console.log(`    Campaign ID: ${row.campaignId}`);
      console.log(`    Ad Set ID: ${row.adsetId}`);
      console.log(`    Ad ID: ${row.adId}`);
    });

    console.log('\n\n' + '=' .repeat(120) + '\n');

    // 显示无 Gender 数据的记录
    console.log('❌ 无 Gender 数据的记录 (' + withoutGender.length + ' 条)\n');
    console.log('=' .repeat(120));
    
    withoutGender.forEach((row, index) => {
      console.log(`\n[${index + 1}] ${row.adsetName} > ${row.adName}`);
      console.log(`    Account: ${row.accountName} (${row.accountId})`);
      console.log(`    Gender: ${row.genderType === null ? 'null' : row.genderType || '(未返回)'}`);
      console.log(`    Age: ${row.ageRange === null ? 'null' : row.ageRange || '(未返回)'}`);
      console.log(`    Cost: $${row.cost || 0} | Impressions: ${row.impressions || 0} | Clicks: ${row.clicks || 0}`);
      console.log(`    Campaign ID: ${row.campaignId}`);
      console.log(`    Ad Set ID: ${row.adsetId}`);
      console.log(`    Ad ID: ${row.adId}`);
    });

    console.log('\n\n' + '=' .repeat(120));
    console.log('📊 统计汇总\n');
    console.log(`有 Gender 数据: ${withGender.length} 条 (${(withGender.length / campaignData.length * 100).toFixed(1)}%)`);
    console.log(`无 Gender 数据: ${withoutGender.length} 条 (${(withoutGender.length / campaignData.length * 100).toFixed(1)}%)`);
    
    // 按 Ad Set 统计
    const adsetStats = {};
    campaignData.forEach(row => {
      const adset = row.adsetName || 'Unknown';
      if (!adsetStats[adset]) {
        adsetStats[adset] = { total: 0, withGender: 0 };
      }
      adsetStats[adset].total++;
      const gender = row.genderType || row.gender || '';
      if (gender && String(gender).trim() !== '' && gender !== 'null') {
        adsetStats[adset].withGender++;
      }
    });

    console.log('\n按广告组 (Ad Set) 统计:');
    Object.entries(adsetStats).forEach(([adset, stats]) => {
      const rate = (stats.withGender / stats.total * 100).toFixed(1);
      console.log(`  ${adset}:`);
      console.log(`    总数: ${stats.total} | 有 Gender: ${stats.withGender} (${rate}%)`);
    });

    console.log('\n' + '=' .repeat(120));

    console.log('\n💡 分析结论:\n');
    
    if (withGender.length === 0) {
      console.log('❌ 该 Campaign 在 2026-01-28 这一天完全没有返回 Gender 字段值');
    } else if (withGender.length === campaignData.length) {
      console.log('✅ 该 Campaign 的所有数据都返回了 Gender 字段值');
    } else {
      console.log(`⚠️  该 Campaign 只有部分数据返回了 Gender 字段值 (${(withGender.length / campaignData.length * 100).toFixed(1)}%)`);
      console.log('\n可能原因:');
      console.log('  1. 部分广告设置了性别定向，部分没有设置');
      console.log('  2. Meta API 只为有实际性别分布的广告返回该维度数据');
      console.log('  3. 部分广告的数据中没有足够的性别统计信息');
      console.log('  4. 某些广告组的定向设置不包含性别维度');
    }

  } catch (error) {
    console.error('❌ 查询失败:', error.message);
    console.error(error);
  }
}

generateDetailedReport().catch(console.error);
