import { useEffect } from "react";

export default function WelcomePage() {
    useEffect(() => { window.location.replace("/home"); }, []);
    return null;
}
