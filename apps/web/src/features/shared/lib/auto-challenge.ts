type AutoChallengeParams = {
  isOpen: boolean;
  mode: "register" | "verify";
  hasWallet: boolean;
  hasChallenge: boolean;
  isLoading: boolean;
  isVerified: boolean;
};

export const shouldAutoRequestChallenge = ({
  isOpen,
  mode,
  hasWallet,
  hasChallenge,
  isLoading,
  isVerified
}: AutoChallengeParams) =>
  isOpen &&
  mode === "verify" &&
  hasWallet &&
  !hasChallenge &&
  !isLoading &&
  !isVerified;
