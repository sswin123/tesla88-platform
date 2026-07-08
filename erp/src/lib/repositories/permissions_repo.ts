import pool from '@/lib/db';

export interface RolePermissionRow {
  id: number;
  role: string;
  permission: string;
  granted: boolean;
  updated_by: string | null;
  updated_at: string;
}

export async function getRolePermissions(): Promise<RolePermissionRow[]> {
  const { rows } = await pool.query<RolePermissionRow>(
    `SELECT id, role, permission, granted, updated_by, updated_at
       FROM role_permissions
      ORDER BY role, permission`
  );
  return rows;
}

export async function setRolePermission(
  role: string,
  permission: string,
  granted: boolean,
  updatedBy: string
): Promise<void> {
  await pool.query(
    `INSERT INTO role_permissions (role, permission, granted, updated_by)
          VALUES ($1, $2, $3, $4)
     ON CONFLICT (role, permission)
     DO UPDATE SET granted = $3, updated_by = $4, updated_at = NOW()`,
    [role, permission, granted, updatedBy]
  );
}
