/**
 * API 测试脚本 - 验证 Age 和 Gender 数据返回
 * 
 * 使用方法：node test-api.js
 */

const API_CONFIG = {
  BASE_URL: 'https://api.globaloneclick.org',
  ENDPOINT: '/project/adsData/getAllFilterData',
  AUTH_TOKEN: 'globaloneclick',
  CLIENT_ID: 'globaloneclickClientId'
};

async function testAgeGenderData() {
  // 测试参数 - 请根据实际情况修改
  const projectId = '11'; // 替换为实际的项目ID
  const startDate = '2026-01-01';
  const endDate = '2026-01-31';
  const platform = 'facebook';
  const segmentList = []; // 先测试不带 segment 是否有数据

  console.log('🔍 开始测试 API 数据返回...\n');
  console.log('测试配置:');
  console.log('- Project ID:', projectId);
  console.log('- Date Range:', `${startDate} ~ ${endDate}`);
  console.log('- Platform:', platform);
  console.log('- Segments:', segmentList.join(', '));
  console.log('\n' + '='.repeat(80) + '\n');

  // 构建查询参数
  const queryParams = new URLSearchParams({
    projectId,
    startDate,
    endDate,
    platform
  });

  // 添加 segment 参数
  segmentList.forEach(seg => queryParams.append('segment', seg));

  const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINT}?${queryParams}`;

  console.log('📡 请求 URL:', url);
  console.log('\n' + '='.repeat(80) + '\n');

  try {
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

    const data = result.data || [];

    console.log('✅ API 响应成功!');
    console.log(`📊 返回数据总数: ${data.length} 条\n`);

    if (data.length === 0) {
      console.log('⚠️  未返回任何数据，可能原因：');
      console.log('   1. 所选日期范围内没有数据');
      console.log('   2. 项目ID不正确');
      console.log('   3. 账号没有投放广告\n');
      return;
    }

    // 分析数据
    console.log('🔬 数据分析:\n');

    // 检查第一条数据的结构
    console.log('📋 第一条数据示例:');
    console.log(JSON.stringify(data[0], null, 2));
    console.log('\n' + '='.repeat(80) + '\n');

    // 检查字段存在性
    const firstRow = data[0];
    const hasAgeRange = 'ageRange' in firstRow;
    const hasGenderType = 'genderType' in firstRow;
    const hasAge = 'age' in firstRow;
    const hasGender = 'gender' in firstRow;

    console.log('📊 字段检查:');
    console.log(`   ageRange:   ${hasAgeRange ? '✅ 存在' : '❌ 不存在'} ${hasAgeRange ? `(值: "${firstRow.ageRange}")` : ''}`);
    console.log(`   genderType: ${hasGenderType ? '✅ 存在' : '❌ 不存在'} ${hasGenderType ? `(值: "${firstRow.genderType}")` : ''}`);
    console.log(`   age:        ${hasAge ? '✅ 存在' : '❌ 不存在'} ${hasAge ? `(值: "${firstRow.age}")` : ''}`);
    console.log(`   gender:     ${hasGender ? '✅ 存在' : '❌ 不存在'} ${hasGender ? `(值: "${firstRow.gender}")` : ''}`);
    console.log('');

    // 统计有效数据
    let ageCount = 0;
    let genderCount = 0;

    data.forEach(row => {
      const ageValue = row.ageRange || row.age || '';
      const genderValue = row.genderType || row.gender || '';
      
      if (String(ageValue).trim()) ageCount++;
      if (String(genderValue).trim()) genderCount++;
    });

    console.log('📈 数据统计:');
    console.log(`   包含年龄数据的行数:   ${ageCount} / ${data.length} (${(ageCount / data.length * 100).toFixed(1)}%)`);
    console.log(`   包含性别数据的行数:   ${genderCount} / ${data.length} (${(genderCount / data.length * 100).toFixed(1)}%)`);
    console.log('');

    // 显示年龄和性别的唯一值
    const uniqueAges = new Set();
    const uniqueGenders = new Set();

    data.forEach(row => {
      const ageValue = row.ageRange || row.age || '';
      const genderValue = row.genderType || row.gender || '';
      
      if (String(ageValue).trim()) uniqueAges.add(ageValue);
      if (String(genderValue).trim()) uniqueGenders.add(genderValue);
    });

    if (uniqueAges.size > 0) {
      console.log('📊 年龄段分布:');
      Array.from(uniqueAges).sort().forEach(age => {
        const count = data.filter(row => 
          (row.ageRange || row.age || '') === age
        ).length;
        console.log(`   - ${age}: ${count} 条`);
      });
      console.log('');
    }

    if (uniqueGenders.size > 0) {
      console.log('📊 性别分布:');
      Array.from(uniqueGenders).forEach(gender => {
        const count = data.filter(row => 
          (row.genderType || row.gender || '') === gender
        ).length;
        console.log(`   - ${gender}: ${count} 条`);
      });
      console.log('');
    }

    // 诊断建议
    console.log('💡 诊断结果:\n');
    
    if (ageCount === 0 && genderCount === 0) {
      console.log('❌ 问题: API 返回的数据中没有年龄和性别信息\n');
      console.log('可能原因：');
      console.log('1. ✅ segment 参数已正确传递，但后端可能未返回这些字段');
      console.log('2. 该项目的广告投放未设置年龄/性别定向');
      console.log('3. Meta/Google 平台未提供这些维度的数据');
      console.log('4. 需要检查后端接口是否正确处理 segment 参数\n');
      console.log('建议：');
      console.log('- 联系后端开发确认 API 是否支持返回 ageRange/genderType 字段');
      console.log('- 检查 Meta Ads API 是否配置了相应的 breakdown 参数');
    } else if (ageCount > 0 && genderCount > 0) {
      console.log('✅ 成功: API 正确返回了年龄和性别数据！');
      console.log(`   - 年龄数据覆盖率: ${(ageCount / data.length * 100).toFixed(1)}%`);
      console.log(`   - 性别数据覆盖率: ${(genderCount / data.length * 100).toFixed(1)}%`);
    } else {
      console.log('⚠️  部分数据缺失:');
      if (ageCount === 0) console.log('   - 年龄数据完全缺失');
      if (genderCount === 0) console.log('   - 性别数据完全缺失');
    }

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('\n详细错误信息:');
    console.error(error);
  }
}

// 运行测试
testAgeGenderData();
