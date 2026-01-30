export type TaskItem = {
  id: string;
  description: string;
  title?: string;
  priority?: number;
  requiresWallet?: boolean;
};

export type TodoMaster = {
  owner: TaskItem[];
  heir: TaskItem[];
};
