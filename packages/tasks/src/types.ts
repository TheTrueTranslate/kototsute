export type TaskItem = {
  id: string;
  title: string;
  description?: string;
  priority?: number;
  requiresWallet?: boolean;
};

export type TodoMaster = {
  shared: TaskItem[];
  owner: TaskItem[];
  heir: TaskItem[];
};
