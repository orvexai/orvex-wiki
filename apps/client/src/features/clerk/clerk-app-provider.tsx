import { ReactNode } from "react";
import { ClerkProvider } from "@clerk/react";
import { getClerkPublishableKey, isClerkTenancy } from "@/lib/config.ts";

interface ClerkAppProviderProps {
  children: ReactNode;
}

// Conditional ClerkProvider gate (CS §6 client-shallow, port fork
// clerk-app-provider.tsx#L1-L19 @fork-HEAD 050187…). Non-Clerk deployments
// (flag off, or flag on with no publishable key) get a transparent
// pass-through: children render unchanged and no ClerkProvider mounts.
export function ClerkAppProvider({ children }: ClerkAppProviderProps) {
  const publishableKey = getClerkPublishableKey();

  if (!isClerkTenancy() || !publishableKey) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider>
  );
}
