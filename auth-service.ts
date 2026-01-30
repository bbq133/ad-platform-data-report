import { GOOGLE_SHEETS_CONFIG } from './api-config';
import { ProjectOption } from './api-config';

// 用户信息接口
export interface UserInfo {
    username: string;
    displayName: string;
    projectKeywords: string[];
}

// Google Sheets 行数据接口
interface SheetRow {
    username: string;
    password: string;
    projectKeywords: string;
    displayName?: string;
}

/**
 * 解析 Google Sheets 的 JSON 响应
 * Google Sheets 返回的是一个特殊格式的 JSON,需要解析
 */
function parseGoogleSheetsResponse(responseText: string): SheetRow[] {
    try {
        // 移除 Google Sheets 的 JSONP 包装
        // 格式通常为: /*O_o*/google.visualization.Query.setResponse({...});
        const start = responseText.indexOf('{');
        const end = responseText.lastIndexOf('}');

        if (start === -1 || end === -1) {
            throw new Error('Invalid JSON format');
        }

        const jsonString = responseText.substring(start, end + 1);
        const data = JSON.parse(jsonString);

        const rows: SheetRow[] = [];
        const table = data.table;

        if (!table || !table.rows) {
            return rows;
        }

        // 解析每一行数据
        // c 是 cells 数组
        for (const row of table.rows) {
            if (!row.c) continue;

            const cells = row.c;
            // 检查单元格是否为 null
            const username = cells[0]?.v ? String(cells[0].v) : '';
            const password = cells[1]?.v ? String(cells[1].v) : '';
            const projectKeywords = cells[2]?.v ? String(cells[2].v) : '';
            const displayName = cells[3]?.v ? String(cells[3].v) : '';

            if (username) {
                rows.push({
                    username,
                    password, // 明文密码
                    projectKeywords,
                    displayName: displayName || username
                });
            }
        }

        return rows;
    } catch (error) {
        console.error('解析 Google Sheets 数据失败:', error);
        throw new Error('无法读取权限配置,请检查 Google Sheets 设置');
    }
}

/**
 * 从 Google Sheets 验证用户并获取权限信息
 */
export async function fetchUserPermissions(
    username: string,
    password: string
): Promise<UserInfo> {
    try {
        const url = `${GOOGLE_SHEETS_CONFIG.API_URL}&sheet=${GOOGLE_SHEETS_CONFIG.SHEET_NAME}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error('无法连接到权限配置服务');
        }

        const text = await response.text();
        const data = parseGoogleSheetsResponse(text);

        // 明文密码对比
        // 注意：实际输入和表格数据都转为字符串进行比较，去除首尾空格
        const user = data.find(row =>
            row.username.trim() === username.trim() &&
            row.password.trim() === password.trim()
        );

        if (!user) {
            throw new Error('账号或密码错误');
        }

        // 解析项目关键词
        const keywords = user.projectKeywords
            .split(',')
            .map(k => k.trim())
            .filter(k => k.length > 0);

        return {
            username: user.username,
            displayName: user.displayName || user.username,
            projectKeywords: keywords
        };
    } catch (error) {
        console.error('Login error:', error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error('登录验证失败,请稍后重试');
    }
}

/**
 * 根据关键词过滤项目列表
 */
export function filterProjectsByKeywords(
    projects: ProjectOption[],
    keywords: string[]
): ProjectOption[] {
    // 如果关键词为空,返回空数组
    // Modify: 如果没有关键词，可能意味着无权访问任何项目
    if (!keywords || keywords.length === 0) {
        return [];
    }

    // 如果关键词包含 '*'，返回所有项目
    if (keywords.includes('*')) {
        return projects;
    }

    // 模糊匹配项目名称
    // 规则：只要项目名称包含任一关键词即可
    return projects.filter(project =>
        keywords.some(keyword => {
            if (!keyword) return false;
            return project.projectName.toLowerCase().includes(keyword.toLowerCase());
        })
    );
}

/**
 * 保存用户登录状态到 sessionStorage
 */
export function saveUserSession(userInfo: UserInfo): void {
    sessionStorage.setItem('currentUser', JSON.stringify(userInfo));
}

/**
 * 从 sessionStorage 获取当前登录用户
 */
export function getUserSession(): UserInfo | null {
    try {
        const data = sessionStorage.getItem('currentUser');
        return data ? JSON.parse(data) : null;
    } catch {
        return null;
    }
}

/**
 * 清除登录状态
 */
export function clearUserSession(): void {
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('systemConfig');
}

// System Config Interface
export interface SystemConfig {
    [key: string]: string;
}

/**
 * Fetch system configuration from Google Sheets
 */
export async function fetchSystemConfig(): Promise<SystemConfig> {
    try {
        const url = `${GOOGLE_SHEETS_CONFIG.API_URL}&sheet=${GOOGLE_SHEETS_CONFIG.CONFIG_SHEET_NAME}`;
        const response = await fetch(url);

        if (!response.ok) {
            console.warn('Failed to fetch system config');
            return {};
        }

        const text = await response.text();
        const data = parseGoogleSheetsResponse(text); // Reuse existing parser logic, though raw rows might differ slightly

        // Transform rows into key-value map
        const config: SystemConfig = {};
        // The parser expects specific columns for UserInfo, but here we just need generic parsing or we reuse the parser if columns match.
        // Actually, parseGoogleSheetsResponse returns SheetRow[]. We need to adapt it or write a generic parser.
        // Let's modify parseGoogleSheetsResponse to be more generic or parse manually here.
        // To save time and code, let's adapt the parser to be generic or write a specific one for config.
        // Since we can't easily change the private 'parseGoogleSheetsResponse' signature without breaking 'fetchUserPermissions', 
        // let's copy the parsing logic for config specifically.

        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start === -1 || end === -1) return {};

        const jsonString = text.substring(start, end + 1);
        const jsonData = JSON.parse(jsonString);
        const table = jsonData.table;

        if (table && table.rows) {
            for (const row of table.rows) {
                if (row.c && row.c[0] && row.c[1]) {
                    const key = row.c[0]?.v ? String(row.c[0].v).trim() : '';
                    const value = row.c[1]?.v ? String(row.c[1].v).trim() : '';
                    if (key) {
                        config[key] = value;
                    }
                }
            }
        }

        return config;

    } catch (error) {
        console.error('Error fetching system config:', error);
        return {};
    }
}

export function saveSystemConfig(config: SystemConfig): void {
    sessionStorage.setItem('systemConfig', JSON.stringify(config));
}

export function getSystemConfig(): SystemConfig | null {
    try {
        const data = sessionStorage.getItem('systemConfig');
        return data ? JSON.parse(data) : null;
    } catch {
        return null;
    }
}
