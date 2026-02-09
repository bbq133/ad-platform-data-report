/**
 * 诊断 Cost 重复计算问题
 * 分析 projectId 26 的原始 API 返回，检查 segments、platform、recordDate 等维度
 *
 * 使用方法：node diagnose-cost-duplication.js
 */

const API_CONFIG = {
  BASE_URL: 'https://api.globaloneclick.org',
  ENDPOINT: '/project/adsData/getAllFilterData',
  AUTH_TOKEN: 'globaloneclick',
  CLIENT_ID: 'dce41dca2ad7cfaa5c3e306472571f0d'
};

async function diagnose() {
  const projectId = 26;
  const startDate = '2026-01-27';
  const endDate = '2026-02-09';

  console.log('=== Cost 重复计算诊断 ===\n');
  console.log('参数: projectId=26, 2026-01-27 ~ 2026-02-09\n');

  // 1. 拉取 Facebook 数据 - 不带 segment（与 campaign-adset-ad-cost-list.js 一致）
  console.log('--- 1. Facebook 数据（不带 segment）---');
  const fbNoSeg = await fetchData(projectId, startDate, endDate, 'facebook', []);
  if (fbNoSeg.length > 0) {
    const totalCost = fbNoSeg.reduce((s, r) => s + (Number(r.cost) || Number(r.costUsd) || 0), 0);
    console.log(`  行数: ${fbNoSeg.length}`);
    console.log(`  总 Cost: ${totalCost.toFixed(2)}`);
    const segCount = {};
    fbNoSeg.forEach(r => {
      const s = r.segments || '(空)';
      segCount[s] = (segCount[s] || 0) + 1;
    });
    console.log('  segments 分布:', segCount);
    if (fbNoSeg[0]) {
      console.log('  示例行 segments:', JSON.stringify(fbNoSeg[0].segments));
    }
  }

  // 2. 拉取 Google 数据 - 不带 segment
  console.log('\n--- 2. Google 数据（不带 segment）---');
  const ggNoSeg = await fetchData(projectId, startDate, endDate, 'google', []);
  if (ggNoSeg.length > 0) {
    const totalCost = ggNoSeg.reduce((s, r) => s + (Number(r.cost) || Number(r.costUsd) || 0), 0);
    console.log(`  行数: ${ggNoSeg.length}`);
    console.log(`  总 Cost: ${totalCost.toFixed(2)}`);
  } else {
    console.log('  无数据');
  }

  // 3. Facebook + Google 合并（当前脚本逻辑）
  const allNoSeg = [...(fbNoSeg || []), ...(ggNoSeg || [])];
  const mergedTotal = allNoSeg.reduce((s, r) => s + (Number(r.cost) || Number(r.costUsd) || 0), 0);
  console.log('\n--- 3. Facebook + Google 合并（当前脚本）---');
  console.log(`  总行数: ${allNoSeg.length}`);
  console.log(`  总 Cost（直接相加所有行）: ${mergedTotal.toFixed(2)}`);

  // 4. 按 segments 分别汇总
  const bySeg = {};
  allNoSeg.forEach(r => {
    const s = r.segments || '(空)';
    if (!bySeg[s]) bySeg[s] = { rows: 0, cost: 0 };
    bySeg[s].rows++;
    bySeg[s].cost += Number(r.cost) || Number(r.costUsd) || 0;
  });
  console.log('\n--- 4. 按 segments 汇总 ---');
  Object.entries(bySeg).forEach(([seg, v]) => {
    console.log(`  segments="${seg}": ${v.rows} 行, Cost=${v.cost.toFixed(2)}`);
  });

  // 5. 仅取 segments 为空或 ad_date 的行（假设基础维度不重复）
  const baseSegs = ['', 'ad_date', 'campaign', 'adset', 'ad'];
  const baseRows = allNoSeg.filter(r => {
    const s = (r.segments || '').toLowerCase();
    return !s || baseSegs.some(b => s.includes(b));
  });
  const baseOnlyCost = baseRows.reduce((s, r) => s + (Number(r.cost) || Number(r.costUsd) || 0), 0);
  console.log('\n--- 5. 排除 segment 拆分后的汇总 ---');
  console.log(`  排除 age_date、gender 等后的行数: ${baseRows.length}`);
  console.log(`  排除后的总 Cost: ${baseOnlyCost.toFixed(2)}`);

  // 6. 仅取 segments 含 age 或 gender 的行（拆分维度）
  const segRows = allNoSeg.filter(r => {
    const s = (r.segments || '').toLowerCase();
    return s.includes('age') || s.includes('gender');
  });
  const segCost = segRows.reduce((s, r) => s + (Number(r.cost) || Number(r.costUsd) || 0), 0);
  console.log('\n--- 6. 仅 age/gender 拆分的行 ---');
  console.log(`  行数: ${segRows.length}`);
  console.log(`  总 Cost: ${segCost.toFixed(2)}`);

  // 7. 按 campaign+adset+ad+recordDate 去重（同一天同一组合只取一条）
  const dateKey = (r) => [
    r.campaignId || r.campaignName,
    r.adsetId || r.adsetName,
    r.adId || r.adName,
    r.recordDate
  ].join('|');
  const uniqueByDate = new Map();
  allNoSeg.forEach(r => {
    const k = dateKey(r);
    const cost = Number(r.cost) || Number(r.costUsd) || 0;
    const cur = uniqueByDate.get(k) || 0;
    uniqueByDate.set(k, cur + cost); // 同 key 可能有多行（不同 segment），这里仍会累加
  });
  // 改用：同一 campaign+adset+ad+date+segments 作为唯一键，只取一种 segments
  const byUnique = {};
  allNoSeg.forEach(r => {
    const seg = r.segments || 'base';
    const k = [r.campaignId, r.adsetId, r.adId, r.recordDate, seg].join('|');
    if (!byUnique[k]) byUnique[k] = r;
    else byUnique[k].cost = (Number(byUnique[k].cost) || 0) + (Number(r.cost) || Number(r.costUsd) || 0);
  });
  const uniqueCost = Object.values(byUnique).reduce((s, r) => s + (Number(r.cost) || Number(r.costUsd) || 0), 0);
  console.log('\n--- 7. 按 campaign+adset+ad+date+segments 去重后 ---');
  console.log(`  唯一键数量: ${Object.keys(byUnique).length}`);
  console.log(`  去重后总 Cost: ${uniqueCost.toFixed(2)}`);

  // 8. 正确算法：仅取 segments 为基础维度（非 age/gender 拆分）的行
  const baseOnly = allNoSeg.filter(r => {
    const s = (r.segments || '').toLowerCase();
    return !s || (!s.includes('age') && !s.includes('gender'));
  });
  const correctCost = baseOnly.reduce((s, r) => s + (Number(r.cost) || Number(r.costUsd) || 0), 0);
  console.log('\n--- 8. 仅基础维度（排除 age_date、gender_adset_date）---');
  console.log(`  行数: ${baseOnly.length}`);
  console.log(`  总 Cost: ${correctCost.toFixed(2)}`);
  console.log('\n预期正确值: 36,399.68');
  console.log(`当前脚本值: ${mergedTotal.toFixed(2)}`);
  if (Math.abs(correctCost - 36399.68) < 100) {
    console.log('\n✅ 结论: 应排除 segments 含 age_date、gender_adset_date 的拆分行，只汇总基础维度');
  }
}

async function fetchData(projectId, startDate, endDate, platform, segmentList) {
  const queryParams = new URLSearchParams({
    projectId: String(projectId),
    startDate,
    endDate,
    platform
  });
  segmentList.forEach(seg => queryParams.append('segment', seg));
  const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINT}?${queryParams}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${API_CONFIG.AUTH_TOKEN}`,
      'clientid': API_CONFIG.CLIENT_ID,
      'Content-Type': 'application/json'
    }
  });
  const result = await res.json();
  if (result.code !== 200) throw new Error(result.msg || 'API 失败');
  return result.data || [];
}

diagnose().catch(e => {
  console.error(e);
  process.exit(1);
});
