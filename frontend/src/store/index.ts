import { create } from "zustand";
import type { JobListItem } from "../types";

interface AppState {
  jobs: JobListItem[];
  total: number;
  page: number;
  pageSize: number;
  statusFilter: string;
  search: string;
  sortBy: string;
  sortDir: string;
  setJobs: (jobs: JobListItem[], total: number) => void;
  setPage: (p: number) => void;
  setStatusFilter: (s: string) => void;
  setSearch: (s: string) => void;
  setSort: (by: string, dir: string) => void;
}

export const useStore = create<AppState>((set) => ({
  jobs: [],
  total: 0,
  page: 1,
  pageSize: 20,
  statusFilter: "",
  search: "",
  sortBy: "queued_at",
  sortDir: "desc",
  setJobs: (jobs, total) => set({ jobs, total }),
  setPage: (page) => set({ page }),
  setStatusFilter: (statusFilter) => set({ statusFilter, page: 1 }),
  setSearch: (search) => set({ search, page: 1 }),
  setSort: (sortBy, sortDir) => set({ sortBy, sortDir }),
}));
