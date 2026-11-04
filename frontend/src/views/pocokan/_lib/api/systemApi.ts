import apiClient from "./axios";

export interface SystemInfo {
  name: string;
  version: string;
  changelog: string[];
  all_changelogs: Record<string, string[]>;
}

export const systemApi = {
  getInfo: async (): Promise<SystemInfo> => {
    const { data } = await apiClient.get("/system/info");
    return data.data;
  },
};
