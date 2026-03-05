/**
 * 查询特定 Campaign 的 Gender 字段返回情况
 * Project ID: 26
 * Campaign: US-META-AO-AO-CV-ROI-All-Image-RT-20250616-All-Adv-GOCAI2.0-MaxValue
 * Date: 2026-01-28
 */

const API_CONFIG = {
  BASE_URL: 'https://api.globaloneclick.org',
  ENDPOINT: '/project/biAdsData/getAllFilterData',
  AUTH_TOKEN: 'globaloneclick',
  CLIENT_ID: 'dce41dca2ad7cfaa5c3e306472571f0d'
};

async function checkCampaignGenderData() {
  const projectId = '26';
  const startDate = '2026-01-28';
  const endDate = '2026-01-28';
  const platform = 'facebook'; // Meta 平台对应 facebook
  const campaignName = 'US-META-AO-AO-CV-ROI-All-Image-RT-20250616-All-Adv-GOCAI2.0-MaxValue';

  console.log('🔍 查询 Campaign Gender 字段数据\n');
  console.log('=' .repeat(80));
  console.log('查询参数:');
  console.log(`  Project ID:     ${projectId}`);
  console.log(`  Campaign Name:  ${campaignName}`);
  console.log(`  Platform:       ${platform}`);
  console.log(`  Date:           ${startDate}`);
  console.log('=' .repeat(80) + '\n');

  // 测试1: 不带 segment 参数
  console.log('📊 测试 1: 不带 segment 参数（默认查询）\n');
  await testQuery(projectId, startDate, endDate, platform, [], campaignName);

  console.log('\n' + '='.repeat(80) + '\n');

  // 测试2: 带 gender_adset_date segment 参数
  console.log('📊 测试 2: 带 gender_adset_date segment 参数\n');
  await testQuery(projectId, startDate, endDate, platform, ['gender_adset_date'], campaignName);

  console.log('\n' + '='.repeat(80) + '\n');

  // 测试3: 同时带 age_date 和 gender_adset_date segment 参数
  console.log('📊 测试 3: 同时带 age_date 和 gender_adset_date segment 参数\n');
  await testQuery(projectId, startDate, endDate, platform, ['age_date', 'gender_adset_date'], campaignName);
}

async function testQuery(projectId, startDate, endDate, platform, segmentList, targetCampaign) {
  try {
    // Doris 要求平台参数大写
    const queryParams = new URLSearchParams({
      projectId,
      startDate,
      endDate,
      platform: (platform || '').toUpperCase()
    });

    // 添加 segment 参数
    segmentList.forEach(seg => queryParams.append('segment', seg));

    const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINT}?${queryParams}`;
    
    console.log(`📡 请求 URL: ${url}`);
    console.log(`   Segments: ${segmentList.length > 0 ? segmentList.join(', ') : '无'}\n`);

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
    console.log(`✅ API 响应成功，总数据条数: ${allData.length}\n`);

    if (allData.length === 0) {
      console.log('⚠️  未返回任何数据\n');
      return;
    }

    // 筛选目标 Campaign
    const campaignData = allData.filter(row => 
      row.campaignName && row.campaignName.includes(targetCampaign)
    );

    console.log(`🎯 筛选目标 Campaign: ${campaignData.length} 条数据\n`);

    if (campaignData.length === 0) {
      console.log('⚠️  未找到目标 Campaign 的数据\n');
      console.log('   可能的 Campaign 列表:');
      const uniqueCampaigns = [...new Set(allData.map(row => row.campaignName))];
      uniqueCampaigns.slice(0, 10).forEach(name => {
        console.log(`   - ${name}`);
      });
      if (uniqueCampaigns.length > 10) {
        console.log(`   ... 还有 ${uniqueCampaigns.length - 10} 个 campaigns`);
      }
      return;
    }

    // 分析第一条数据
    console.log('📋 第一条数据详情:');
    const firstRow = campaignData[0];
    console.log(JSON.stringify({
      campaignName: firstRow.campaignName,
      campaignId: firstRow.campaignId,
      recordDate: firstRow.recordDate,
      platform: firstRow.platform,
      accountId: firstRow.accountId,
      accountName: firstRow.accountName,
      adsetName: firstRow.adsetName,
      adName: firstRow.adName,
      genderType: firstRow.genderType,
      ageRange: firstRow.ageRange,
      cost: firstRow.cost,
      impressions: firstRow.impressions
    }, null, 2));
    console.log('\n');

    // 检查 Gender 字段
    const genderFields = [
      { key: 'genderType', label: 'genderType' },
      { key: 'gender', label: 'gender' },
      { key: 'gender_type', label: 'gender_type' }
    ];

    console.log('🔍 Gender 字段检查:\n');
    let hasGender = false;
    
    genderFields.forEach(({ key, label }) => {
      const exists = key in firstRow;
      const value = firstRow[key];
      const hasValue = value && String(value).trim() !== '';
      
      console.log(`   ${label}:`);
      console.log(`     存在性: ${exists ? '✅ 存在' : '❌ 不存在'}`);
      if (exists) {
        console.log(`     值: "${value}"`);
        console.log(`     有效性: ${hasValue ? '✅ 有值' : '❌ 空值'}`);
        if (hasValue) hasGender = true;
      }
      console.log('');
    });

    // 统计所有数据的 Gender 情况
    let genderCount = 0;
    const genderValues = new Set();

    campaignData.forEach(row => {
      const genderValue = row.genderType || row.gender || row.gender_type || '';
      if (String(genderValue).trim()) {
        genderCount++;
        genderValues.add(genderValue);
      }
    });

    console.log('📊 Gender 数据统计:');
    console.log(`   包含 Gender 数据的行数: ${genderCount} / ${campaignData.length}`);
    console.log(`   覆盖率: ${(genderCount / campaignData.length * 100).toFixed(1)}%\n`);

    if (genderValues.size > 0) {
      console.log('   Gender 值分布:');
      Array.from(genderValues).forEach(gender => {
        const count = campaignData.filter(row => 
          (row.genderType || row.gender || row.gender_type || '') === gender
        ).length;
        console.log(`     - ${gender}: ${count} 条`);
      });
      console.log('');
    }

    // 结论
    console.log('💡 结论:\n');
    if (genderCount === 0) {
      console.log('   ❌ 该 Campaign 在此日期没有返回 Gender 字段值');
      console.log('   原因可能是:');
      console.log('      1. 后端 API 未返回 genderType 字段');
      console.log('      2. 需要添加正确的 segment 参数');
      console.log('      3. Meta 广告未设置性别定向');
      console.log('      4. 该日期的数据未包含性别维度');
    } else {
      console.log(`   ✅ 该 Campaign 返回了 Gender 字段值 (覆盖率: ${(genderCount / campaignData.length * 100).toFixed(1)}%)`);
      console.log(`   Gender 值: ${Array.from(genderValues).join(', ')}`);
    }

  } catch (error) {
    console.error('❌ 查询失败:', error.message);
    console.error(error);
  }
}

// 运行查询
checkCampaignGenderData().catch(console.error);
