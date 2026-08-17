import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import AppRouter from "./app/router";
import { SourceProvider } from "./app/SourceProvider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SourceProvider>
      <AppRouter />
    </SourceProvider>
  </StrictMode>
);
