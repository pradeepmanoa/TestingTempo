import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import "./rio.css";
import App from "./App.tsx";
import FrameRenderer from "./FrameRenderer.tsx";
import { initElementSelector } from "./elementSelector";
import { initKeyboardBridge } from "./keyboardBridge";

initElementSelector();
initKeyboardBridge();

const basename = import.meta.env.BASE_PATH?.replace(/\/$/, '') || '';

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/pages/:pageId/:frameId" element={<FrameRenderer />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
