// src/app/RootLayout.tsx
import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import Nav from "./Nav";
import Footer from "./Footer";
import AmbientBackground from "../components/background/AmbientBackground";
import { GuideRails } from "../components/marketing/aura";
import { useReducedMotion } from "../hooks/useReducedMotion";

// The Control Plane is a fixed-viewport application shell, not a
// scrolling document — it gets no Nav/Footer chrome and manages its own
// full-bleed layout (see pages/ControlPlane.tsx), including its own
// dimmer "subtle" ambient variant.
const CHROMELESS_ROUTES = ["/dashboard"];

export default function RootLayout() {
  const location = useLocation();
  const chromeless = CHROMELESS_ROUTES.some((r) => location.pathname.startsWith(r));

  // Mounted once here so <html data-reduce-motion> is set app-wide before
  // any background/GSAP layer reads it.
  useReducedMotion();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  if (chromeless) {
    return <Outlet />;
  }

  return (
    <div className="relative min-h-screen flex flex-col">
      <AmbientBackground variant="full" />
      <GuideRails />
      <Nav />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
