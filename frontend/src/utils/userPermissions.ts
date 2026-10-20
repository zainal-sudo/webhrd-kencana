export type PermissionAction = "view" | "insert" | "edit" | "delete";
export interface UserPermissionRow {
  men_id: number;
  men_nama: string;
  men_keterangan: string | null;
  men_modul: number;
  view: boolean;
  insert: boolean;
  edit: boolean;
  delete: boolean;
}
const actions: PermissionAction[] = ["view", "insert", "edit", "delete"];
export function permissionFromApi(row: Record<string, any>): UserPermissionRow {
  const result = { men_id: Number(row.men_id), men_nama: row.men_nama, men_keterangan: row.men_keterangan, men_modul: Number(row.men_modul) || 1 } as UserPermissionRow;
  for (const action of actions) {
    const value = action === "view" ? row.view : row[action] ?? row[`hak_men_${action}`];
    if (value !== "Y" && value !== "N") throw new Error("Data hak akses harus menggunakan flag Y/N.");
    result[action] = value === "Y";
  }
  return result;
}
export function permissionToApi(row: UserPermissionRow) {
  return { men_id: row.men_id, view: row.view ? "Y" : "N", insert: row.insert ? "Y" : "N", edit: row.edit ? "Y" : "N", delete: row.delete ? "Y" : "N" };
}
export function changePermission(row: UserPermissionRow, action: PermissionAction, checked: boolean) {
  row[action] = checked;
  if (action === "view" && !checked) row.insert = row.edit = row.delete = false;
  else if (checked) row.view = true;
}
