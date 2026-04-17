import { StrictMode } from "react";
import { BrowserRouter } from "react-router";
import "./rio.css";
import "./App.css";

export default function ExportRoot({ children }: { children: React.ReactNode }) {
  return (
    <StrictMode>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </StrictMode>
  );
}
