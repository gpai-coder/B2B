/** True when Playwright targets a deployed site (no local Postgres seed helpers). */
export const isRemoteE2ETarget = Boolean(process.env.B2B_BASE_URL)
