import { runXrplCli } from "./xrpl-cli.js";

const run = async () => {
  const result = await runXrplCli();
  if ("txHash" in result) {
    console.log(`送信完了: ${result.txHash}`);
    return;
  }
  console.log("キャンセルしました。");
};

run().catch((error) => {
  console.error("XRPL操作に失敗しました:", error);
  process.exitCode = 1;
});
