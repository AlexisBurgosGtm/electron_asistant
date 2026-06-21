const CURSOR_API_BASE = 'https://api.cursor.com';

function buildAuthHeader(apiKey) {
  const token = Buffer.from(`${apiKey}:`).toString('base64');
  return `Basic ${token}`;
}

async function cursorRequest(apiKey, path, { method = 'GET', body } = {}) {
  const response = await fetch(`${CURSOR_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: buildAuthHeader(apiKey),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    const message = data.message || data.error || `Error ${response.status}`;
    const err = new Error(typeof message === 'string' ? message : `Error ${response.status}`);
    err.status = response.status;
    throw err;
  }

  return data;
}

async function validateApiKey(apiKey) {
  try {
    const me = await cursorRequest(apiKey, '/v1/me');
    return { valid: true, type: 'user', profile: me };
  } catch (userErr) {
    if (userErr.status && userErr.status !== 401 && userErr.status !== 403) {
      throw userErr;
    }
  }

  const members = await cursorRequest(apiKey, '/teams/members');
  return { valid: true, type: 'admin', members: members.teamMembers || [] };
}

function getMonthRangeMs() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    startDate: start.getTime(),
    endDate: now.getTime(),
  };
}

function sumDailyUsage(data = []) {
  return data.reduce((acc, row) => {
    acc.chatRequests += row.chatRequests || 0;
    acc.composerRequests += row.composerRequests || 0;
    acc.agentRequests += row.agentRequests || 0;
    acc.subscriptionIncludedReqs += row.subscriptionIncludedReqs || 0;
    acc.usageBasedReqs += row.usageBasedReqs || 0;
    acc.apiKeyReqs += row.apiKeyReqs || 0;
    acc.totalLinesAdded += row.totalLinesAdded || 0;
    acc.totalLinesDeleted += row.totalLinesDeleted || 0;
    return acc;
  }, {
    chatRequests: 0,
    composerRequests: 0,
    agentRequests: 0,
    subscriptionIncludedReqs: 0,
    usageBasedReqs: 0,
    apiKeyReqs: 0,
    totalLinesAdded: 0,
    totalLinesDeleted: 0,
  });
}

async function getUsage(apiKey) {
  const validation = await validateApiKey(apiKey);
  const { startDate, endDate } = getMonthRangeMs();

  let spend = null;
  let dailyUsage = null;
  let usageEvents = null;

  try {
    spend = await cursorRequest(apiKey, '/teams/spend', {
      method: 'POST',
      body: { page: 1, pageSize: 100 },
    });
  } catch (err) {
    if (err.status !== 403 && err.status !== 404) throw err;
  }

  try {
    dailyUsage = await cursorRequest(apiKey, '/teams/daily-usage-data', {
      method: 'POST',
      body: { startDate, endDate },
    });
  } catch (err) {
    if (err.status !== 403 && err.status !== 404) throw err;
  }

  try {
    usageEvents = await cursorRequest(apiKey, '/teams/filtered-usage-events', {
      method: 'POST',
      body: { startDate, endDate, page: 1, pageSize: 50 },
    });
  } catch (err) {
    if (err.status !== 403 && err.status !== 404) throw err;
  }

  const totals = sumDailyUsage(dailyUsage?.data || []);
  const teamSpend = spend?.teamMemberSpend || [];
  const totalSpendCents = teamSpend.reduce((sum, m) => sum + (m.overallSpendCents || 0), 0);
  const onDemandSpendCents = teamSpend.reduce((sum, m) => sum + (m.spendCents || 0), 0);

  return {
    validation,
    period: { startDate, endDate },
    spend: spend ? {
      subscriptionCycleStart: spend.subscriptionCycleStart,
      totalMembers: spend.totalMembers,
      totalSpendCents,
      onDemandSpendCents,
      members: teamSpend,
    } : null,
    dailyUsage: dailyUsage?.data || [],
    totals,
    usageEvents: usageEvents?.usageEvents || usageEvents?.data || [],
    hasAdminUsage: Boolean(spend || dailyUsage),
  };
}

function maskApiKey(apiKey) {
  if (!apiKey) return '';
  if (apiKey.length <= 8) return '••••••••';
  return `${apiKey.slice(0, 6)}••••${apiKey.slice(-4)}`;
}

module.exports = {
  validateApiKey,
  getUsage,
  maskApiKey,
};
