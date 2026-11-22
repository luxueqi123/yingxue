import OAuthLoginSettings from "./oauth-login-settings";

export default function GoogleLoginSettings({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    return <OAuthLoginSettings provider="google" onDirtyChange={onDirtyChange} />;
}
