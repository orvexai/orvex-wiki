import { Button } from "@mantine/core";

export interface SsoLoginButtonProps {
  label: string;
  loginUrl: string;
}

/**
 * Navigates to the server-derived SSO login URL on click. The client never
 * constructs or mints an auth token itself — it only reflects the server's
 * verdict (po-ruling 10 / AC6).
 */
export function SsoLoginButton({ label, loginUrl }: SsoLoginButtonProps) {
  const handleClick = () => {
    window.location.href = loginUrl;
  };

  return (
    <Button onClick={handleClick} variant="default" fullWidth>
      {label}
    </Button>
  );
}

export default SsoLoginButton;
