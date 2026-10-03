import type { Access, AccessArgs, FieldAccess, PayloadRequest, Where } from 'payload'

import type { User } from '../payload-types'

type AppUser = User

export function getUserCompanyId(user: AppUser | null | undefined): number | null {
  if (!user?.company) return null
  return typeof user.company === 'object' ? user.company.id : user.company
}

export function isStaff(user: AppUser | null | undefined): boolean {
  return user?.role === 'admin' || user?.role === 'sales'
}

export const anyone: Access = () => true

export const authenticated: Access = ({ req: { user } }) => Boolean(user)

export const staffOnly: Access = ({ req: { user } }) => isStaff(user as AppUser)

export const adminPanelAccess = ({ req: { user } }: AccessArgs): boolean =>
  isStaff(user as AppUser)

export const staffOrSelfUser: Access = ({ req: { user }, id }) => {
  const u = user as AppUser
  if (!u) return false
  if (isStaff(u)) return true
  return { id: { equals: u.id } }
}

export const companyReadAccess =
  (companyField = 'company'): Access =>
  ({ req: { user } }) => {
    const u = user as AppUser
    if (!u) return false
    if (isStaff(u)) return true
    const companyId = getUserCompanyId(u)
    if (u.role === 'vendor-buyer' && companyId) {
      return { [companyField]: { equals: companyId } }
    }
    return false
  }

/** Approved vendor-buyer reads scoped to own company (staff bypass). */
export const approvedVendorCompanyReadAccess =
  (companyField = 'company'): Access =>
  ({ req: { user } }) => {
    const u = user as AppUser
    if (!u) return false
    if (isStaff(u)) return true
    if (u.role !== 'vendor-buyer' || !u.approved) return false
    const companyId = getUserCompanyId(u)
    if (!companyId) return false
    return { [companyField]: { equals: companyId } }
  }

export const companyWriteAccess =
  (companyField = 'company'): Access =>
  ({ req: { user } }) => {
    const u = user as AppUser
    if (!u) return false
    if (isStaff(u)) return true
    const companyId = getUserCompanyId(u)
    if (u.role === 'vendor-buyer' && companyId) {
      return { [companyField]: { equals: companyId } }
    }
    return false
  }

/** Vendor-buyer writes scoped to own company; requires an approved user (staff bypass). */
export const approvedVendorCompanyWriteAccess =
  (companyField = 'company'): Access =>
  ({ req: { user } }) => {
    const u = user as AppUser
    if (!u) return false
    if (isStaff(u)) return true
    if (u.role !== 'vendor-buyer' || !u.approved) return false
    const companyId = getUserCompanyId(u)
    if (!companyId) return false
    return { [companyField]: { equals: companyId } }
  }

export const catalogReadAccess: Access = ({ req: { user } }) => {
  const u = user as AppUser
  if (!u) return false
  return isStaff(u) || u.role === 'vendor-buyer'
}

/** Catalog media/PDFs: approved vendors and staff only (blocks anonymous + pending vendors). */
export const catalogMediaReadAccess: Access = ({ req: { user } }) => {
  const u = user as AppUser
  if (!u) return false
  if (isStaff(u)) return true
  return u.role === 'vendor-buyer' && u.approved === true
}

export type CatalogMediaAuthFailure = 'unauthenticated' | 'forbidden'

export function getCatalogMediaAuthFailure(
  user: AppUser | null | undefined,
): CatalogMediaAuthFailure | null {
  if (!user) return 'unauthenticated'
  if (isStaff(user)) return null
  if (user.role === 'vendor-buyer' && user.approved === true) return null
  return 'forbidden'
}

export const priceListReadAccess: Access = ({ req: { user } }) => {
  const u = user as AppUser
  if (!u) return false
  if (isStaff(u)) return true
  const companyId = getUserCompanyId(u)
  if (u.role === 'vendor-buyer' && companyId) {
    const where: Where = {
      or: [
        { kind: { equals: 'standard' } },
        {
          and: [{ kind: { equals: 'company' } }, { company: { equals: companyId } }],
        },
      ],
    }
    return where
  }
  return false
}

export const staffFieldAccess: FieldAccess = ({ req: { user } }) => isStaff(user as AppUser)

export async function assertVendorCanLogin(req: PayloadRequest, user: AppUser): Promise<void> {
  if (user.role !== 'vendor-buyer') return
  if (!user.approved) {
    throw new Error('Your account is pending administrator approval.')
  }
  const companyId = getUserCompanyId(user)
  if (!companyId) {
    throw new Error('Vendor account is missing a company assignment.')
  }
  const company = await req.payload.findByID({
    collection: 'companies',
    id: companyId,
    overrideAccess: true,
  })
  if (!company?.accountApproved) {
    throw new Error('Your company account is pending approval.')
  }
}
