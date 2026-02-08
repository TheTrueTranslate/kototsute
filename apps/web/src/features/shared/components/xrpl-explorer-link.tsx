import * as React from "react";
import { cn } from "../lib/utils";
import styles from "./xrpl-explorer-link.module.css";

const EXPLORER_BASE_BY_RESOURCE = {
  account: "https://testnet.xrpl.org/accounts",
  transaction: "https://testnet.xrpl.org/transactions"
} as const;

export type XrplExplorerResource = keyof typeof EXPLORER_BASE_BY_RESOURCE;

type XrplExplorerLinkProps = {
  value: string;
  resource?: XrplExplorerResource;
  className?: string;
  children?: React.ReactNode;
};

export const buildXrplExplorerUrl = (
  value: string,
  resource: XrplExplorerResource = "account"
) => `${EXPLORER_BASE_BY_RESOURCE[resource]}/${value}`;

export default function XrplExplorerLink({
  value,
  resource = "account",
  className,
  children
}: XrplExplorerLinkProps) {
  return (
    <a
      className={cn(styles.link, className)}
      href={buildXrplExplorerUrl(value, resource)}
      target="_blank"
      rel="noreferrer"
      data-xrpl-explorer-link="true"
    >
      {children ?? value}
    </a>
  );
}
