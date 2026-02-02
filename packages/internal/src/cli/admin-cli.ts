import prompts, { type PromptObject } from "prompts";
import { grantAdminByEmail } from "./admin-actions.js";

type PromptLike = (questions: PromptObject | PromptObject[]) => Promise<Record<string, any>>;

export const runAdminCli = async (input?: {
  prompt?: PromptLike;
  projectId?: string;
}) => {
  const prompt = input?.prompt ?? prompts;
  const projectId = input?.projectId ?? process.env.FIREBASE_PROJECT_ID ?? "kototsute";
  const response = await prompt({
    type: "text",
    name: "email",
    message: "管理者にするユーザーのメールアドレス",
    validate: (value: string) => (value?.trim() ? true : "メールアドレスを入力してください")
  });

  const email = response?.email?.trim();
  if (!email) {
    return { skipped: true } as const;
  }

  const result = await grantAdminByEmail({ email, projectId });
  return { ...result, email };
};
