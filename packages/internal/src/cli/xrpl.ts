import { runXrplCli } from "./xrpl-cli.js";

const run = async () => {
  const result = await runXrplCli();
  if ("skipped" in result && result.skipped) {
    console.log("キャンセルしました。");
    return;
  }
  console.log(`送信完了: ${result.txHash}`);
};

run().catch((error) => {
  console.error("XRPL操作に失敗しました:", error);
  process.exitCode = 1;
});
