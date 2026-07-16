/**
 * DomainService — ERP 唯一的 URL 构造权威。
 *
 * 规则：
 *   ERP 内部导航  → 永远使用相对路径（/settings/brand 而非 https://erp.xxx/settings/brand）
 *   跨服务链接    → 只用环境变量（WEBSITE_URL / process.env），永远不读 brand.website_domain
 *   brand.website_domain / brand.erp_domain / brand.api_domain 只用于显示/编辑，绝不用于跳转
 *
 * 任何需要绝对 URL 的地方都必须通过这个模块，不得在组件内写死域名。
 */

/** 构造 ERP 内部相对路径，保证以 / 开头。用于 router.push / Link href。 */
export function erpPath(pathname: string): string {
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

/**
 * 服务端专用：从 WEBSITE_URL 环境变量获取 Website 源（去除末尾 /）。
 * 不暴露给客户端，不读取 brand_settings 中的 website_domain。
 */
export function getWebsiteOrigin(): string {
  return (process.env.WEBSITE_URL ?? '').replace(/\/$/, '');
}

/**
 * 服务端专用：构造 Website 的绝对 URL（用于 API proxy 等服务间通信）。
 * 不用于浏览器导航。
 */
export function websiteServiceUrl(pathname: string): string {
  const origin = getWebsiteOrigin();
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${origin}${path}`;
}

/**
 * 服务端专用：构造 ERP 内部 API URL（用于服务端 fetch，不用于客户端导航）。
 * 默认使用 BOT_RELAY_URL / 内部地址，不读取 brand.erp_domain。
 */
export function erpInternalApiUrl(pathname: string): string {
  const base = (process.env.ERP_INTERNAL_URL ?? 'http://localhost:3001').replace(/\/$/, '');
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${base}${path}`;
}
