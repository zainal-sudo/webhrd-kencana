import api from "./axios";

export interface MenuTreeItem {
  label: string;
  to: string;
  icon?: string;
  menu_id: number;
}

export interface MenuGroup {
  label: string;
  icon?: string;
  items: MenuTreeItem[];
}

export interface MenuItem {
  MEN_ID: number;
  menu_name: string;
  nama: string;
  men_route: string;
  men_icon: string;
  men_parent_id: number;
  men_order: number;
}

export interface HakMenu {
  menu_id: number;
  insert_: "Y" | "N";
  edit_: "Y" | "N";
  delete_: "Y" | "N";
}

export const menuApi = {
  getTree: async (): Promise<MenuGroup[]> => {
    const { data } = await api.get<{ success: boolean; data: MenuGroup[] }>(
      "/menu/tree",
    );
    return data.data;
  },

  getItems: async (): Promise<MenuItem[]> => {
    const { data } = await api.get<{ success: boolean; data: MenuItem[] }>(
      "/menu/items",
    );
    return data.data;
  },

  getHakUser: async (kode: string): Promise<HakMenu[]> => {
    const { data } = await api.get<{ success: boolean; data: HakMenu[] }>(
      `/menu/hak-user/${encodeURIComponent(kode)}`,
    );
    return data.data;
  },
};
