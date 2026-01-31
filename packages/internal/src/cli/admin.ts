import { runAdminCli } from "./admin-cli.js";

const run = async () => {
  const result = await runAdminCli();
  if ("skipped" in result && result.skipped) {
    console.log("キャンセルしました。");
    return;
  }
  const status = result.updated ? "付与済み" : "既に付与済み";
  console.log(`${status}: ${result.email} (uid: ${result.uid})`);
};

run().catch((error) => {
  console.error("管理者付与に失敗しました:", error);
  process.exitCode = 1;
});
