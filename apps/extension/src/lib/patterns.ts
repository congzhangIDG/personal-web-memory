// 黑名单匹配工具
// 支持通配符 * 模式 + 简单主机名匹配

/**
 * 将通配符模式（仅支持 *）转为正则表达式
 */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/**
 * 判断 URL 是否匹配黑名单中的任一规则。
 *
 * 匹配逻辑：
 * - 包含 * 的规则 → 作为 glob 模式匹配完整 URL
 * - 不含 * 的规则 → 匹配 hostname（子串包含即可）
 */
export function isBlacklisted(url: string, patterns: string[]): boolean {
  if (!patterns || patterns.length === 0) return false;

  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }

  for (const pat of patterns) {
    const p = pat.trim();
    if (!p) continue;

    if (p.includes('*')) {
      // 通配符模式 → 匹配完整 URL
      const regex = globToRegex(p);
      if (regex.test(url)) return true;
    } else {
      // 无通配符 → 匹配 hostname（包含即可）
      if (hostname.includes(p)) return true;
    }
  }

  return false;
}
