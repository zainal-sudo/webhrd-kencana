/** Satu menu pada tabel `tmenu` (dikenali lewat `men_nama` = nama form Delphi). */
export interface MenuIjin {
  men_id: number;
  men_nama: string;
  label: string;
  can_insert: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

/** Identitas pengguna hasil login (tabel `tuser`). */
export interface AuthUser {
  user_kode: string;
  user_nama: string;
  /** Nilai `tuser.user_akses` — kode pabrik/cabang (mis. P01, P4) */
  user_akses: string | null;
  cabang: string | null;
}

/** Satu simpul sidebar. */
export interface SidebarNode {
  key: string;
  label: string;
  icon: string;
  route?: string;
  form?: string;
  can_insert?: boolean;
  can_edit?: boolean;
  can_delete?: boolean;
  children?: SidebarNode[];
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
  menus: MenuIjin[];
}

export interface Pagination {
  page: number;
  per_page: number;
  total: number;
  last_page: number;
}

export interface Paginated<T> {
  success: boolean;
  message: string;
  data: T[];
  pagination: Pagination;
}

/** Definisi kolom tabel browse (server-side). */
export interface BrowseColumn {
  key: string;
  label: string;
  width?: string;
  /** "image" merender thumbnail (nilai kolom = NIK untuk foto karyawan) */
  type?: "text" | "date" | "datetime" | "number" | "align-right" | "image";
  align?: "left" | "center" | "right";
  sortable?: boolean;
  filterable?: boolean;
}

export interface LookupRow {
  Nik: string;
  Nama: string;
  KodeAbsensi?: string;
  Bagian?: string;
  Pabrik?: string;
  Jabatan?: string;
  Aktif?: number;
}

/** Dropdown yang dikembalikan `/master/lookup`. */
export interface LookupItem {
  Kode: string | number;
  Nama: string;
  [key: string]: unknown;
}
