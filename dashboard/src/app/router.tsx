// src/app/router.tsx
import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import RootLayout from "./RootLayout";
import { ErrorBoundary } from "./ErrorBoundary";

const Landing = lazy(() => import("../pages/Landing"));
const HowItWorks = lazy(() => import("../pages/HowItWorks"));
const Architecture = lazy(() => import("../pages/Architecture"));
const Fallbacks = lazy(() => import("../pages/Fallbacks"));
const ControlPlane = lazy(() => import("../pages/ControlPlane"));
const About = lazy(() => import("../pages/About"));
const NotFound = lazy(() => import("../pages/NotFound"));

function PageFallback() {
  return (
    <div className="min-h-screen grid place-items-center">
      <div className="h-8 w-8 rounded-full border-2 border-border border-t-accent animate-spin" />
    </div>
  );
}

function withSuspense(node: React.ReactNode) {
  return <Suspense fallback={<PageFallback />}>{node}</Suspense>;
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/", element: withSuspense(<Landing />) },
      { path: "/how-it-works", element: withSuspense(<HowItWorks />) },
      { path: "/architecture", element: withSuspense(<Architecture />) },
      { path: "/fallbacks", element: withSuspense(<Fallbacks />) },
      { path: "/dashboard", element: withSuspense(<ControlPlane />) },
      { path: "/about", element: withSuspense(<About />) },
      { path: "*", element: withSuspense(<NotFound />) },
    ],
  },
]);

export default function AppRouter() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
