// /preview — Website Builder Preview route.
//
// Renders the same homepage content as /, but with relaxed CSP frame-ancestors
// (configured in next.config.ts) so the ERP admin panel can embed it in an iframe.
// All other pages keep X-Frame-Options: DENY and frame-ancestors 'none'.

export { default, dynamic } from '../page';
